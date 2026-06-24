import { EventEmitter } from "node:events";

import type { ProtocolVersion } from "../../shared/types";
import type { ProtocolClock } from "../../protocol/runtime/ocpp16/protocolClock";
import type {
  SimulatorEvent,
  SimulatorEventBus,
  SimulatorEventMap,
  SimulatorEventType,
} from "../types";

export class EventEnvelopePublisher {
  private readonly emitter = new EventEmitter();
  private sequence = 0;

  readonly events: SimulatorEventBus = {
    subscribe: (type, listener) => {
      const wrapped = listener as (event: SimulatorEvent) => void;
      this.emitter.on(type, wrapped);
      return () => {
        this.emitter.off(type, wrapped);
      };
    },
  };

  constructor(
    private readonly options: {
      simulatorId: string;
      protocol: ProtocolVersion;
      clock: ProtocolClock;
      idGenerator: () => string;
    },
  ) {}

  publish<TType extends SimulatorEventType>(
    type: TType,
    event: Omit<
      SimulatorEventMap[TType],
      "id" | "sequence" | "type" | "simulatorId" | "protocol" | "occurredAt"
    >,
    occurredAt?: Date,
  ): void {
    const eventOccurredAt = occurredAt ?? this.options.clock.now();
    this.sequence += 1;
    this.emitter.emit(type, {
      id: this.options.idGenerator(),
      sequence: this.sequence,
      type,
      simulatorId: this.options.simulatorId,
      protocol: this.options.protocol,
      occurredAt: eventOccurredAt.toISOString(),
      ...event,
    } as SimulatorEventMap[TType]);
  }

  dispose(): void {
    this.emitter.removeAllListeners();
  }
}
