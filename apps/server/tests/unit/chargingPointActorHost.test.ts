import { describe, expect, test, vi } from "vitest";

import type { ChargingPointActor } from "../../src/lib/chargingPointActor";
import { ChargingPointActorHost } from "../../src/lib/chargingPointActorHost";

function createActor(input: {
  id: string;
  start?: ChargingPointActor["start"];
  stop?: ChargingPointActor["stop"];
  dispose?: ChargingPointActor["dispose"];
  subscribe?: ChargingPointActor["events"]["subscribe"];
}): ChargingPointActor {
  return {
    id: input.id,
    protocol: "OCPP16J",
    status: "starting",
    events: {
      subscribe: input.subscribe ?? (() => () => undefined),
    },
    start: input.start ?? (async () => ({
      chargingPointId: input.id,
      chargingPointActorStatus: "running",
      bootStatus: "Accepted",
    })),
    stop: input.stop ?? (async () => ({
      chargingPointId: input.id,
      chargingPointActorStatus: "stopped",
    })),
    dispose: input.dispose ?? (async () => undefined),
    plug: async () => {
      throw new Error("not used");
    },
    unplug: async () => {
      throw new Error("not used");
    },
    authorize: async () => {
      throw new Error("not used");
    },
    startTransaction: async () => {
      throw new Error("not used");
    },
    getTransactionResource: () => undefined,
    reportMeterValue: async () => {
      throw new Error("not used");
    },
    stopTransaction: async () => {
      throw new Error("not used");
    },
  };
}

describe("ChargingPointActorHost", () => {
  test("releases the actor and observation subscription when start fails", async () => {
    const unsubscribe = vi.fn();
    const dispose = vi.fn(async () => undefined);
    const actor = createActor({
      id: "00000000-0000-4000-8000-000000000001",
      start: async () => {
        throw new Error("boot failed");
      },
      dispose,
      subscribe: () => unsubscribe,
    });
    const host = new ChargingPointActorHost();

    await expect(host.start(actor.id, () => actor)).rejects.toThrow("boot failed");

    expect(host.get(actor.id)).toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  test("stops and releases a running actor before closing its event stream on delete", async () => {
    const unsubscribeActor = vi.fn();
    const stop = vi.fn(async () => ({
      chargingPointId: "00000000-0000-4000-8000-000000000001",
      chargingPointActorStatus: "stopped" as const,
    }));
    const dispose = vi.fn(async () => undefined);
    const actor = createActor({
      id: "00000000-0000-4000-8000-000000000001",
      stop,
      dispose,
      subscribe: () => unsubscribeActor,
    });
    const host = new ChargingPointActorHost();
    const streamEvents: unknown[] = [];

    await host.start(actor.id, () => actor);
    host.subscribe(actor.id, (event) => streamEvents.push(event));
    await host.delete(actor.id);

    expect(stop).toHaveBeenCalledOnce();
    expect(unsubscribeActor).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(host.get(actor.id)).toBeUndefined();
    expect(streamEvents).toEqual([
      {
        event: "deleted",
        data: { chargingPointId: actor.id },
        close: true,
      },
    ]);
  });
});
