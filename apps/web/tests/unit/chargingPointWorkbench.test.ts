import type { ChargingPointDetailResponse } from "@spark-bee/contracts";
import { describe, expect, test, vi } from "vitest";

import {
  createChargingPointRuntimeEventFeedState,
  createChargingPointRuntimeEventState,
} from "../../src/features/charging-points/model/chargingPointRuntimeEvents";
import { createReadyChargingPointWorkbench } from "../../src/features/charging-points/model/chargingPointWorkbench";

const detail: ChargingPointDetailResponse = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "调试桩 A",
  description: null,
  identity: "CP001",
  protocol: "OCPP16J",
  centralSystemUrl: "ws://localhost:9000/ocpp",
  vendor: "SparkBee",
  model: "DebugBox",
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
      maxVoltage: 230,
      maxCurrent: 32,
      maxPower: null,
      sortOrder: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("charging point workbench", () => {
  test("exposes one ready interface and applies the stopped primary action", () => {
    const startRuntime = vi.fn();
    const stopRuntime = vi.fn();
    const workbench = createReadyChargingPointWorkbench({
      detail,
      runtimeStatus: {
        chargingPointId: detail.id,
        status: "stopped",
        runningIntent: "stopped",
      },
      runtimeStatusQueryState: "success",
      runtimeEventState: createChargingPointRuntimeEventState(),
      eventFeedState: createChargingPointRuntimeEventFeedState(),
      activeTransactionSamples: { items: [] },
      pending: { runtime: false, connectors: false },
      actions: {
        startRuntime,
        stopRuntime,
        plug: vi.fn(),
        unplug: vi.fn(),
        startTransaction: vi.fn(),
        stopTransaction: vi.fn(),
      },
      chargingPointEditor: {
        open: false,
        openEditor: vi.fn(),
        setOpen: vi.fn(),
        save: vi.fn(async () => undefined),
      },
      connectorEditor: {
        target: null,
        open: vi.fn(),
        setOpen: vi.fn(),
        save: vi.fn(async () => undefined),
      },
    });

    expect(workbench.configuration).toEqual({
      locked: false,
      lockedReason: undefined,
      connectorEditLockedReason: undefined,
    });
    expect(workbench.connectorItems).toHaveLength(1);

    workbench.runtime.applyPrimaryAction();

    expect(startRuntime).toHaveBeenCalledOnce();
    expect(stopRuntime).not.toHaveBeenCalled();
  });

  test("exposes retry and explicit stop actions when running intent remains active", () => {
    const startRuntime = vi.fn();
    const stopRuntime = vi.fn();
    const workbench = createReadyChargingPointWorkbench({
      detail,
      runtimeStatus: {
        chargingPointId: detail.id,
        status: "stopped",
        runningIntent: "running",
      },
      runtimeStatusQueryState: "success",
      runtimeEventState: createChargingPointRuntimeEventState(),
      eventFeedState: createChargingPointRuntimeEventFeedState(),
      activeTransactionSamples: { items: [] },
      pending: { runtime: false, connectors: false },
      actions: {
        startRuntime,
        stopRuntime,
        plug: vi.fn(),
        unplug: vi.fn(),
        startTransaction: vi.fn(),
        stopTransaction: vi.fn(),
      },
      chargingPointEditor: {
        open: false,
        openEditor: vi.fn(),
        setOpen: vi.fn(),
        save: vi.fn(async () => undefined),
      },
      connectorEditor: {
        target: null,
        open: vi.fn(),
        setOpen: vi.fn(),
        save: vi.fn(async () => undefined),
      },
    });

    expect(workbench.headerModel.primaryAction.label).toBe("重试启动");
    expect(workbench.headerModel.secondaryAction?.label).toBe("取消自动恢复");
    workbench.runtime.applyPrimaryAction();
    workbench.runtime.applySecondaryAction?.();

    expect(startRuntime).toHaveBeenCalledOnce();
    expect(stopRuntime).toHaveBeenCalledOnce();
  });

  test("locks configuration and applies stop while the charging point is running", () => {
    const startRuntime = vi.fn();
    const stopRuntime = vi.fn();
    const workbench = createReadyChargingPointWorkbench({
      detail,
      runtimeStatus: {
        chargingPointId: detail.id,
        status: "running",
        runningIntent: "running",
        bootStatus: "Accepted",
      },
      runtimeStatusQueryState: "success",
      runtimeEventState: createChargingPointRuntimeEventState(),
      eventFeedState: createChargingPointRuntimeEventFeedState(),
      activeTransactionSamples: { items: [] },
      pending: { runtime: true, connectors: false },
      actions: {
        startRuntime,
        stopRuntime,
        plug: vi.fn(),
        unplug: vi.fn(),
        startTransaction: vi.fn(),
        stopTransaction: vi.fn(),
      },
      chargingPointEditor: {
        open: false,
        openEditor: vi.fn(),
        setOpen: vi.fn(),
        save: vi.fn(async () => undefined),
      },
      connectorEditor: {
        target: null,
        open: vi.fn(),
        setOpen: vi.fn(),
        save: vi.fn(async () => undefined),
      },
    });

    expect(workbench.configuration).toMatchObject({
      locked: true,
      lockedReason: "请先停止桩实例再编辑桩实例配置。",
      connectorEditLockedReason: "请先停止桩实例再编辑枪口配置。",
    });
    expect(workbench.runtime.pending).toBe(true);

    workbench.runtime.applyPrimaryAction();

    expect(stopRuntime).toHaveBeenCalledOnce();
    expect(startRuntime).not.toHaveBeenCalled();
  });
});
