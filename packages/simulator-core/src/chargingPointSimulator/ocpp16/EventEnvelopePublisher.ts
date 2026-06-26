import { EventEmitter } from "node:events";

import type { ProtocolVersion } from "../../shared/types";
import type { ProtocolClock } from "../../protocol/runtime/ocpp16/protocolClock";
import type {
  ChargingPointSimulatorEvent,
  ChargingPointSimulatorEventBus,
  ChargingPointSimulatorEventMap,
  ChargingPointSimulatorEventType,
} from "../types";

export class EventEnvelopePublisher {
  private readonly emitter = new EventEmitter();
  private sequence = 0;

  readonly events: ChargingPointSimulatorEventBus = {
    subscribe: (type, listener) => {
      const wrapped = listener as (event: ChargingPointSimulatorEvent) => void;
      this.emitter.on(type, wrapped);
      return () => {
        this.emitter.off(type, wrapped);
      };
    },
  };

  constructor(
    private readonly options: {
      chargingPointSimulatorId: string;
      protocol: ProtocolVersion;
      clock: ProtocolClock;
      idGenerator: () => string;
    },
  ) {}

  publish<TType extends ChargingPointSimulatorEventType>(
    type: TType,
    event: Omit<
      ChargingPointSimulatorEventMap[TType],
      "id" | "sequence" | "type" | "chargingPointSimulatorId" | "protocol" | "occurredAt"
    >,
    occurredAt?: Date,
  ): void {
    const eventOccurredAt = occurredAt ?? this.options.clock.now();
    this.sequence += 1;
    this.emitter.emit(type, {
      id: this.options.idGenerator(),
      sequence: this.sequence,
      type,
      chargingPointSimulatorId: this.options.chargingPointSimulatorId,
      protocol: this.options.protocol,
      occurredAt: eventOccurredAt.toISOString(),
      ...event,
    } as ChargingPointSimulatorEventMap[TType]);
  }

  dispose(): void {
    this.emitter.removeAllListeners();
  }
}
