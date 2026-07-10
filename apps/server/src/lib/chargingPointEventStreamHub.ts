import {
  chargingPointEventStreamMessageSchema,
  type ChargingPointEventStreamMessage,
} from "@spark-bee/contracts";

import type { ChargingPointActorEvent } from "./chargingPointActor";

export type ChargingPointStreamEvent = Exclude<
  ChargingPointEventStreamMessage,
  { event: "snapshot" }
> & {
  close?: boolean;
};

export class ChargingPointEventStreamHub {
  private readonly subscribers = new Map<
    string,
    Set<(event: ChargingPointStreamEvent) => void>
  >();

  subscribe(
    chargingPointId: string,
    listener: (event: ChargingPointStreamEvent) => void,
  ): () => void {
    const listeners = this.subscribers.get(chargingPointId) ?? new Set();
    listeners.add(listener);
    this.subscribers.set(chargingPointId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.subscribers.delete(chargingPointId);
      }
    };
  }

  delete(chargingPointId: string): void {
    const message = chargingPointEventStreamMessageSchema.parse({
      event: "deleted",
      data: { chargingPointId },
    });
    if (message.event !== "deleted") {
      return;
    }
    this.publish(chargingPointId, {
      ...message,
      close: true,
    });
  }

  publishActorEvent(event: ChargingPointActorEvent): void {
    const message = chargingPointEventStreamMessageSchema.parse({
      event: event.type,
      data: event,
    });
    if (message.event === "snapshot" || message.event === "deleted") {
      return;
    }

    this.publish(event.chargingPointId, message);
  }

  private publish(chargingPointId: string, event: ChargingPointStreamEvent): void {
    const listeners = this.subscribers.get(chargingPointId);
    if (listeners === undefined) {
      return;
    }

    for (const listener of [...listeners]) {
      listener(event);
    }
  }
}
