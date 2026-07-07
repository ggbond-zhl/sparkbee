import type {
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";
import { describe, expect, test } from "vitest";

import { buildConnectorCardModels } from "../../src/features/charging-points/model/chargingPointConnectorCards";
import {
  createChargingPointRuntimeEventState,
  reduceChargingPointRuntimeEventState,
  type ChargingPointRuntimeEventState,
} from "../../src/features/charging-points/model/chargingPointRuntimeEvents";

const chargingPointId = "00000000-0000-4000-8000-000000000001";

const connector: ConnectorResponse = {
  id: "00000000-0000-4000-8000-000000000002",
  chargingPointId,
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
};

function runtimeStatus(
  status: RuntimeOperationResponse["status"],
): RuntimeOperationResponse {
  return {
    chargingPointId,
    status,
  };
}

function reduceConnectorStatus(
  state: ChargingPointRuntimeEventState,
  status: "available" | "occupied" | "unavailable" | "faulted",
) {
  return reduceChargingPointRuntimeEventState(state, {
    event: "connector.status",
    data: {
      type: "connector.status",
      chargingPointId,
      occurredAt: "2026-07-04T09:00:00.000Z",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      previousStatus: null,
      currentStatus: status,
    },
  });
}

describe("charging point connector cards", () => {
  test("shows only plug action for a running available connector", () => {
    const state = reduceConnectorStatus(
      createChargingPointRuntimeEventState(),
      "available",
    );

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.statusBadge.label).toBe("可用");
    expect(model?.connector).toBe(connector);
    expect(model?.fields).toEqual([
      { label: "枪口状态", value: "可用", tone: "success" },
      { label: "插枪状态", value: "未插枪", tone: "success" },
      { label: "交易状态", value: "无交易", tone: "neutral" },
      { label: "最近表值", value: "--" },
    ]);
    expect(model?.actions.map((action) => action.kind)).toEqual(["plug"]);
  });

  test("shows unplug and start charging actions for a plugged connector without transaction", () => {
    const state = reduceConnectorStatus(
      createChargingPointRuntimeEventState(),
      "occupied",
    );

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[1]).toEqual({
      label: "插枪状态",
      value: "已插枪",
      tone: "waiting",
    });
    expect(model?.actions.map((action) => action.kind)).toEqual([
      "unplug",
      "startCharging",
    ]);
  });

  test("shows only stop charging action when the connector has an active transaction", () => {
    let state = reduceConnectorStatus(
      createChargingPointRuntimeEventState(),
      "occupied",
    );
    state = reduceChargingPointRuntimeEventState(state, {
      event: "transaction.status",
      data: {
        type: "transaction.status",
        chargingPointId,
        occurredAt: "2026-07-04T09:00:01.000Z",
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
      event: "transaction.meterValue",
      data: {
        type: "transaction.meterValue",
        chargingPointId,
        occurredAt: "2026-07-04T09:00:02.000Z",
        resource: {
          scope: "transaction",
          evseId: 1,
          connectorId: 1,
          transactionId: "tx-1",
        },
        meterWh: 1200,
        sampledAt: "2026-07-04T09:00:02.000Z",
      },
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[2]).toEqual({
      label: "交易状态",
      value: "进行中",
      tone: "waiting",
    });
    expect(model?.fields[3]).toEqual({ label: "最近表值", value: "1200.000 Wh" });
    expect(model?.actions).toEqual([
      {
        kind: "stopCharging",
        label: "停止充电",
        transactionId: "tx-1",
      },
    ]);
  });

  test("hides actions when the charging point is not running", () => {
    const state = reduceConnectorStatus(
      createChargingPointRuntimeEventState(),
      "available",
    );

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("stopped"),
      runtimeEventState: state,
    });

    expect(model?.statusBadge.label).toBe("未运行");
    expect(model?.actions).toEqual([]);
  });

  test("formats meter value with 3 decimal places", () => {
    let state = reduceConnectorStatus(
      createChargingPointRuntimeEventState(),
      "occupied",
    );
    state = reduceChargingPointRuntimeEventState(state, {
      event: "transaction.meterValue",
      data: {
        type: "transaction.meterValue",
        chargingPointId,
        occurredAt: "2026-07-04T09:00:02.000Z",
        resource: {
          scope: "transaction",
          evseId: 1,
          connectorId: 1,
          transactionId: "tx-1",
        },
        meterWh: 116.66666666666667,
        sampledAt: "2026-07-04T09:00:02.000Z",
      },
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[3]).toEqual({ label: "最近表值", value: "116.667 Wh" });
  });

  test("shows connector issue without exposing unavailable actions", () => {
    const state = reduceConnectorStatus(
      createChargingPointRuntimeEventState(),
      "faulted",
    );

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.issue).toEqual({
      label: "枪口 1 故障",
      tone: "destructive",
    });
    expect(model?.actions).toEqual([]);
  });

  test("keeps rejected transaction attempts out of current connector state", () => {
    let state = reduceConnectorStatus(
      createChargingPointRuntimeEventState(),
      "occupied",
    );
    state = reduceChargingPointRuntimeEventState(state, {
      event: "transaction.status",
      data: {
        type: "transaction.status",
        chargingPointId,
        occurredAt: "2026-07-04T09:00:01.000Z",
        resource: {
          scope: "transaction",
          evseId: 1,
          connectorId: 1,
        },
        previousStatus: null,
        currentStatus: "rejected",
        reason: "未找到有效授权",
      },
    });

    const [model] = buildConnectorCardModels({
      connectors: [connector],
      runtimeStatus: runtimeStatus("running"),
      runtimeEventState: state,
    });

    expect(model?.fields[2]).toEqual({
      label: "交易状态",
      value: "无交易",
      tone: "neutral",
    });
    expect(model?.issue).toBeNull();
  });
});
