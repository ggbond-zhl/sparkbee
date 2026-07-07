import type {
  ChargingPointDetailResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";
import { describe, expect, test } from "vitest";

import {
  buildChargingPointDetailHeaderModel,
} from "../../src/features/charging-points/model/chargingPointDetailHeader";
import {
  createChargingPointRuntimeEventState,
  reduceChargingPointRuntimeEventState,
} from "../../src/features/charging-points/model/chargingPointRuntimeEvents";

const baseDetail: ChargingPointDetailResponse = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "调试桩 A",
  description: "用于联调 Boot 和交易流程",
  identity: "CP_001",
  protocol: "OCPP16J",
  centralSystemUrl: "ws://localhost:9000/ocpp",
  vendor: "SparkBee",
  model: "Simulator",
  firmwareVersion: null,
  serialNumber: null,
  connectors: [
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
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function buildRuntimeStatus(
  input: Partial<RuntimeOperationResponse>,
): RuntimeOperationResponse {
  return {
    chargingPointId: baseDetail.id,
    status: "stopped",
    ...input,
  };
}

describe("charging point detail header model", () => {
  test("marks a stopped charging point with connectors as startable", () => {
    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({ status: "stopped" }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
    });

    expect(model.mainStatus.label).toBe("已停止");
    expect(model.lastHeartbeatLabel).toBe("最后心跳 --");
    expect(model.operability.label).toBe("可启动");
    expect(model.primaryAction).toMatchObject({
      kind: "start",
      label: "启动",
      disabled: false,
    });
    expect(model.connectorSummary).toBe("共 1 枪");
    expect(model.sessionStatus.label).toBe("会话未建立");
    expect(model.chargingPointStatus.label).toBe("桩状态未同步");
    expect(model.transactionSummary).toBe("无运行交易");
  });

  test("exposes runtime communication diagnostics", () => {
    let runtimeEventState = createChargingPointRuntimeEventState();
    runtimeEventState = reduceChargingPointRuntimeEventState(runtimeEventState, {
      event: "session.status",
      data: {
        type: "session.status",
        chargingPointId: baseDetail.id,
        occurredAt: "2026-07-04T09:00:00.000Z",
        resource: { scope: "session" },
        previousStatus: "online",
        currentStatus: "reconnecting",
        connectionUrl: "ws://localhost:9000/ocpp/CP_001",
        attempt: 2,
      },
    });
    runtimeEventState = reduceChargingPointRuntimeEventState(runtimeEventState, {
      event: "chargingPoint.status",
      data: {
        type: "chargingPoint.status",
        chargingPointId: baseDetail.id,
        occurredAt: "2026-07-04T09:00:01.000Z",
        resource: { scope: "chargingPoint" },
        previousStatus: "available",
        currentStatus: "unavailable",
      },
    });
    runtimeEventState = reduceChargingPointRuntimeEventState(runtimeEventState, {
      event: "protocol.message",
      data: {
        type: "protocol.message",
        chargingPointId: baseDetail.id,
        occurredAt: "2026-07-04T09:00:04.000Z",
        resource: { scope: "protocol" },
        direction: "received",
        action: "Heartbeat",
      },
    });

    const model = buildChargingPointDetailHeaderModel({
      detail: {
        ...baseDetail,
        firmwareVersion: "1.2.3",
        serialNumber: "SN-001",
        createdAt: "2026-07-04T09:00:00.000Z",
        updatedAt: "2026-07-04T10:00:00.000Z",
      },
      runtimeStatus: buildRuntimeStatus({
        status: "starting",
        bootStatus: "Pending",
        retryAfterSec: 12,
      }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
      runtimeEventState,
    });

    const diagnosticsByLabel = Object.fromEntries(
      model.runtimeDiagnostics.map((item) => [item.label, item]),
    );

    expect(Object.keys(diagnosticsByLabel)).toEqual([
      "Boot",
      "会话状态",
      "最近异常",
    ]);
    expect(diagnosticsByLabel.Boot).toMatchObject({
      value: "待接受 · 12 秒后再次上报",
    });
    expect(diagnosticsByLabel.会话状态).toMatchObject({
      value: "会话重连中 · 第 2 次",
    });
    expect(diagnosticsByLabel.最近异常).toMatchObject({
      value: "无",
    });
    expect(model.finalConnectionUrl).toBe("ws://localhost:9000/ocpp/CP_001");
  });

  test("puts the offline reason in the session diagnostic", () => {
    const runtimeEventState = reduceChargingPointRuntimeEventState(
      createChargingPointRuntimeEventState(),
      {
        event: "session.status",
        data: {
          type: "session.status",
          chargingPointId: baseDetail.id,
          occurredAt: "2026-07-04T09:00:00.000Z",
          resource: { scope: "session" },
          previousStatus: "reconnecting",
          currentStatus: "offline",
          connectionUrl: "ws://localhost:9000/ocpp/CP_001",
          reason: "unexpected_disconnect",
        },
      },
    );

    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({
        status: "running",
        bootStatus: "Accepted",
      }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
      runtimeEventState,
    });

    const sessionDiagnostic = model.runtimeDiagnostics.find(
      (item) => item.label === "会话状态",
    );

    expect(sessionDiagnostic).toMatchObject({
      value: "会话离线 · 底层连接意外断开",
    });
    expect(model.runtimeDiagnostics.find(
      (item) => item.label === "最近异常",
    )).toMatchObject({
      value: "会话意外断开",
      tone: "warning",
    });
    expect(model.runtimeDiagnostics.map((item) => item.label)).not.toContain(
      "离线原因",
    );
  });

  test("omits the final connection before a session is known", () => {
    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({ status: "stopped" }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
    });

    expect(model.finalConnectionUrl).toBeNull();
    expect(model.runtimeDiagnostics.map((item) => item.label)).not.toContain(
      "运行连接",
    );
  });

  test("separates stopped from not runnable when no connectors exist", () => {
    const model = buildChargingPointDetailHeaderModel({
      detail: { ...baseDetail, connectors: [] },
      runtimeStatus: buildRuntimeStatus({ status: "stopped" }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
    });

    expect(model.mainStatus.label).toBe("已停止");
    expect(model.operability.label).toBe("暂不可启动");
    expect(model.operability.description).toBe("缺少枪口，先添加至少 1 个枪口");
    expect(model.primaryAction).toMatchObject({
      kind: "start",
      label: "启动",
      disabled: true,
    });
    expect(model.recentIssue).toBeNull();
  });

  test("keeps starting as the main status and puts boot pending in the summary", () => {
    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({
        status: "starting",
        bootStatus: "Pending",
        retryAfterSec: 12,
      }),
      statusQueryState: "success",
      lastHeartbeatAt: new Date(2026, 6, 4, 8, 0, 0),
    });

    expect(model.mainStatus.label).toBe("启动中");
    expect(model.lastHeartbeatLabel).toBe("最后心跳 08:00:00");
    expect(model.bootSummary).toBe("Boot 待接受 · 12 秒后再次上报");
    expect(model.connectorSummary).toBe("1 枪 · 等待运行状态");
    expect(model.primaryAction).toMatchObject({
      kind: "stop",
      label: "停止",
      disabled: false,
    });
  });

  test("does not treat running with boot pending as an exception", () => {
    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({
        status: "running",
        bootStatus: "Pending",
      }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
    });

    expect(model.mainStatus.label).toBe("运行中");
    expect(model.bootSummary).toBe("Boot 待接受");
    expect(model.recentIssue).toBeNull();
  });

  test("uses runtime events for session, point, connector and transaction summaries", () => {
    let runtimeEventState = createChargingPointRuntimeEventState();
    runtimeEventState = reduceChargingPointRuntimeEventState(runtimeEventState, {
      event: "session.status",
      data: {
        type: "session.status",
        chargingPointId: baseDetail.id,
        occurredAt: "2026-07-04T09:00:00.000Z",
        resource: { scope: "session" },
        previousStatus: "offline",
        currentStatus: "online",
        connectionUrl: "ws://localhost:9000/ocpp/CP_001",
      },
    });
    runtimeEventState = reduceChargingPointRuntimeEventState(runtimeEventState, {
      event: "chargingPoint.status",
      data: {
        type: "chargingPoint.status",
        chargingPointId: baseDetail.id,
        occurredAt: "2026-07-04T09:00:01.000Z",
        resource: { scope: "chargingPoint" },
        previousStatus: null,
        currentStatus: "available",
      },
    });
    runtimeEventState = reduceChargingPointRuntimeEventState(runtimeEventState, {
      event: "connector.status",
      data: {
        type: "connector.status",
        chargingPointId: baseDetail.id,
        occurredAt: "2026-07-04T09:00:02.000Z",
        resource: { scope: "connector", evseId: 1, connectorId: 1 },
        previousStatus: null,
        currentStatus: "occupied",
      },
    });
    runtimeEventState = reduceChargingPointRuntimeEventState(runtimeEventState, {
      event: "transaction.status",
      data: {
        type: "transaction.status",
        chargingPointId: baseDetail.id,
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
    runtimeEventState = reduceChargingPointRuntimeEventState(runtimeEventState, {
      event: "protocol.message",
      data: {
        type: "protocol.message",
        chargingPointId: baseDetail.id,
        occurredAt: "2026-07-04T09:00:04.000Z",
        resource: { scope: "protocol" },
        direction: "received",
        action: "Heartbeat",
      },
    });

    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({
        status: "running",
        bootStatus: "Accepted",
      }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
      runtimeEventState,
    });

    expect(model.sessionStatus.label).toBe("会话在线");
    expect(model.chargingPointStatus.label).toBe("桩可用");
    expect(model.connectorSummary).toBe("1 枪 · 占用 1");
    expect(model.transactionSummary).toBe("进行中 1");
    expect(model.lastHeartbeatLabel).toBe("最后心跳 17:00:04");
  });

  test("shows runtime event issues in the recent issue metric", () => {
    const runtimeEventState = reduceChargingPointRuntimeEventState(
      createChargingPointRuntimeEventState(),
      {
        event: "connector.status",
        data: {
          type: "connector.status",
          chargingPointId: baseDetail.id,
          occurredAt: "2026-07-04T09:00:00.000Z",
          resource: { scope: "connector", evseId: 1, connectorId: 1 },
          previousStatus: "available",
          currentStatus: "faulted",
        },
      },
    );

    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({
        status: "running",
        bootStatus: "Accepted",
      }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
      runtimeEventState,
    });

    expect(model.connectorSummary).toBe("1 枪 · 故障 1");
    expect(model.recentIssue?.label).toBe("枪口 1/1 故障");
  });

  test("does not default unknown runtime status to stopped", () => {
    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: undefined,
      statusQueryState: "error",
      lastHeartbeatAt: null,
    });

    expect(model.mainStatus.label).toBe("状态未知");
    expect(model.primaryAction.disabled).toBe(true);
    expect(model.lastHeartbeatLabel).toBe("最后心跳 --");
  });
});
