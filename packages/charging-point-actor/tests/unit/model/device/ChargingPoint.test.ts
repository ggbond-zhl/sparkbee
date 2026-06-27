import { describe, expect, test } from "vitest";

import {
  ChargingPoint,
  Connector,
  EVSE,
} from "../../../../src/model/index.ts";

function createConnector(id: number): Connector {
  return new Connector({
    id,
    type: "GBT",
    format: "socket",
    powerType: "ac",
  });
}

function createEvseOptions(id: number) {
  return {
    id,
    connectors: [createConnector(1)],
  } as const;
}

describe("ChargingPoint", () => {
  test("rejects duplicate evse ids", () => {
    expect(() =>
      new ChargingPoint({
        id: "cp-1",
        vendor: "Volt",
        model: "Sim",
        evses: [createEvseOptions(1), createEvseOptions(1)],
      })
    ).toThrow("EVSE 1 已存在于 charging point cp-1");
  });

  test("updates evses, connectors, availability, and faults immutably", () => {
    const chargingPoint = new ChargingPoint({
      id: "cp-1",
      vendor: "Volt",
      model: "Sim",
      evses: [createEvseOptions(1)],
    });

    const withAvailability = chargingPoint
      .requestAvailability("inoperative")
      .applyRequestedAvailability(new Date("2026-01-01T00:00:00.000Z"));
    const withFault = withAvailability.activateFault(
      "fault-1",
      "InternalError",
      new Date("2026-01-01T00:01:00.000Z"),
    );
    const withoutFault = withFault.clearFault(
      "fault-1",
      new Date("2026-01-01T00:02:00.000Z"),
    );
    const withUpdatedConnector = withoutFault.updateConnector(1, 1, (connector) =>
      connector.setLockState("locked", new Date("2026-01-01T00:03:00.000Z"))
    );

    expect(withAvailability.status).toBe("unavailable");
    expect(withFault.status).toBe("faulted");
    expect(withFault.listActiveFaultIds()).toEqual(["fault-1"]);
    expect(withoutFault.status).toBe("unavailable");
    expect(chargingPoint.getConnector(1, 1)?.lockState).toBe("unknown");
    expect(withUpdatedConnector.getConnector(1, 1)?.lockState).toBe("locked");
  });

  test("adds evses and transitions to operative status", () => {
    const chargingPoint = new ChargingPoint({
      id: "cp-1",
      vendor: "Volt",
      model: "Sim",
      availability: "inoperative",
      evses: [createEvseOptions(1)],
    });

    const expanded = chargingPoint.addEvse(new EVSE(createEvseOptions(2)));
    const operative = expanded.markOperative(new Date("2026-01-01T00:00:00.000Z"));
    const requested = operative.requestAvailability("inoperative");

    expect(expanded.listEvses()).toHaveLength(2);
    expect(operative.status).toBe("available");
    expect(operative.availability).toBe("operative");
    expect(operative.requestedAvailability).toBeNull();
    expect(operative.faultCode).toBeNull();
    expect(requested.requestedAvailability).toBe("inoperative");
    expect(() => expanded.addEvse(new EVSE(createEvseOptions(2)))).toThrow(
      "EVSE 2 已存在于 charging point cp-1",
    );
  });

  test("returns defensive copies for dates and fault ids", () => {
    const chargingPoint = new ChargingPoint({
      id: "cp-1",
      vendor: "Volt",
      model: "Sim",
      lastStatusAt: new Date("2026-01-01T00:00:00.000Z"),
      evses: [createEvseOptions(1)],
    });

    const lastStatusAt = chargingPoint.lastStatusAt;
    lastStatusAt?.setUTCFullYear(2030);

    expect(chargingPoint.lastStatusAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(chargingPoint.listActiveFaultIds()).toEqual([]);
  });
});
