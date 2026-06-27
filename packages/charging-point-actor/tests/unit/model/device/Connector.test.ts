import { describe, expect, test } from "vitest";

import { Connector } from "../../../../src/model/index.ts";

describe("Connector", () => {
  test("rejects non-positive connector ids", () => {
    expect(() =>
      new Connector({
        id: 0,
        type: "GBT",
        format: "socket",
        powerType: "ac",
      })
    ).toThrow("connector.id");
  });

  test("applies requested availability ahead of occupied physical state", () => {
    const connector = new Connector({
      id: 1,
      type: "GBT",
      format: "socket",
      powerType: "ac",
    });

    const requested = connector.requestAvailability("inoperative");
    const applied = requested.applyRequestedAvailability(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const occupied = applied.setOccupied(true, new Date("2026-01-01T00:01:00.000Z"));
    const released = occupied.setOccupied(false, new Date("2026-01-01T00:02:00.000Z"));

    expect(connector.requestedAvailability).toBeNull();
    expect(requested.requestedAvailability).toBe("inoperative");
    expect(applied.availability).toBe("inoperative");
    expect(applied.status).toBe("unavailable");
    expect(occupied.plugState).toBe("plugged");
    expect(occupied.vehiclePresence).toBe("detected");
    expect(occupied.status).toBe("unavailable");
    expect(released.status).toBe("unavailable");
  });

  test("tracks faults and returns defensive copies for dates", () => {
    const connector = new Connector({
      id: 1,
      type: "GBT",
      format: "socket",
      powerType: "ac",
      lastStatusAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const faulted = connector.activateFault(
      "fault-1",
      "GroundFailure",
      new Date("2026-01-01T00:01:00.000Z"),
    );
    const cleared = faulted.clearFault(
      "fault-1",
      new Date("2026-01-01T00:02:00.000Z"),
    );

    expect(faulted.status).toBe("faulted");
    expect(faulted.faultCode).toBe("GroundFailure");
    expect(faulted.listActiveFaultIds()).toEqual(["fault-1"]);
    expect(cleared.status).toBe("available");
    expect(cleared.faultCode).toBeNull();

    const lastStatusAt = cleared.lastStatusAt;
    lastStatusAt?.setUTCFullYear(2030);

    expect(cleared.lastStatusAt?.toISOString()).toBe("2026-01-01T00:02:00.000Z");
    expect(cleared.listActiveFaultIds()).toEqual([]);
  });
});
