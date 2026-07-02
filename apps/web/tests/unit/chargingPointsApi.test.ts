import { afterEach, describe, expect, test, vi } from "vitest";

import {
  listChargingPoints,
  updateChargingPoint,
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
});
