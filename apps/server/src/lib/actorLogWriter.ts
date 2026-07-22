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
import { BestEffortBatchWriter } from "./bestEffortBatchWriter";

export interface ActorLogSinkFactory {
  createSink(chargingPointId: string): ChargingPointActorLogSink;
}

export class ActorLogWriter implements ActorLogSinkFactory {
  private readonly repository: ActorLogRepository;
  private readonly batchWriter: BestEffortBatchWriter<ActorLog>;
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
    this.batchWriter = new BestEffortBatchWriter({
      batchSize: options.batchSize,
      flushIntervalMs: options.flushIntervalMs,
      persistBatch: (batch) => this.repository.insertMany(batch),
      onFailed: (error, batch) => this.reportFailure(error, batch.length),
    });
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
    await this.batchWriter.flush();
  }

  private enqueue(record: ChargingPointActorLogRecord): void {
    this.batchWriter.enqueue(toActorLog(record));
  }

  private reportFailure(error: unknown, batchSize: number): void {
    const context = { module: "actorLogWriter", batchSize };
    this.logger.error({
      event: "actor-log.persist.failed",
      batchSize,
      error,
    }, "Failed to persist Actor logs");
    this.errorReporter.captureException(error, context);
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
