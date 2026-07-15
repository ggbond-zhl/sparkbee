import type {
  ChargingPointActorLogRecord,
  ChargingPointActorLogSink,
} from "./chargingPointActor";
import type { ActorLog } from "@spark-bee/contracts";
import pino from "pino";
import type { Logger } from "pino";

import { noopErrorReporter } from "../config/errorReporter";
import type { ErrorReporter } from "../config/errorReporter";
import type { ServerDatabase } from "../db";
import { ActorLogRepository } from "../modules/actorLog/actorLog.repo";

export interface ActorLogSinkFactory {
  createSink(chargingPointId: string): ChargingPointActorLogSink;
}

export class ActorLogWriter implements ActorLogSinkFactory {
  private readonly repository: ActorLogRepository;
  private readonly pending: ActorLog[] = [];
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<void>;
  private readonly logger: Logger;
  private readonly errorReporter: ErrorReporter;

  constructor(
    database: ServerDatabase,
    private readonly options: {
      batchSize?: number;
      flushIntervalMs?: number;
      logger?: Logger;
      errorReporter?: ErrorReporter;
    } = {},
  ) {
    this.repository = new ActorLogRepository(database);
    this.logger = options.logger ?? pino({ level: "silent" });
    this.errorReporter = options.errorReporter ?? noopErrorReporter;
  }

  createSink(chargingPointId: string): ChargingPointActorLogSink {
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

  private enqueue(record: ChargingPointActorLogRecord): void {
    this.pending.push(toActorLog(record));
    if (this.pending.length >= (this.options.batchSize ?? 100)) {
      void this.flush();
      return;
    }
    if (this.timer === undefined) {
      this.timer = setTimeout(() => void this.flush(), this.options.flushIntervalMs ?? 1_000);
      this.timer.unref();
    }
  }

  private async persist(batch: ActorLog[]): Promise<void> {
    try {
      await this.repository.insertMany(batch);
    } catch {
      try {
        await this.repository.insertMany(batch);
      } catch (error) {
        const context = { module: "actorLogWriter", batchSize: batch.length };
        this.logger.error({
          event: "actor-log.persist.failed",
          batchSize: batch.length,
          error,
        }, "写入 Actor 日志失败");
        this.errorReporter.captureException(error, context);
      }
    }
  }
}

function toActorLog(record: ChargingPointActorLogRecord): ActorLog {
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
