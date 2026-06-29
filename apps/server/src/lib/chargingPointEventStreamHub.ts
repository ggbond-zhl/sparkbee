import type { ChargingPointActor, ChargingPointActorEvent } from "./chargingPointActor";

export interface ChargingPointStreamEvent {
  event: string;
  data: unknown;
  close?: boolean;
}

export class ChargingPointEventStreamHub {
  private readonly subscribers = new Map<
    string,
    Set<(event: ChargingPointStreamEvent) => void>
  >();
  private readonly actorUnsubscribers = new Map<string, () => void>();

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

  attachActor(actor: ChargingPointActor): void {
    if (this.actorUnsubscribers.has(actor.id)) {
      return;
    }

    const unsubscribe = actor.events.subscribe((event) => {
      this.publishActorEvent(event);
    });
    this.actorUnsubscribers.set(actor.id, unsubscribe);
  }

  detachActor(chargingPointId: string): void {
    const unsubscribe = this.actorUnsubscribers.get(chargingPointId);
    if (unsubscribe === undefined) {
      return;
    }

    unsubscribe();
    this.actorUnsubscribers.delete(chargingPointId);
  }

  delete(chargingPointId: string): void {
    this.publish(chargingPointId, {
      event: "deleted",
      data: { chargingPointId },
      close: true,
    });
    this.detachActor(chargingPointId);
  }

  private publishActorEvent(event: ChargingPointActorEvent): void {
    this.publish(event.chargingPointId, {
      event: event.type,
      data: event,
    });
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
