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
  private readonly pending: ChargingPointActorEvent[] = [];
  private readonly deletedChargingPointIds = new Set<string>();
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
    this.messageRepository = new ProtocolMessageRepository(database);
    this.eventRepository = new HistoricalObservationEventRepository(database);
    this.logger = options.logger ?? pino({ level: "silent" });
    this.errorReporter = options.errorReporter ?? noopErrorReporter;
  }

  write(event: ChargingPointActorEvent): void {
    if (this.deletedChargingPointIds.has(event.chargingPointId)) return;
    this.pending.push(event);
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

  async delete(chargingPointId: string): Promise<void> {
    this.deletedChargingPointIds.add(chargingPointId);
    removePendingForChargingPoint(this.pending, chargingPointId);
    if (this.flushing !== undefined) await this.flushing;
    removePendingForChargingPoint(this.pending, chargingPointId);
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

  private async persist(batch: ChargingPointActorEvent[]): Promise<void> {
    try {
      await this.persistBatch(batch);
    } catch {
      try {
        await this.persistBatch(batch);
      } catch (error) {
        const context = {
          module: "protocolObservationWriter",
          batchSize: batch.length,
        };
        this.logger.error({
          event: "protocol-observation.persist.failed",
          batchSize: batch.length,
          error,
        }, "Failed to persist protocol observations");
        this.errorReporter.captureException(error, context);
      }
    }
  }

  private async persistBatch(batch: ChargingPointActorEvent[]): Promise<void> {
    const messages = batch.filter(isProtocolMessage);
    const events = batch.filter(isHistoricalObservationEvent);
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

function removePendingForChargingPoint(
  pending: ChargingPointActorEvent[],
  chargingPointId: string,
): void {
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    if (pending[index]?.chargingPointId === chargingPointId) {
      pending.splice(index, 1);
    }
  }
}
