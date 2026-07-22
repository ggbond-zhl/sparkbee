import type {
  HistoricalObservationEvent,
  ProtocolMessageEvent,
} from "@spark-bee/contracts";
import pino from "pino";
import type { Logger } from "pino";

import { noopErrorReporter } from "../../config/errorReporter";
import type { ErrorReporter } from "../../config/errorReporter";
import type { ServerDatabase } from "../../db";
import type { ChargingPointActorEvent } from "../../lib/chargingPointActor";
import { BestEffortBatchWriter } from "../../lib/bestEffortBatchWriter";
import {
  HistoricalObservationEventRepository,
  ProtocolMessageRepository,
} from "./protocolObservation.repo";

export interface ProtocolObservationSink {
  write(event: ChargingPointActorEvent): void;
  delete(chargingPointId: string): Promise<void>;
}

export class ProtocolObservationWriter implements ProtocolObservationSink {
  private readonly messageRepository: ProtocolMessageRepository;
  private readonly eventRepository: HistoricalObservationEventRepository;
  private readonly batchWriter: BestEffortBatchWriter<ChargingPointActorEvent>;
  private readonly deletedChargingPointIds = new Set<string>();
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
    this.messageRepository = new ProtocolMessageRepository(database);
    this.eventRepository = new HistoricalObservationEventRepository(database);
    this.logger = options.logger ?? pino({ level: "silent" });
    this.errorReporter = options.errorReporter ?? noopErrorReporter;
    this.batchWriter = new BestEffortBatchWriter({
      batchSize: options.batchSize,
      flushIntervalMs: options.flushIntervalMs,
      persistBatch: (batch) => this.persistBatch(batch),
      onFailed: (error, batch) => this.reportFailure(error, batch.length),
    });
  }

  write(event: ChargingPointActorEvent): void {
    if (this.deletedChargingPointIds.has(event.chargingPointId)) return;
    this.batchWriter.enqueue(event);
  }

  async delete(chargingPointId: string): Promise<void> {
    this.deletedChargingPointIds.add(chargingPointId);
    await this.batchWriter.flush();
  }

  async flush(): Promise<void> {
    await this.batchWriter.flush();
  }

  private reportFailure(error: unknown, batchSize: number): void {
    const context = { module: "protocolObservationWriter", batchSize };
    this.logger.error({
      event: "protocol-observation.persist.failed",
      batchSize,
      error,
    }, "Failed to persist protocol observations");
    this.errorReporter.captureException(error, context);
  }

  private async persistBatch(batch: ChargingPointActorEvent[]): Promise<void> {
    const activeBatch = batch.filter(
      (event) => !this.deletedChargingPointIds.has(event.chargingPointId),
    );
    const messages = activeBatch.filter(isProtocolMessage);
    const events = activeBatch.filter(isHistoricalObservationEvent);
    await this.messageRepository.insertMany(messages);
    await this.eventRepository.insertMany(events);
  }
}

function isProtocolMessage(
  event: ChargingPointActorEvent,
): event is ProtocolMessageEvent {
  return event.type === "protocol.message";
}

function isHistoricalObservationEvent(
  event: ChargingPointActorEvent,
): event is HistoricalObservationEvent {
  return event.type !== "protocol.message";
}
