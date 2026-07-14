import type {
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";
import { describe, expect, test } from "vitest";

import { buildConnectorCardModels } from "../../src/features/charging-points/model/chargingPointConnectorCards";
import {
  createChargingPointRuntimeEventState,
  reduceChargingPointRuntimeEventState,
} from "../../src/features/charging-points/model/chargingPointRuntimeEvents";

const chargingPointId = "00000000-0000-4000-8000-000000000001";

const connector: ConnectorResponse = {
  id: "00000000-0000-4000-8000-000000000002",
  chargingPointId,
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
};

function runtimeStatus(
  status: RuntimeOperationResponse["status"],
): RuntimeOperationResponse {
  return {
    chargingPointId,
    status,
  };
}

function createRuntimeState(input: {
  connectorStatus: "available" | "occupied" | "unavailable" | "faulted";
  connectorAvailability?: {
    currentAvailability: "operative" | "inoperative";
    requestedAvailability?: "operative" | "inoperative";
  } | null;
  transaction?: {
    status: "active" | "ended" | "rejected";
    meterWh?: number;
  };
}) {
  const connectorAvailability = input.connectorAvailability === undefined
    ? { currentAvailability: "operative" as const }
    : input.connectorAvailability;

  return reduceChargingPointRuntimeEventState(createChargingPointRuntimeEventState(), {
    event: "snapshot",
    data: {
      chargingPointId,
      runtimeStatus: runtimeStatus("running"),
      sessionStatus: null,
      chargingPointStatus: null,
      chargingPointAvailability: null,
      evseStatuses: [],
      connectorStatuses: [
        {
          evseId: 1,
          connectorId: 1,
          currentStatus: input.connectorStatus,
          occurredAt: "2026-07-04T09:00:00.000Z",
        },
      ],
      connectorAvailabilities: connectorAvailability === null
        ? []
        : [
            {
              evseId: 1,
              connectorId: 1,
              currentAvailability: connectorAvailability.currentAvailability,
              ...(connectorAvailability.requestedAvailability === undefined
                ? {}
                : {
                    requestedAvailability:
                      connectorAvailability.requestedAvailability,
                  }),
              occurredAt: "2026-07-04T09:00:00.500Z",
            },
          ],
      transactionStatuses: input.transaction === undefined
        ? []
        : [
        {
          transactionId: input.transaction.status === "rejected" ? "1/1" : "tx-1",
          evseId: 1,
          connectorId: 1,
          currentStatus: input.transaction.status,
          ...(input.transaction.status === "rejected"
            ? { reason: "未找到有效授权" }
            : {}),
          ...(input.transaction.meterWh === undefined
            ? {}
            : {
                meterWh: input.transaction.meterWh,
                sampledAt: "2026-07-04T09:00:02.000Z",
              }),
          occurredAt: input.transaction.meterWh === undefined
            ? "2026-07-04T09:00:01.000Z"
            : "2026-07-04T09:00:02.000Z",
        },
      ],
      lastHeartbeatAt: null,
      recentIssue: null,
    },
  });
}

describe("charging point connector cards", () => {
  test("shows only plug action for a running available connector", () => {
    const state = createRuntimeState({ connectorStatus: "available" });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.connector).toBe(connector);
    expect(model?.description).toBe("EVSE 1 · 欧标交流 Type 2 · 插座型 · 交流");
    expect(model?.fields).toEqual([
      { label: "枪口状态", value: "可用 / 未插枪", tone: "success", span: "full" },
      { label: "交易状态", value: "无交易", tone: "neutral" },
      { label: "可用性", value: "可用", tone: "success" },
    ]);
    expect(model?.fields.map((field) => field.label)).not.toContain("插枪状态");
    expect(model?.actions.map((action) => action.kind)).toEqual(["plug"]);
  });

  test("describes connector format and power type in Chinese", () => {
    const state = createRuntimeState({ connectorStatus: "available" });

    const models = buildConnectorCardModels({
      connectors: [
        connector,
        {
          ...connector,
          id: "00000000-0000-4000-8000-000000000003",
          connectorId: 2,
          type: "IEC_62196_T2_COMBO",
          format: "cable",
          powerType: "dc",
          sortOrder: 2,
        },
        {
          ...connector,
          id: "00000000-0000-4000-8000-000000000004",
          connectorId: 3,
          type: "SAE_J3400",
          format: "unknown",
          powerType: "unknown",
          sortOrder: 3,
        },
      ],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(models.map((model) => model.description)).toEqual([
      "EVSE 1 · 欧标交流 Type 2 · 插座型 · 交流",
      "EVSE 1 · 欧标直流 CCS2 · 线缆型 · 直流",
      "EVSE 1 · 北美 NACS · 未知形态 · 未知供电",
    ]);
    expect(models[2]?.description).not.toContain("unknown");
  });

  test("shows unplug and start charging actions for a plugged connector without transaction", () => {
    const state = createRuntimeState({ connectorStatus: "occupied" });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[0]).toEqual({
      label: "枪口状态",
      value: "占用 / 已插枪",
      tone: "waiting",
      span: "full",
    });
    expect(model?.fields[2]).toEqual({
      label: "可用性",
      value: "可用",
      tone: "success",
    });
    expect(model?.actions.map((action) => action.kind)).toEqual([
      "unplug",
      "startCharging",
    ]);
  });

  test("shows only stop charging action when the connector has an active transaction", () => {
    const state = createRuntimeState({
      connectorStatus: "occupied",
      transaction: {
        status: "active",
        meterWh: 1200,
      },
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[1]).toEqual({
      label: "交易状态",
      value: "进行中",
      tone: "waiting",
    });
    expect(model?.fields[2]).toEqual({
      label: "可用性",
      value: "可用",
      tone: "success",
    });
    expect(model?.actions).toEqual([
      {
        kind: "stopCharging",
        label: "停止充电",
        transactionId: "tx-1",
      },
    ]);
  });

  test("shows no transaction after the transaction has ended", () => {
    const state = createRuntimeState({
      connectorStatus: "occupied",
      transaction: {
        status: "ended",
      },
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[1]).toEqual({
      label: "交易状态",
      value: "无交易",
      tone: "neutral",
    });
  });

  test("hides actions when the charging point is not running", () => {
    const state = createRuntimeState({ connectorStatus: "available" });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("stopped"),
      runtimeEventState: state,
    });

    expect(model?.fields[0]).toEqual({
      label: "枪口状态",
      value: "未运行",
      tone: "neutral",
      span: "full",
    });
    expect(model?.fields.some((field) => field.value === "--")).toBe(false);
    expect(model?.actions).toEqual([]);
  });

  test("shows unavailable connector availability without meter value", () => {
    const state = createRuntimeState({
      connectorStatus: "unavailable",
      connectorAvailability: { currentAvailability: "inoperative" },
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[0]).toEqual({
      label: "枪口状态",
      value: "不可用",
      tone: "warning",
      span: "full",
    });
    expect(model?.fields[2]).toEqual({
      label: "可用性",
      value: "不可用",
      tone: "warning",
    });
    expect(model?.fields.some((field) => field.value === "--")).toBe(false);
  });

  test("shows pending connector availability separately from connector status", () => {
    const state = createRuntimeState({
      connectorStatus: "occupied",
      connectorAvailability: {
        currentAvailability: "operative",
        requestedAvailability: "inoperative",
      },
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[0]).toMatchObject({
      label: "枪口状态",
      value: "占用 / 已插枪",
    });
    expect(model?.fields[2]).toEqual({
      label: "可用性",
      value: "可用 · 待切换为不可用",
      tone: "warning",
    });
  });

  test("waits for connector availability when only connector status is known", () => {
    const state = createRuntimeState({
      connectorStatus: "available",
      connectorAvailability: null,
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[2]).toEqual({
      label: "可用性",
      value: "等待同步",
      tone: "waiting",
    });
  });

  test("shows connector issue without exposing unavailable actions", () => {
    const state = createRuntimeState({ connectorStatus: "faulted" });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[0]).toEqual({
      label: "枪口状态",
      value: "故障",
      tone: "destructive",
      span: "full",
    });
    expect(model?.fields.some((field) => field.value === "--")).toBe(false);
    expect(model?.issue).toEqual({
      label: "枪口 1 故障",
      tone: "destructive",
    });
    expect(model?.actions).toEqual([]);
  });

  test("keeps rejected transaction attempts out of current connector state", () => {
    const state = createRuntimeState({
      connectorStatus: "occupied",
      transaction: {
        status: "rejected",
      },
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[1]).toEqual({
      label: "交易状态",
      value: "无交易",
      tone: "neutral",
    });
    expect(model?.issue).toBeNull();
  });
});
