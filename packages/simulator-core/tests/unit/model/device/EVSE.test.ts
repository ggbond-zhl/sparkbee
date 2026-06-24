import { describe, expect, test } from "vitest";

import {
  Connector,
  EVSE,
  mapConnectorStatusToEvseStatus,
  type ConnectorOptions,
} from "../../../../src/model/index.ts";

function createConnector(
  id: number,
  overrides: Partial<ConnectorOptions> = {},
): Connector {
  return new Connector({
    id,
    type: "GBT",
    format: "socket",
    powerType: "ac",
    ...overrides,
  });
}

describe("EVSE", () => {
  test("rejects duplicate connector ids", () => {
    expect(() =>
      new EVSE({
        id: 1,
        connectors: [createConnector(1), createConnector(1)],
      })
    ).toThrow("connector 1 已存在于 EVSE 1");
  });

  test("derives status from transaction, reservation, faults, and availability", () => {
    const evse = new EVSE({
      id: 1,
      connectors: [createConnector(1)],
    });

    const reserved = evse.reserve("reservation-1", new Date("2026-01-01T00:00:00.000Z"));
    const occupied = reserved.bindTransaction("transaction-1", new Date("2026-01-01T00:01:00.000Z"));
    const faulted = occupied.activateFault("fault-1", new Date("2026-01-01T00:02:00.000Z"));
    const recovered = faulted.clearFault("fault-1", new Date("2026-01-01T00:03:00.000Z"));
    const released = recovered.releaseTransaction(new Date("2026-01-01T00:04:00.000Z"));
    const available = released.clearReservation(new Date("2026-01-01T00:05:00.000Z"));

    expect(reserved.status).toBe("reserved");
    expect(occupied.status).toBe("occupied");
    expect(faulted.status).toBe("faulted");
    expect(faulted.listActiveFaultIds()).toEqual(["fault-1"]);
    expect(recovered.status).toBe("occupied");
    expect(released.status).toBe("reserved");
    expect(available.status).toBe("available");
  });

  test("derives status from connector facts when EVSE has no own state", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");

    const faulted = new EVSE({
      id: 1,
      connectors: [
        createConnector(1).activateFault("fault-1", "GroundFailure", at),
        createConnector(2),
      ],
    });
    const occupied = new EVSE({
      id: 1,
      connectors: [createConnector(1, { plugState: "plugged" })],
    });
    const unavailable = new EVSE({
      id: 1,
      connectors: [createConnector(1, { availability: "inoperative" })],
    });

    expect(faulted.status).toBe("faulted");
    expect(occupied.status).toBe("occupied");
    expect(unavailable.status).toBe("unavailable");
  });

  test("updates connectors immutably and protects dates in getters", () => {
    const evse = new EVSE({
      id: 1,
      connectors: [createConnector(1)],
      lastStatusAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const next = evse.updateConnector(1, (connector) =>
      connector.setPlugState("plugged", new Date("2026-01-01T00:01:00.000Z"))
    );

    expect(evse.getConnector(1)?.plugState).toBe("unknown");
    expect(next.getConnector(1)?.plugState).toBe("plugged");

    const lastStatusAt = next.lastStatusAt;
    lastStatusAt?.setUTCFullYear(2030);

    expect(next.lastStatusAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  test("adds connectors and applies requested availability", () => {
    const evse = new EVSE({
      id: 1,
      connectors: [createConnector(1)],
    });

    const expanded = evse.addConnector(createConnector(2));
    const requested = expanded.requestAvailability("inoperative");
    const applied = requested.applyRequestedAvailability(
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(expanded.listConnectors()).toHaveLength(2);
    expect(requested.requestedAvailability).toBe("inoperative");
    expect(applied.availability).toBe("inoperative");
    expect(applied.status).toBe("unavailable");
    expect(applied.activeTransactionId).toBeNull();
    expect(applied.activeReservationId).toBeNull();
    expect(evse.applyRequestedAvailability(new Date("2026-01-01T00:00:00.000Z"))).toBe(evse);
    expect(() => expanded.addConnector(createConnector(2))).toThrow("connector 2 已存在于 EVSE 1");
  });

  test("folds connector statuses by severity", () => {
    expect(mapConnectorStatusToEvseStatus(["available", "occupied"])).toBe("occupied");
    expect(mapConnectorStatusToEvseStatus(["occupied", "faulted"])).toBe("faulted");
    expect(mapConnectorStatusToEvseStatus(["unavailable"])).toBe("unavailable");
  });
});
