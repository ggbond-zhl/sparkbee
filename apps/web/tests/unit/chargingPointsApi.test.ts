import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createConnector,
  deleteConnector,
  getChargingPoint,
  getChargingPointRuntimeSnapshot,
  getChargingPointRuntimeStatus,
  listConnectors,
  listChargingPoints,
  plugConnector,
  authorizeAndStartConnectorTransaction,
  startConnectorTransaction,
  startChargingPoint,
  subscribeChargingPointEvents,
  stopConnectorTransaction,
  stopChargingPoint,
  unplugConnector,
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

  test("gets charging point detail by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          name: "调试桩",
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

    await getChargingPoint("00000000-0000-4000-8000-000000000001");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001",
    );
  });

  test("gets runtime status by charging point id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          status: "running",
          bootStatus: "Accepted",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getChargingPointRuntimeStatus(
      "00000000-0000-4000-8000-000000000001",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/status",
    );
  });

  test("gets runtime snapshot by charging point id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          runtimeStatus: {
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            status: "running",
          },
          sessionStatus: null,
          chargingPointStatus: null,
          chargingPointAvailability: null,
          evseStatuses: [],
          connectorStatuses: [],
          connectorAvailabilities: [],
          transactionStatuses: [],
          lastHeartbeatAt: null,
          recentIssue: null,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getChargingPointRuntimeSnapshot(
      "00000000-0000-4000-8000-000000000001",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/runtime-snapshot",
    );
  });

  test("starts and stops charging point runtime by id", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            status: "starting",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          status: "stopped",
        }),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    await startChargingPoint("00000000-0000-4000-8000-000000000001");
    await stopChargingPoint("00000000-0000-4000-8000-000000000001");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/charging-points/00000000-0000-4000-8000-000000000001/start",
      { method: "POST" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/charging-points/00000000-0000-4000-8000-000000000001/stop",
      { method: "POST" },
    );
  });

  test("applies connector runtime actions by connector id", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            connectorId: "00000000-0000-4000-8000-000000000002",
            evseId: 1,
            protocolConnectorId: 1,
            plugState: "plugged",
            vehiclePresence: "detected",
            connectorStatus: "occupied",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            connectorId: "00000000-0000-4000-8000-000000000002",
            evseId: 1,
            protocolConnectorId: 1,
            plugState: "unplugged",
            vehiclePresence: "absent",
            connectorStatus: "available",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await plugConnector(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    );
    await unplugConnector(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002/plug",
      { method: "POST" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002/unplug",
      { method: "POST" },
    );
  });

  test("starts and stops connector transactions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            connectorId: "00000000-0000-4000-8000-000000000002",
            evseId: 1,
            protocolConnectorId: 1,
            status: "accepted",
            transactionId: "tx-1",
            idTag: "CARD001",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            connectorId: "00000000-0000-4000-8000-000000000002",
            evseId: 1,
            protocolConnectorId: 1,
            status: "accepted",
            transactionId: "tx-1",
            meterStopWh: 1200,
            stoppedAt: "2026-07-04T09:00:00.000Z",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await startConnectorTransaction(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      { idTag: " CARD001 " },
    );
    await stopConnectorTransaction(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      { transactionId: "tx-1" },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002/start-transaction",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idTag: "CARD001" }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002/stop-transaction",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transactionId: "tx-1" }),
      },
    );
  });

  test("authorizes before starting connector transaction", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            connectorId: "00000000-0000-4000-8000-000000000002",
            evseId: 1,
            protocolConnectorId: 1,
            status: "accepted",
            idTag: "CARD001",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            connectorId: "00000000-0000-4000-8000-000000000002",
            evseId: 1,
            protocolConnectorId: 1,
            status: "accepted",
            transactionId: "tx-1",
            idTag: "CARD001",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await authorizeAndStartConnectorTransaction(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      { idTag: " CARD001 " },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002/authorize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idTag: "CARD001" }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002/start-transaction",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idTag: "CARD001" }),
      },
    );
  });

  test("does not start connector transaction when authorization is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          connectorId: "00000000-0000-4000-8000-000000000002",
          evseId: 1,
          protocolConnectorId: 1,
          status: "rejected",
          idTag: "CARD001",
          reason: "Authorize 被中心系统拒绝",
          authorizationStatus: "Invalid",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await authorizeAndStartConnectorTransaction(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      { idTag: " CARD001 " },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "rejected",
      idTag: "CARD001",
      reason: "Authorize 被中心系统拒绝",
      authorizationStatus: "Invalid",
    });
  });

  test("subscribes to charging point runtime events by id", () => {
    const createdSources: FakeEventSource[] = [];
    class FakeEventSource {
      readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
      onerror: ((event: Event) => void) | null = null;
      closed = false;

      constructor(readonly url: string) {
        createdSources.push(this);
      }

      addEventListener(
        type: string,
        listener: (event: MessageEvent<string>) => void,
      ) {
        this.listeners.set(type, listener);
      }

      removeEventListener(type: string) {
        this.listeners.delete(type);
      }

      close() {
        this.closed = true;
      }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const onEvent = vi.fn();

    const unsubscribe = subscribeChargingPointEvents(
      "00000000-0000-4000-8000-000000000001",
      { onEvent },
    );
    const source = createdSources[0];
    source.listeners.get("snapshot")?.({
      data: JSON.stringify({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        runtimeStatus: {
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          status: "running",
        },
        sessionStatus: null,
        chargingPointStatus: null,
        chargingPointAvailability: null,
        evseStatuses: [],
        connectorStatuses: [],
        connectorAvailabilities: [],
        transactionStatuses: [],
        lastHeartbeatAt: null,
        recentIssue: null,
      }),
    } as MessageEvent<string>);

    expect(source.url).toBe(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/events",
    );
    expect(onEvent).toHaveBeenCalledWith({
      event: "snapshot",
      data: {
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        runtimeStatus: {
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          status: "running",
        },
        sessionStatus: null,
        chargingPointStatus: null,
        chargingPointAvailability: null,
        evseStatuses: [],
        connectorStatuses: [],
        connectorAvailabilities: [],
        transactionStatuses: [],
        lastHeartbeatAt: null,
        recentIssue: null,
      },
    });

    unsubscribe();

    expect(source.closed).toBe(true);
    expect(source.listeners.size).toBe(0);
  });

  test("rejects invalid charging point event payloads before notifying", () => {
    const createdSources: FakeEventSource[] = [];
    class FakeEventSource {
      readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
      onerror: ((event: Event) => void) | null = null;

      constructor(readonly url: string) {
        createdSources.push(this);
      }

      addEventListener(
        type: string,
        listener: (event: MessageEvent<string>) => void,
      ) {
        this.listeners.set(type, listener);
      }

      removeEventListener(type: string) {
        this.listeners.delete(type);
      }

      close() {}
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const onEvent = vi.fn();

    subscribeChargingPointEvents(
      "00000000-0000-4000-8000-000000000001",
      { onEvent },
    );

    expect(() =>
      createdSources[0].listeners.get("transaction.meterValue")?.({
        data: JSON.stringify({ sampledAt: "not-a-date" }),
      } as MessageEvent<string>),
    ).toThrow();
    expect(onEvent).not.toHaveBeenCalled();
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
            type: "IEC_62196_T2",
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
          type: "IEC_62196_T2",
          format: "socket",
          powerType: "ac",
          maxVoltage: 230,
          maxCurrent: 32,
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
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
          type: "IEC_62196_T2",
          format: "socket",
          powerType: "ac",
          maxVoltage: 230,
          maxCurrent: 32,
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
          type: "IEC_62196_T2_COMBO",
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
      { connectorId: 2, type: "IEC_62196_T2_COMBO" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/connectors/00000000-0000-4000-8000-000000000002",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connectorId: 2, type: "IEC_62196_T2_COMBO" }),
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
