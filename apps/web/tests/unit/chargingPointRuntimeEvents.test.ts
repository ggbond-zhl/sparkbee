import { describe, expect, test } from "vitest";

import {
  createChargingPointRuntimeEventFeedState,
  createChargingPointRuntimeEventState,
  reduceChargingPointRuntimeEventFeedState,
  reduceChargingPointRuntimeEventState,
} from "../../src/features/charging-points/model/chargingPointRuntimeEvents";
import { toRuntimeStatusFromStreamMessage } from "../../src/features/charging-points/model/useChargingPointRuntimeEvents";

describe("charging point runtime events", () => {
  test("keeps runtime events and protocol messages in separate feeds", () => {
    let feedState = createChargingPointRuntimeEventFeedState();

    feedState = reduceChargingPointRuntimeEventFeedState(feedState, {
      event: "snapshot",
      data: {
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        runtimeStatus: {
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          status: "running",
        },
        sessionStatus: null,
        chargingPointStatus: null,
        evseStatuses: [],
        connectorStatuses: [],
        transactionStatuses: [],
        lastHeartbeatAt: null,
        recentIssue: null,
      },
    });
    feedState = reduceChargingPointRuntimeEventFeedState(feedState, {
      event: "connector.status",
      data: {
        type: "connector.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:01.000Z",
        resource: { scope: "connector", evseId: 1, connectorId: 1 },
        previousStatus: "available",
        currentStatus: "occupied",
      },
    });
    feedState = reduceChargingPointRuntimeEventFeedState(feedState, {
      event: "protocol.message",
      data: {
        type: "protocol.message",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:02.000Z",
        resource: { scope: "protocol" },
        direction: "received",
        action: "Heartbeat",
        messageId: "msg-1",
        body: { currentTime: "2026-07-04T09:00:02.000Z" },
      },
    });

    expect(feedState.events).toHaveLength(1);
    expect(feedState.events[0]).toMatchObject({
      eventType: "connector.status",
      resource: "枪口 1/1",
      summary: "枪口 1/1: 占用",
    });
    expect(feedState.protocolMessages).toHaveLength(1);
    expect(feedState.protocolMessages[0]).toMatchObject({
      direction: "received",
      action: "Heartbeat",
      messageId: "msg-1",
      summary: "收到 Heartbeat",
      detail: { currentTime: "2026-07-04T09:00:02.000Z" },
    });
  });

  test("keeps newest runtime feed records first without truncating the page feed", () => {
    let feedState = createChargingPointRuntimeEventFeedState();

    for (let index = 0; index < 201; index += 1) {
      feedState = reduceChargingPointRuntimeEventFeedState(feedState, {
        event: "transaction.meterValue",
        data: {
          type: "transaction.meterValue",
          chargingPointId: "cp-1",
          occurredAt: `2026-07-04T09:00:${String(index % 60).padStart(2, "0")}.000Z`,
          resource: {
            scope: "transaction",
            evseId: 1,
            connectorId: 1,
            transactionId: `tx-${index}`,
          },
          meterWh: index + 0.1234,
          sampledAt: "2026-07-04T09:00:00.000Z",
        },
      });
    }

    expect(feedState.events).toHaveLength(201);
    expect(feedState.events[0]?.summary).toBe("交易 tx-200: 200.123 Wh");
    expect(feedState.events.at(-1)?.summary).toBe("交易 tx-0: 0.123 Wh");
  });

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

  test("maps snapshot messages to runtime status updates", () => {
    const runtimeStatus = toRuntimeStatusFromStreamMessage({
      event: "snapshot",
      data: {
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        runtimeStatus: {
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          status: "running",
          bootStatus: "Accepted",
        },
        sessionStatus: null,
        chargingPointStatus: null,
        evseStatuses: [],
        connectorStatuses: [],
        transactionStatuses: [],
        lastHeartbeatAt: null,
        recentIssue: null,
      },
    });

    expect(runtimeStatus).toEqual({
      chargingPointId: "00000000-0000-4000-8000-000000000001",
      status: "running",
      bootStatus: "Accepted",
    });
  });

  test("keeps runtime projection state driven by snapshots only", () => {
    const initialState = createChargingPointRuntimeEventState();
    const state = reduceChargingPointRuntimeEventState(initialState, {
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

    expect(state).toBe(initialState);
  });

  test("uses the server snapshot recent issue instead of deriving one from raw events", () => {
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
            currentStatus: "reconnecting",
            occurredAt: "2026-07-04T09:02:00.000Z",
            connectionUrl: "ws://localhost/CP_001",
            attempt: 2,
          },
          chargingPointStatus: null,
          evseStatuses: [],
          connectorStatuses: [],
          transactionStatuses: [],
          lastHeartbeatAt: null,
          recentIssue: {
            label: "会话重连中: 建立底层链路失败",
            tone: "warning",
            occurredAt: "2026-07-04T09:02:00.000Z",
          },
        },
      },
    );

    expect(state.recentIssue).toMatchObject({
      label: "会话重连中: 建立底层链路失败",
      tone: "warning",
    });
  });

  test("clears volatile runtime states from stopped snapshots", () => {
    let state = createChargingPointRuntimeEventState();

    state = reduceChargingPointRuntimeEventState(state, {
      event: "snapshot",
      data: {
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        runtimeStatus: {
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          status: "stopped",
        },
        sessionStatus: null,
        chargingPointStatus: null,
        evseStatuses: [],
        connectorStatuses: [],
        transactionStatuses: [],
        lastHeartbeatAt: null,
        recentIssue: null,
      },
    });

    expect(state.connectorStatuses).toEqual({});
    expect(state.transactionStatuses).toEqual({});
    expect(state.sessionStatus).toBeNull();
  });
});
