import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createConnector,
  deleteConnector,
  listConnectors,
  listChargingPoints,
  updateChargingPoint,
  updateConnector,
} from "../../src/features/charging-points/api/chargingPoints";

describe("chargingPoints API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("sends requested page and page size", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 50,
          total: 0,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listChargingPoints({ keyword: " CP ", page: 2, pageSize: 50 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points?page=2&pageSize=50&keyword=CP",
    );
  });

  test("updates charging point by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          name: "更新后的桩",
          description: null,
          identity: "CP_001",
          protocol: "OCPP16J",
          centralSystemUrl: "ws://localhost:9000/ocpp",
          vendor: "SparkBee",
          model: "Simulator",
          firmwareVersion: null,
          serialNumber: null,
          connectors: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateChargingPoint("00000000-0000-4000-8000-000000000001", {
      name: "更新后的桩",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "更新后的桩" }),
      },
    );
  });

  test("lists connectors for a charging point", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "00000000-0000-4000-8000-000000000002",
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            evseId: 1,
            connectorId: 1,
            type: "Type2",
            format: "socket",
            powerType: "ac",
            maxVoltage: null,
            maxCurrent: null,
            maxPower: null,
            sortOrder: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listConnectors("00000000-0000-4000-8000-000000000001");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors",
    );
  });

  test("creates connector for a charging point", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000002",
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          evseId: 1,
          connectorId: 1,
          type: "Type2",
          format: "socket",
          powerType: "ac",
          maxVoltage: null,
          maxCurrent: null,
          maxPower: null,
          sortOrder: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createConnector("00000000-0000-4000-8000-000000000001", {
      evseId: 1,
      connectorId: 1,
      type: "Type2",
      format: "socket",
      powerType: "ac",
      maxVoltage: null,
      maxCurrent: null,
      maxPower: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evseId: 1,
          connectorId: 1,
          type: "Type2",
          format: "socket",
          powerType: "ac",
          maxVoltage: null,
          maxCurrent: null,
          maxPower: null,
        }),
      },
    );
  });

  test("updates connector by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000002",
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          evseId: 1,
          connectorId: 2,
          type: "CCS2",
          format: "cable",
          powerType: "dc",
          maxVoltage: 750,
          maxCurrent: 200,
          maxPower: 150000,
          sortOrder: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateConnector(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      { connectorId: 2, type: "CCS2" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connectorId: 2, type: "CCS2" }),
      },
    );
  });

  test("deletes connector by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteConnector(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002",
      {
        method: "DELETE",
      },
    );
  });
});
