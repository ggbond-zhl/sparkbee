import type { ChargingPointActor } from "@spark-bee/charging-point-actor";

export interface ChargingPointActorRegistryEntry {
  actor: ChargingPointActor;
  created: boolean;
}

export class ChargingPointActorRegistry {
  private readonly actors = new Map<string, ChargingPointActor>();

  get(id: string): ChargingPointActor | undefined {
    return this.actors.get(id);
  }

  acquire(
    id: string,
    factory: () => ChargingPointActor,
  ): ChargingPointActorRegistryEntry {
    const existing = this.actors.get(id);
    if (existing !== undefined) {
      return { actor: existing, created: false };
    }

    const actor = factory();
    this.actors.set(id, actor);
    return { actor, created: true };
  }

  remove(id: string): ChargingPointActor | undefined {
    const actor = this.actors.get(id);
    this.actors.delete(id);
    return actor;
  }

  list(): ChargingPointActor[] {
    return Array.from(this.actors.values());
  }
}
