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
        chargingPointAvailability: null,
        evseStatuses: [],
        connectorStatuses: [],
        connectorAvailabilities: [],
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

  test("keeps only the newest 500 protocol messages", () => {
    let feedState = createChargingPointRuntimeEventFeedState();

    for (let index = 0; index < 501; index += 1) {
      feedState = reduceChargingPointRuntimeEventFeedState(feedState, {
        event: "protocol.message",
        data: {
          type: "protocol.message",
          chargingPointId: "cp-1",
          occurredAt: "2026-07-04T09:00:00.000Z",
          resource: { scope: "protocol" },
          direction: "received",
          action: "Heartbeat",
          messageId: `msg-${index}`,
        },
      });
    }

    expect(feedState.protocolMessages).toHaveLength(500);
    expect(feedState.protocolMessages[0]?.messageId).toBe("msg-500");
    expect(feedState.protocolMessages.at(-1)?.messageId).toBe("msg-1");
  });

  test("keeps only the newest 500 protocol events", () => {
    let feedState = createChargingPointRuntimeEventFeedState();

    for (let index = 0; index < 501; index += 1) {
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
          powerW: 7200,
          currentA: 32,
          voltageV: 225,
          sampledAt: "2026-07-04T09:00:00.000Z",
        },
      });
    }

    expect(feedState.events).toHaveLength(500);
    expect(feedState.events[0]?.summary).toBe("交易 tx-500: 500.123 Wh");
    expect(feedState.events.at(-1)?.summary).toBe("交易 tx-1: 1.123 Wh");
  });

  test("keeps protocol message and event capacities independent", () => {
    let feedState = createChargingPointRuntimeEventFeedState();

    for (let index = 0; index < 501; index += 1) {
      feedState = reduceChargingPointRuntimeEventFeedState(feedState, {
        event: "protocol.message",
        data: {
          type: "protocol.message",
          chargingPointId: "cp-1",
          occurredAt: "2026-07-04T09:00:00.000Z",
          resource: { scope: "protocol" },
          direction: "received",
          action: "Heartbeat",
          messageId: `msg-${index}`,
        },
      });
      feedState = reduceChargingPointRuntimeEventFeedState(feedState, {
        event: "connector.status",
        data: {
          type: "connector.status",
          chargingPointId: "cp-1",
          occurredAt: "2026-07-04T09:00:00.000Z",
          resource: { scope: "connector", evseId: 1, connectorId: index + 1 },
          previousStatus: "available",
          currentStatus: "occupied",
        },
      });
    }

    expect(feedState.protocolMessages).toHaveLength(500);
    expect(feedState.events).toHaveLength(500);
    expect(feedState.protocolMessages[0]?.messageId).toBe("msg-500");
    expect(feedState.events[0]?.resource).toBe("枪口 1/501");
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
          chargingPointAvailability: {
            currentAvailability: "operative",
            requestedAvailability: "inoperative",
            occurredAt: "2026-07-04T09:00:01.500Z",
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
          connectorAvailabilities: [
            {
              evseId: 1,
              connectorId: 1,
              currentAvailability: "operative",
              requestedAvailability: "inoperative",
              occurredAt: "2026-07-04T09:00:03.500Z",
            },
          ],
          transactionStatuses: [
            {
              transactionId: "tx-1",
              evseId: 1,
              connectorId: 1,
              currentStatus: "active",
              meterWh: 1200,
              powerW: 7200,
              currentA: 32,
              voltageV: 225,
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
    expect(state.chargingPointAvailability).toMatchObject({
      currentAvailability: "operative",
      requestedAvailability: "inoperative",
    });
    expect(state.evseStatuses["1"]?.currentStatus).toBe("available");
    expect(state.connectorStatuses["1/1"]?.currentStatus).toBe("occupied");
    expect(state.connectorAvailabilities["1/1"]).toMatchObject({
      currentAvailability: "operative",
      requestedAvailability: "inoperative",
    });
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
        chargingPointAvailability: null,
        evseStatuses: [],
        connectorStatuses: [],
        connectorAvailabilities: [],
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

  test("replaces pending boot status when a background retry is accepted", () => {
    const pending = toRuntimeStatusFromStreamMessage({
      event: "chargingPoint.boot",
      data: {
        id: "event-1",
        sequence: 1,
        type: "chargingPoint.boot",
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        protocol: "OCPP16J",
        resource: { scope: "chargingPoint" },
        occurredAt: "2026-07-04T09:00:01.000Z",
        status: "Pending",
        retryAfterSec: 10,
      },
    });
    const accepted = toRuntimeStatusFromStreamMessage({
      event: "chargingPoint.boot",
      data: {
        id: "event-2",
        sequence: 2,
        type: "chargingPoint.boot",
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        protocol: "OCPP16J",
        resource: { scope: "chargingPoint" },
        occurredAt: "2026-07-04T09:00:11.000Z",
        status: "Accepted",
      },
    });

    expect(pending).toEqual({
      chargingPointId: "00000000-0000-4000-8000-000000000001",
      status: "starting",
      bootStatus: "Pending",
      retryAfterSec: 10,
    });
    expect(accepted).toEqual({
      chargingPointId: "00000000-0000-4000-8000-000000000001",
      status: "running",
      bootStatus: "Accepted",
    });
  });

  test("updates the runtime projection from incremental connector events", () => {
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

    expect(state.connectorStatuses["1/1"]).toEqual({
      evseId: 1,
      connectorId: 1,
      currentStatus: "occupied",
      occurredAt: "2026-07-04T09:00:02.000Z",
    });
  });

  test("reconstructs current runtime facts from the incremental event stream", () => {
    let state = createChargingPointRuntimeEventState();
    const reduce = (message: Parameters<typeof reduceChargingPointRuntimeEventState>[1]) => {
      state = reduceChargingPointRuntimeEventState(state, message);
    };

    reduce({
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
    reduce({
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
    reduce({
      event: "chargingPoint.availability",
      data: {
        type: "chargingPoint.availability",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:02.000Z",
        resource: { scope: "chargingPoint" },
        previousAvailability: "operative",
        currentAvailability: "operative",
        requestedAvailability: "inoperative",
      },
    });
    reduce({
      event: "evse.status",
      data: {
        type: "evse.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:03.000Z",
        resource: { scope: "evse", evseId: 1 },
        previousStatus: null,
        currentStatus: "occupied",
      },
    });
    reduce({
      event: "connector.availability",
      data: {
        type: "connector.availability",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:04.000Z",
        resource: { scope: "connector", evseId: 1, connectorId: 1 },
        previousAvailability: "operative",
        currentAvailability: "operative",
        requestedAvailability: "inoperative",
      },
    });
    reduce({
      event: "transaction.status",
      data: {
        type: "transaction.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:05.000Z",
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
    reduce({
      event: "transaction.meterValue",
      data: {
        type: "transaction.meterValue",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:06.000Z",
        resource: {
          scope: "transaction",
          evseId: 1,
          connectorId: 1,
          transactionId: "tx-1",
        },
        meterWh: 1200,
        powerW: 7200,
        currentA: 32,
        voltageV: 225,
        sampledAt: "2026-07-04T09:00:06.000Z",
      },
    });
    reduce({
      event: "protocol.message",
      data: {
        type: "protocol.message",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:00:07.000Z",
        resource: { scope: "protocol" },
        direction: "received",
        action: "Heartbeat",
        messageId: "msg-1",
      },
    });

    expect(state.sessionStatus?.currentStatus).toBe("online");
    expect(state.chargingPointStatus?.currentStatus).toBe("available");
    expect(state.chargingPointAvailability?.requestedAvailability).toBe("inoperative");
    expect(state.evseStatuses["1"]?.currentStatus).toBe("occupied");
    expect(state.connectorAvailabilities["1/1"]?.requestedAvailability).toBe(
      "inoperative",
    );
    expect(state.transactionStatuses["tx-1"]).toMatchObject({
      currentStatus: "active",
      meterWh: 1200,
      powerW: 7200,
      currentA: 32,
      voltageV: 225,
    });
    expect(state.lastHeartbeatAt?.toISOString()).toBe("2026-07-04T09:00:07.000Z");
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
          chargingPointAvailability: null,
          evseStatuses: [],
          connectorStatuses: [],
          connectorAvailabilities: [],
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

  test("updates recent issues from incremental failures and clears them when stopped", () => {
    let state = reduceChargingPointRuntimeEventState(
      createChargingPointRuntimeEventState(),
      {
        event: "session.status",
        data: {
          type: "session.status",
          chargingPointId: "cp-1",
          occurredAt: "2026-07-04T09:02:00.000Z",
          resource: { scope: "session" },
          previousStatus: "offline",
          currentStatus: "reconnecting",
          connectionUrl: "ws://localhost/CP_001",
          attempt: 2,
          error: {
            code: "CONNECT_FAILED",
            message: "建立底层链路失败",
          },
        },
      },
    );

    expect(state.recentIssue).toEqual({
      label: "会话重连中: 建立底层链路失败",
      tone: "warning",
      occurredAt: "2026-07-04T09:02:00.000Z",
    });

    state = reduceChargingPointRuntimeEventState(state, {
      event: "chargingPoint.lifecycle",
      data: {
        type: "chargingPoint.lifecycle",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:03:00.000Z",
        resource: { scope: "chargingPoint" },
        previousStatus: "running",
        currentStatus: "stopped",
      },
    });

    expect(state).toEqual(createChargingPointRuntimeEventState());
  });

  test("surfaces incremental resource and transaction failures", () => {
    let state = createChargingPointRuntimeEventState();

    state = reduceChargingPointRuntimeEventState(state, {
      event: "connector.status",
      data: {
        type: "connector.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:04:00.000Z",
        resource: { scope: "connector", evseId: 1, connectorId: 2 },
        previousStatus: "occupied",
        currentStatus: "faulted",
      },
    });
    expect(state.recentIssue?.label).toBe("枪口 1/2 故障");

    state = reduceChargingPointRuntimeEventState(state, {
      event: "transaction.status",
      data: {
        type: "transaction.status",
        chargingPointId: "cp-1",
        occurredAt: "2026-07-04T09:05:00.000Z",
        resource: {
          scope: "transaction",
          evseId: 1,
          connectorId: 2,
          transactionId: "tx-1",
        },
        previousStatus: "ending",
        currentStatus: "failed",
        reason: "StopTransaction timeout",
      },
    });
    expect(state.recentIssue).toEqual({
      label: "交易失败: StopTransaction timeout",
      tone: "destructive",
      occurredAt: "2026-07-04T09:05:00.000Z",
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
        chargingPointAvailability: null,
        evseStatuses: [],
        connectorStatuses: [],
        connectorAvailabilities: [],
        transactionStatuses: [],
        lastHeartbeatAt: null,
        recentIssue: null,
      },
    });

    expect(state.connectorStatuses).toEqual({});
    expect(state.connectorAvailabilities).toEqual({});
    expect(state.chargingPointAvailability).toBeNull();
    expect(state.transactionStatuses).toEqual({});
    expect(state.sessionStatus).toBeNull();
  });
});
