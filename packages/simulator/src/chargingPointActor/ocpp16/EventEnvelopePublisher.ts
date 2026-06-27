import type { ProtocolVersion } from "../../shared/types";
import type { ProtocolClock } from "../../protocol/runtime/ocpp16/protocolClock";
import type {
  ChargingPointActorEvent,
  ChargingPointActorEventBus,
  ChargingPointActorEventMap,
  ChargingPointActorEventType,
} from "../types";

export class EventEnvelopePublisher {
  private readonly listeners = new Set<
    (event: ChargingPointActorEvent) => void | Promise<void>
  >();
  private sequence = 0;

  readonly events: ChargingPointActorEventBus = {
    subscribe: (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    },
  };

  constructor(
    private readonly options: {
      chargingPointId: string;
      protocol: ProtocolVersion;
      clock: ProtocolClock;
      idGenerator: () => string;
    },
  ) {}

  publish<TType extends ChargingPointActorEventType>(
    type: TType,
    event: Omit<
      ChargingPointActorEventMap[TType],
      "id" | "sequence" | "type" | "chargingPointId" | "protocol" | "occurredAt"
    >,
    occurredAt?: Date,
  ): void {
    const eventOccurredAt = occurredAt ?? this.options.clock.now();
    this.sequence += 1;
    const publishedEvent = {
      id: this.options.idGenerator(),
      sequence: this.sequence,
      type,
      chargingPointId: this.options.chargingPointId,
      protocol: this.options.protocol,
      occurredAt: eventOccurredAt.toISOString(),
      ...event,
    } as ChargingPointActorEventMap[TType];

    for (const listener of [...this.listeners]) {
      try {
        const result = listener(publishedEvent);
        if (result !== undefined) {
          void result.catch(() => undefined);
        }
      } catch {
        // Actor event subscribers are observers and must not affect charging point execution.
      }
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
