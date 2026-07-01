import { describe, expect, test } from "vitest";
import type {
  ChargingPointActor,
  ChargingPointActorStatus,
} from "@spark-bee/charging-point-actor";

import { ChargingPointActorRegistry } from "../../src/lib/chargingPointActorRegistry";

function createActor(
  id: string,
  status: ChargingPointActorStatus = "starting",
): ChargingPointActor {
  return {
    id,
    protocol: "OCPP16J",
    status,
    events: {
      subscribe: () => () => undefined,
    },
    start: async () => ({
      chargingPointId: id,
      chargingPointActorStatus: "running",
      bootStatus: "Accepted",
    }),
    stop: async () => ({
      chargingPointId: id,
      chargingPointActorStatus: "stopped",
    }),
    dispose: async () => undefined,
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

describe("ChargingPointActorRegistry", () => {
  test("acquires each charging point actor only once", () => {
    const registry = new ChargingPointActorRegistry();
    let factoryCalls = 0;

    const first = registry.acquire("cp-1", () => {
      factoryCalls += 1;
      return createActor("cp-1", "starting");
    });
    const second = registry.acquire("cp-1", () => {
      factoryCalls += 1;
      return createActor("cp-1", "running");
    });

    expect(first).toEqual({ actor: first.actor, created: true });
    expect(second).toEqual({ actor: first.actor, created: false });
    expect(factoryCalls).toBe(1);
    expect(registry.get("cp-1")).toBe(first.actor);
  });

  test("removes and returns the actor without disposing it", () => {
    const registry = new ChargingPointActorRegistry();
    const { actor } = registry.acquire("cp-1", () => createActor("cp-1"));

    expect(registry.remove("cp-1")).toBe(actor);
    expect(registry.get("cp-1")).toBeUndefined();
    expect(registry.remove("cp-1")).toBeUndefined();
  });

  test("lists active actors", () => {
    const registry = new ChargingPointActorRegistry();
    const first = registry.acquire("cp-1", () => createActor("cp-1")).actor;
    const second = registry.acquire("cp-2", () => createActor("cp-2")).actor;

    expect(registry.list()).toEqual([first, second]);
  });
});
