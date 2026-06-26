import { EventEmitter } from "node:events";

import type { ProtocolVersion } from "../../shared/types";
import type { ProtocolClock } from "../../protocol/runtime/ocpp16/protocolClock";
import type {
  ChargingPointActorEvent,
  ChargingPointActorEventBus,
  ChargingPointActorEventMap,
  ChargingPointActorEventType,
} from "../types";

export class EventEnvelopePublisher {
  private readonly emitter = new EventEmitter();
  private sequence = 0;

  readonly events: ChargingPointActorEventBus = {
    subscribe: (type, listener) => {
      const wrapped = listener as (event: ChargingPointActorEvent) => void;
      this.emitter.on(type, wrapped);
      return () => {
        this.emitter.off(type, wrapped);
      };
    },
  };

  constructor(
    private readonly options: {
      chargingPointActorId: string;
      protocol: ProtocolVersion;
      clock: ProtocolClock;
      idGenerator: () => string;
    },
  ) {}

  publish<TType extends ChargingPointActorEventType>(
    type: TType,
    event: Omit<
      ChargingPointActorEventMap[TType],
      "id" | "sequence" | "type" | "chargingPointActorId" | "protocol" | "occurredAt"
    >,
    occurredAt?: Date,
  ): void {
    const eventOccurredAt = occurredAt ?? this.options.clock.now();
    this.sequence += 1;
    this.emitter.emit(type, {
      id: this.options.idGenerator(),
      sequence: this.sequence,
      type,
      chargingPointActorId: this.options.chargingPointActorId,
      protocol: this.options.protocol,
      occurredAt: eventOccurredAt.toISOString(),
      ...event,
    } as ChargingPointActorEventMap[TType]);
  }

  dispose(): void {
    this.emitter.removeAllListeners();
  }
}
