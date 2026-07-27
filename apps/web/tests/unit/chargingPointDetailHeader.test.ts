import type {
  ChargingPointDetailResponse,
  RuntimeOperationResponse,
  RuntimeSnapshotResponse,
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
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function buildRuntimeStatus(
  input: Partial<RuntimeOperationResponse>,
): RuntimeOperationResponse {
  const status = input.status ?? "stopped";
  return {
    chargingPointId: baseDetail.id,
    status,
    runningIntent: status === "stopped" ? "stopped" : "running",
    ...input,
  };
}

function buildRuntimeEventState(
  input: Partial<Omit<RuntimeSnapshotResponse, "chargingPointId" | "runtimeStatus">>,
) {
  return reduceChargingPointRuntimeEventState(createChargingPointRuntimeEventState(), {
    event: "snapshot",
    data: {
      chargingPointId: baseDetail.id,
      runtimeStatus: buildRuntimeStatus({ status: "running", bootStatus: "Accepted" }),
      sessionStatus: null,
      chargingPointStatus: null,
      chargingPointAvailability: null,
      evseStatuses: [],
      connectorStatuses: [],
      connectorAvailabilities: [],
      transactionStatuses: [],
      lastHeartbeatAt: null,
      recentIssue: null,
      ...input,
    },
  });
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
    expect(model).not.toHaveProperty("runningIntentStatus");
    expect(model.lastHeartbeatLabel).toBe("最后心跳 --");
    expect(model.operability.label).toBe("可启动");
    expect(model.primaryAction).toMatchObject({
      kind: "start",
      label: "启动",
      disabled: false,
    });
    expect(model.sessionStatus.label).toBe("会话未建立");
    expect(model.chargingPointStatus.label).toBe("桩状态未同步");
  });

  test("keeps recovery choices without exposing running intent status", () => {
    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({
        status: "stopped",
        runningIntent: "running",
      }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
    });

    expect(model).not.toHaveProperty("runningIntentStatus");
    expect(model.mainStatus.label).toBe("已停止");
    expect(model.primaryAction).toMatchObject({
      kind: "start",
      label: "重试启动",
      disabled: false,
    });
    expect(model.secondaryAction).toMatchObject({
      kind: "stop",
      label: "取消自动恢复",
      disabled: false,
    });
  });

  test("omits connector and transaction summaries from the detail header", () => {
    const model = buildChargingPointDetailHeaderModel({
      detail: baseDetail,
      runtimeStatus: buildRuntimeStatus({ status: "running", bootStatus: "Accepted" }),
      statusQueryState: "success",
      lastHeartbeatAt: null,
    });

    expect(model).not.toHaveProperty("connectorSummary");
    expect(model).not.toHaveProperty("transactionSummary");
  });

  test("exposes runtime communication summary", () => {
    const runtimeEventState = buildRuntimeEventState({
      sessionStatus: {
        currentStatus: "reconnecting",
        occurredAt: "2026-07-04T09:00:00.000Z",
        connectionUrl: "ws://localhost:9000/ocpp/CP_001",
        attempt: 2,
      },
      chargingPointStatus: {
        currentStatus: "unavailable",
        occurredAt: "2026-07-04T09:00:01.000Z",
      },
      chargingPointAvailability: {
        currentAvailability: "operative",
        requestedAvailability: "inoperative",
        occurredAt: "2026-07-04T09:00:02.000Z",
      },
      lastHeartbeatAt: "2026-07-04T09:00:04.000Z",
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

    const summaryItemsByLabel = Object.fromEntries(
      model.runtimeSummaryItems.map((item) => [item.label, item]),
    );

    expect(Object.keys(summaryItemsByLabel)).toEqual([
      "Boot 状态",
      "会话状态",
      "可用性",
      "充电桩状态",
    ]);
    expect(summaryItemsByLabel["Boot 状态"]).toMatchObject({
      value: "待接受 · 12 秒后再次上报",
    });
    expect(summaryItemsByLabel.会话状态).toMatchObject({
      value: "会话重连中 · 第 2 次",
    });
    expect(summaryItemsByLabel.可用性).toMatchObject({
      value: "可用 · 待切换为不可用",
      tone: "warning",
    });
    expect(summaryItemsByLabel.充电桩状态).toMatchObject({
      value: "不可用",
      tone: "warning",
    });
    expect(model.finalConnectionUrl).toBe("ws://localhost:9000/ocpp/CP_001");
  });

  test("puts the offline reason in the session summary", () => {
    const runtimeEventState = buildRuntimeEventState({
      sessionStatus: {
        currentStatus: "offline",
        occurredAt: "2026-07-04T09:00:00.000Z",
        connectionUrl: "ws://localhost:9000/ocpp/CP_001",
        reason: "unexpected_disconnect",
      },
      recentIssue: {
        label: "会话意外断开",
        tone: "warning",
        occurredAt: "2026-07-04T09:00:00.000Z",
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

    const sessionSummaryItem = model.runtimeSummaryItems.find(
      (item) => item.label === "会话状态",
    );

    expect(sessionSummaryItem).toMatchObject({
      value: "会话离线 · 底层连接意外断开",
    });
    expect(model.recentIssue?.label).toBe("会话意外断开");
    expect(model.runtimeSummaryItems.map((item) => item.label)).not.toContain(
      "最近异常",
    );
    expect(model.runtimeSummaryItems.map((item) => item.label)).not.toContain(
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
    expect(model.runtimeSummaryItems.map((item) => item.label)).not.toContain(
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
    const localHeartbeatAt = new Date(2026, 6, 4, 17, 0, 4);
    const runtimeEventState = buildRuntimeEventState({
      sessionStatus: {
        currentStatus: "online",
        occurredAt: "2026-07-04T09:00:00.000Z",
        connectionUrl: "ws://localhost:9000/ocpp/CP_001",
      },
      chargingPointStatus: {
        currentStatus: "available",
        occurredAt: "2026-07-04T09:00:01.000Z",
      },
      chargingPointAvailability: {
        currentAvailability: "operative",
        occurredAt: "2026-07-04T09:00:01.500Z",
      },
      connectorStatuses: [
        {
          evseId: 1,
          connectorId: 1,
          currentStatus: "occupied",
          occurredAt: "2026-07-04T09:00:02.000Z",
        },
      ],
      transactionStatuses: [
        {
          transactionId: "tx-1",
          evseId: 1,
          connectorId: 1,
          currentStatus: "active",
          occurredAt: "2026-07-04T09:00:03.000Z",
        },
      ],
      lastHeartbeatAt: localHeartbeatAt.toISOString(),
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
    expect(model.runtimeSummaryItems.find(
      (item) => item.label === "可用性",
    )).toMatchObject({
      value: "可用",
      tone: "success",
    });
    expect(model.runtimeSummaryItems.find(
      (item) => item.label === "充电桩状态",
    )).toMatchObject({
      value: "可用",
      tone: "success",
    });
    expect(model.lastHeartbeatLabel).toBe("最后心跳 17:00:04");
  });

  test("shows faulted charging point status in the runtime summary", () => {
    const runtimeEventState = buildRuntimeEventState({
      chargingPointStatus: {
        currentStatus: "faulted",
        occurredAt: "2026-07-04T09:00:01.000Z",
      },
      chargingPointAvailability: {
        currentAvailability: "inoperative",
        occurredAt: "2026-07-04T09:00:01.500Z",
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

    expect(model.runtimeSummaryItems.find(
      (item) => item.label === "可用性",
    )).toMatchObject({
      value: "不可用",
      tone: "warning",
    });
    expect(model.runtimeSummaryItems.find(
      (item) => item.label === "充电桩状态",
    )).toMatchObject({
      value: "故障",
      tone: "destructive",
    });
  });

  test("shows runtime event issues in the recent issue metric", () => {
    const runtimeEventState = buildRuntimeEventState({
      connectorStatuses: [
        {
          evseId: 1,
          connectorId: 1,
          currentStatus: "faulted",
          occurredAt: "2026-07-04T09:00:00.000Z",
        },
      ],
      recentIssue: {
        label: "枪口 1 故障",
        tone: "destructive",
        occurredAt: "2026-07-04T09:00:00.000Z",
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

    expect(model.recentIssue?.label).toBe("枪口 1 故障");
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
