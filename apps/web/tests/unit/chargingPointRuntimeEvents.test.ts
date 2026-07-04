import { describe, expect, test } from "vitest";

import {
  createChargingPointRuntimeEventState,
  reduceChargingPointRuntimeEventState,
} from "../../src/features/charging-points/model/chargingPointRuntimeEvents";

describe("charging point runtime events", () => {
  test("initializes state from a runtime snapshot", () => {
    const state = reduceChargingPointRuntimeEventState(
      createChargingPointRuntimeEventState(),
      {
        event: "snapshot",
        data: {
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          runtimeStatus: {
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            status: "running",
          },
          sessionStatus: {
            currentStatus: "online",
            occurredAt: "2026-07-04T09:00:00.000Z",
            connectionUrl: "ws://localhost/CP_001",
          },
          chargingPointStatus: {
            currentStatus: "available",
            occurredAt: "2026-07-04T09:00:01.000Z",
          },
          evseStatuses: [
            {
              evseId: 1,
              currentStatus: "available",
              occurredAt: "2026-07-04T09:00:02.000Z",
            },
          ],
          connectorStatuses: [
            {
              evseId: 1,
              connectorId: 1,
              currentStatus: "occupied",
              occurredAt: "2026-07-04T09:00:03.000Z",
            },
          ],
          transactionStatuses: [
            {
              transactionId: "tx-1",
              evseId: 1,
              connectorId: 1,
              currentStatus: "active",
              meterWh: 1200,
              sampledAt: "2026-07-04T09:00:04.000Z",
              occurredAt: "2026-07-04T09:00:04.000Z",
            },
          ],
          lastHeartbeatAt: "2026-07-04T09:00:05.000Z",
          recentIssue: null,
        },
      },
    );

    expect(state.sessionStatus?.currentStatus).toBe("online");
    expect(state.chargingPointStatus?.currentStatus).toBe("available");
    expect(state.evseStatuses["1"]?.currentStatus).toBe("available");
    expect(state.connectorStatuses["1/1"]?.currentStatus).toBe("occupied");
    expect(state.transactionStatuses["tx-1"]?.meterWh).toBe(1200);
    expect(state.lastHeartbeatAt?.toISOString()).toBe("2026-07-04T09:00:05.000Z");
  });

  test("tracks session, point, connector, transaction and heartbeat states", () => {
    let state = createChargingPointRuntimeEventState();

    state = reduceChargingPointRuntimeEventState(state, {
      event: "session.status",
      data: {
        type: "session.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:00.000Z",
        resource: { scope: "session" },
        previousStatus: "offline",
        currentStatus: "online",
        connectionUrl: "ws://localhost/CP_001",
      },
    });
    state = reduceChargingPointRuntimeEventState(state, {
      event: "chargingPoint.status",
      data: {
        type: "chargingPoint.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:01.000Z",
        resource: { scope: "chargingPoint" },
        previousStatus: null,
        currentStatus: "available",
      },
    });
    state = reduceChargingPointRuntimeEventState(state, {
      event: "connector.status",
      data: {
        type: "connector.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:02.000Z",
        resource: { scope: "connector", evseId: 1, connectorId: 1 },
        previousStatus: null,
        currentStatus: "occupied",
      },
    });
    state = reduceChargingPointRuntimeEventState(state, {
      event: "transaction.status",
      data: {
        type: "transaction.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:03.000Z",
        resource: {
          scope: "transaction",
          evseId: 1,
          connectorId: 1,
          transactionId: "tx-1",
        },
        previousStatus: "starting",
        currentStatus: "active",
      },
    });
    state = reduceChargingPointRuntimeEventState(state, {
      event: "protocol.message",
      data: {
        type: "protocol.message",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:04.000Z",
        resource: { scope: "protocol" },
        direction: "received",
        action: "Heartbeat",
        messageId: "msg-1",
        body: { currentTime: "2026-07-04T09:00:04.000Z" },
      },
    });

    expect(state.sessionStatus?.currentStatus).toBe("online");
    expect(state.chargingPointStatus?.currentStatus).toBe("available");
    expect(state.connectorStatuses["1/1"]?.currentStatus).toBe("occupied");
    expect(state.transactionStatuses["tx-1"]?.currentStatus).toBe("active");
    expect(state.lastHeartbeatAt?.toISOString()).toBe("2026-07-04T09:00:04.000Z");
    expect(state.recentIssue).toBeNull();
  });

  test("records operational issues but keeps authorization rejection out of recent issue", () => {
    let state = createChargingPointRuntimeEventState();

    state = reduceChargingPointRuntimeEventState(state, {
      event: "authorization.status",
      data: {
        type: "authorization.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:01:00.000Z",
        resource: {
          scope: "authorization",
          idTag: "CARD-001",
          evseId: 1,
          connectorId: 1,
        },
        status: "invalid",
        source: "online",
        protocolStatus: "Invalid",
      },
    });

    expect(state.recentIssue).toBeNull();

    state = reduceChargingPointRuntimeEventState(state, {
      event: "session.status",
      data: {
        type: "session.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:02:00.000Z",
        resource: { scope: "session" },
        previousStatus: "online",
        currentStatus: "reconnecting",
        connectionUrl: "ws://localhost/CP_001",
        attempt: 2,
        error: {
          code: "CONNECT_FAILED",
          message: "建立底层链路失败",
        },
      },
    });

    expect(state.recentIssue).toMatchObject({
      label: "会话重连中: 建立底层链路失败",
      tone: "warning",
    });
  });

  test("clears volatile runtime states when the actor stops", () => {
    let state = createChargingPointRuntimeEventState();

    state = reduceChargingPointRuntimeEventState(state, {
      event: "connector.status",
      data: {
        type: "connector.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:00.000Z",
        resource: { scope: "connector", evseId: 1, connectorId: 1 },
        previousStatus: null,
        currentStatus: "occupied",
      },
    });
    state = reduceChargingPointRuntimeEventState(state, {
      event: "chargingPoint.lifecycle",
      data: {
        type: "chargingPoint.lifecycle",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:05:00.000Z",
        resource: { scope: "chargingPoint" },
        previousStatus: "running",
        currentStatus: "stopped",
      },
    });

    expect(state.connectorStatuses).toEqual({});
    expect(state.transactionStatuses).toEqual({});
    expect(state.sessionStatus?.currentStatus).toBe("offline");
  });
});
