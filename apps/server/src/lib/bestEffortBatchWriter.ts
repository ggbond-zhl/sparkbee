interface BestEffortBatchWriterOptions<T> {
  batchSize?: number;
  flushIntervalMs?: number;
  persistBatch(batch: T[]): Promise<void>;
  onFailed?(error: unknown, batch: T[]): void;
}

export class BestEffortBatchWriter<T> {
  private readonly pending: T[] = [];
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<void>;

  constructor(private readonly options: BestEffortBatchWriterOptions<T>) {}

  enqueue(item: T): void {
    this.pending.push(item);
    if (this.pending.length >= (this.options.batchSize ?? 100)) {
      void this.flush();
      return;
    }
    if (this.timer === undefined) {
      this.timer = setTimeout(
        () => void this.flush(),
        this.options.flushIntervalMs ?? 1_000,
      );
      this.timer.unref();
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.flushing !== undefined) await this.flushing;
    const batch = this.pending.splice(0, this.pending.length);
    if (batch.length === 0) return;
    this.flushing = this.persist(batch).finally(() => {
      this.flushing = undefined;
    });
    await this.flushing;
  }

  private async persist(batch: T[]): Promise<void> {
    try {
      await this.options.persistBatch(batch);
    } catch {
      try {
        await this.options.persistBatch(batch);
      } catch (error) {
        this.options.onFailed?.(error, batch);
      }
    }
  }
}
