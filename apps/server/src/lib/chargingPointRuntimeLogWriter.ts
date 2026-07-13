import type {
  ChargingPointActorRuntimeLogRecord,
  ChargingPointActorRuntimeLogSink,
} from "./chargingPointActor";
import type { RuntimeLog } from "@spark-bee/contracts";

import type { ServerDatabase } from "../db";
import { RuntimeLogRepository } from "../modules/runtimeLog/runtimeLog.repo";

export interface ChargingPointRuntimeLogSinkFactory {
  createSink(chargingPointId: string): ChargingPointActorRuntimeLogSink;
}

export class ChargingPointRuntimeLogWriter implements ChargingPointRuntimeLogSinkFactory {
  private readonly repository: RuntimeLogRepository;
  private readonly pending: RuntimeLog[] = [];
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<void>;

  constructor(
    database: ServerDatabase,
    private readonly options: { batchSize?: number; flushIntervalMs?: number } = {},
  ) {
    this.repository = new RuntimeLogRepository(database);
  }

  createSink(chargingPointId: string): ChargingPointActorRuntimeLogSink {
    return {
      write: (record) => {
        if (record.chargingPointId !== chargingPointId) return;
        this.enqueue(record);
      },
    };
  }

  async flush(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.flushing !== undefined) await this.flushing;
    const batch = this.pending.splice(0, this.pending.length);
    if (batch.length === 0) return;
    this.flushing = this.persist(batch).finally(() => { this.flushing = undefined; });
    await this.flushing;
  }

  private enqueue(record: ChargingPointActorRuntimeLogRecord): void {
    this.pending.push(toRuntimeLog(record));
    if (this.pending.length >= (this.options.batchSize ?? 100)) {
      void this.flush();
      return;
    }
    if (this.timer === undefined) {
      this.timer = setTimeout(() => void this.flush(), this.options.flushIntervalMs ?? 1_000);
      this.timer.unref();
    }
  }

  private async persist(batch: RuntimeLog[]): Promise<void> {
    try {
      await this.repository.insertMany(batch);
    } catch (firstError) {
      try {
        await this.repository.insertMany(batch);
      } catch (error) {
        console.error("写入运行日志失败", error, { firstError });
      }
    }
  }
}

function toRuntimeLog(record: ChargingPointActorRuntimeLogRecord): RuntimeLog {
  return {
    id: record.id,
    sequence: record.sequence,
    chargingPointId: record.chargingPointId,
    occurredAt: record.occurredAt,
    level: record.level,
    code: record.code ?? null,
    message: record.message,
    context: record.context ?? null,
  };
}
