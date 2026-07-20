import pino from "pino";
import type { Logger } from "pino";

import { noopErrorReporter } from "../../config/errorReporter";
import type { ErrorReporter } from "../../config/errorReporter";
import type { ServerDatabase } from "../../db";
import { ActorLogRepository } from "./actorLog.repo";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 7 * DAY_MS;

export class ActorLogRetentionScheduler {
  private readonly repository: ActorLogRepository;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private readonly logger: Logger;
  private readonly errorReporter: ErrorReporter;

  constructor(
    database: ServerDatabase,
    private readonly options: {
      intervalMs?: number;
      batchSize?: number;
      now?: () => Date;
      logger?: Logger;
      errorReporter?: ErrorReporter;
    } = {},
  ) {
    this.repository = new ActorLogRepository(database);
    this.logger = options.logger ?? pino({ level: "silent" });
    this.errorReporter = options.errorReporter ?? noopErrorReporter;
  }

  start(): void {
    this.stopped = false;
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async cleanup(): Promise<number> {
    const before = new Date((this.options.now?.() ?? new Date()).getTime() - RETENTION_MS);
    const batchSize = this.options.batchSize ?? 1_000;
    let total = 0;
    while (true) {
      const deleted = await this.repository.deleteExpired(before, batchSize);
      total += deleted;
      if (deleted < batchSize) return total;
    }
  }

  private async run(): Promise<void> {
    try {
      await this.cleanup();
    } catch (error) {
      const context = { module: "actorLogRetention" };
      this.logger.error({
        event: "actor-log.retention.failed",
        error,
      }, "Failed to remove expired Actor logs");
      this.errorReporter.captureException(error, context);
    }
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.run(), this.options.intervalMs ?? DAY_MS);
    this.timer.unref();
  }
}
