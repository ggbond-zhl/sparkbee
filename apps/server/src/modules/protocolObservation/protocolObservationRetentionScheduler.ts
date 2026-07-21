import pino from "pino";
import type { Logger } from "pino";

import { noopErrorReporter } from "../../config/errorReporter";
import type { ErrorReporter } from "../../config/errorReporter";
import type { ServerDatabase } from "../../db";
import {
  HistoricalObservationEventRepository,
  ProtocolMessageRepository,
} from "./protocolObservation.repo";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 7 * DAY_MS;

export class ProtocolObservationRetentionScheduler {
  private readonly messageRepository: ProtocolMessageRepository;
  private readonly eventRepository: HistoricalObservationEventRepository;
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
    this.messageRepository = new ProtocolMessageRepository(database);
    this.eventRepository = new HistoricalObservationEventRepository(database);
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

  async cleanup(): Promise<{ messages: number; events: number }> {
    const before = new Date(
      (this.options.now?.() ?? new Date()).getTime() - RETENTION_MS,
    );
    const batchSize = this.options.batchSize ?? 1_000;
    return {
      messages: await deleteAllExpired(
        (limit) => this.messageRepository.deleteExpired(before, limit),
        batchSize,
      ),
      events: await deleteAllExpired(
        (limit) => this.eventRepository.deleteExpired(before, limit),
        batchSize,
      ),
    };
  }

  private async run(): Promise<void> {
    try {
      await this.cleanup();
    } catch (error) {
      const context = { module: "protocolObservationRetention" };
      this.logger.error({
        event: "protocol-observation.retention.failed",
        error,
      }, "Failed to remove expired protocol observations");
      this.errorReporter.captureException(error, context);
    }
    if (this.stopped) return;
    this.timer = setTimeout(
      () => void this.run(),
      this.options.intervalMs ?? DAY_MS,
    );
    this.timer.unref();
  }
}

async function deleteAllExpired(
  deleteBatch: (limit: number) => Promise<number>,
  batchSize: number,
): Promise<number> {
  let total = 0;
  while (true) {
    const deleted = await deleteBatch(batchSize);
    total += deleted;
    if (deleted < batchSize) return total;
  }
}
