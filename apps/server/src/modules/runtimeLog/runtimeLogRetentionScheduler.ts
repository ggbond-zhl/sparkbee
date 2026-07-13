import type { ServerDatabase } from "../../db";
import { RuntimeLogRepository } from "./runtimeLog.repo";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 7 * DAY_MS;

export class RuntimeLogRetentionScheduler {
  private readonly repository: RuntimeLogRepository;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    database: ServerDatabase,
    private readonly options: { intervalMs?: number; batchSize?: number; now?: () => Date } = {},
  ) {
    this.repository = new RuntimeLogRepository(database);
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
      console.error("清理过期运行日志失败", error);
    }
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.run(), this.options.intervalMs ?? DAY_MS);
    this.timer.unref();
  }
}
