import { describe, expect, test } from "vitest";

import {
  chargingPointConnectorActionResponseSchema,
  createChargingPointRequestSchema,
  createConnectorRequestSchema,
  listChargingPointsQuerySchema,
  runtimeAuthorizeRequestSchema,
  runtimeAuthorizeResponseSchema,
  runtimeOperationResponseSchema,
  runtimeSnapshotResponseSchema,
  runtimeStartTransactionRequestSchema,
  runtimeStartTransactionResponseSchema,
  runtimeStopTransactionRequestSchema,
  runtimeStopTransactionResponseSchema,
} from "../../src";

describe("chargingPoint contract schemas", () => {
  test("normalizes chargingPoint create input", () => {
    expect(
      createChargingPointRequestSchema.parse({
        name: " 调试桩 A ",
        description: "  ",
        identity: " CP001 ",
        protocol: "OCPP16J",
        centralSystemUrl: " ws://localhost:9000/ocpp ",
        vendor: " SparkBee ",
        model: " DebugBox ",
        firmwareVersion: "  ",
        serialNumber: " SN-001 ",
      }),
    ).toEqual({
      name: "调试桩 A",
      description: null,
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
      firmwareVersion: null,
      serialNumber: "SN-001",
    });
  });

  test("rejects invalid chargingPoint identity", () => {
    expect(() =>
      createChargingPointRequestSchema.parse({
        name: "调试桩 A",
        identity: "CP 001",
        protocol: "OCPP16J",
        centralSystemUrl: "ws://localhost:9000/ocpp",
        vendor: "SparkBee",
        model: "DebugBox",
      }),
    ).toThrow();
  });

  test("normalizes list query defaults and coercion", () => {
    expect(listChargingPointsQuerySchema.parse({ keyword: " CP " })).toEqual({
      page: 1,
      pageSize: 20,
      keyword: "CP",
    });

    expect(listChargingPointsQuerySchema.parse({ page: "2", pageSize: "10" })).toEqual({
      page: 2,
      pageSize: 10,
    });

    expect(() =>
      listChargingPointsQuerySchema.parse({ page: "1", pageSize: "30" }),
    ).toThrow();
  });

  test("requires connector rated voltage and current while ignoring deprecated maxPower", () => {
    expect(
      createConnectorRequestSchema.parse({
        evseId: 1,
        connectorId: 1,
        type: " Type2 ",
        format: "socket",
        powerType: "ac",
        maxVoltage: 230,
        maxCurrent: 32,
        maxPower: 7360,
      }),
    ).toEqual({
      evseId: 1,
      connectorId: 1,
      type: "Type2",
      format: "socket",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
    });

    expect(() =>
      createConnectorRequestSchema.parse({
        evseId: 1,
        connectorId: 1,
        type: "Type2",
        format: "socket",
        powerType: "ac",
        maxCurrent: 32,
      }),
    ).toThrow();
    expect(() =>
      createConnectorRequestSchema.parse({
        evseId: 1,
        connectorId: 1,
        type: "Type2",
        format: "socket",
        powerType: "ac",
        maxVoltage: null,
        maxCurrent: 32,
      }),
    ).toThrow();
  });

  test("describes runtime operation response in Chinese", () => {
    expect(
      runtimeOperationResponseSchema.parse({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        status: "starting",
        bootStatus: "Pending",
        retryAfterSec: 30,
      }),
    ).toEqual({
      chargingPointId: "00000000-0000-4000-8000-000000000001",
      status: "starting",
      bootStatus: "Pending",
      retryAfterSec: 30,
    });
    expect(runtimeOperationResponseSchema.shape.status.description).toBe(
      "当前服务进程中的运行状态。",
    );
  });

  test("describes runtime snapshot response in Chinese", () => {
    expect(
      runtimeSnapshotResponseSchema.parse({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        runtimeStatus: {
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          status: "running",
        },
        sessionStatus: {
          currentStatus: "online",
          occurredAt: "2026-07-04T09:00:00.000Z",
          connectionUrl: "ws://localhost:9000/ocpp/CP001",
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
      }),
    ).toMatchObject({
      sessionStatus: { currentStatus: "online" },
      connectorStatuses: [{ currentStatus: "occupied" }],
    });
    expect(runtimeSnapshotResponseSchema.shape.sessionStatus.description).toBe(
      "桩实例当前会话状态；没有运行态事件时为 null。",
    );
  });

  test("describes connector action response with business and protocol ids", () => {
    expect(
      chargingPointConnectorActionResponseSchema.parse({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        connectorId: "00000000-0000-4000-8000-000000000002",
        evseId: 1,
        protocolConnectorId: 2,
        plugState: "plugged",
        vehiclePresence: "detected",
        connectorStatus: "occupied",
      }),
    ).toEqual({
      chargingPointId: "00000000-0000-4000-8000-000000000001",
      connectorId: "00000000-0000-4000-8000-000000000002",
      evseId: 1,
      protocolConnectorId: 2,
      plugState: "plugged",
      vehiclePresence: "detected",
      connectorStatus: "occupied",
    });
    expect(chargingPointConnectorActionResponseSchema.shape.connectorId.description)
      .toBe("枪口的 UUID 主键。");
    expect(
      chargingPointConnectorActionResponseSchema.shape.protocolConnectorId.description,
    ).toBe("枪口在 OCPP 协议中的 connectorId。");
  });

  test("normalizes runtime authorize input and describes authorize results", () => {
    expect(runtimeAuthorizeRequestSchema.parse({ idTag: " CARD001 " })).toEqual({
      idTag: "CARD001",
    });
    expect(() => runtimeAuthorizeRequestSchema.parse({ idTag: "" })).toThrow();
    expect(() =>
      runtimeAuthorizeRequestSchema.parse({ idTag: "123456789012345678901" }),
    ).toThrow();

    expect(
      runtimeAuthorizeResponseSchema.parse({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        connectorId: "00000000-0000-4000-8000-000000000002",
        evseId: 1,
        protocolConnectorId: 2,
        idTag: "CARD001",
        status: "rejected",
        reason: "Authorize 被中心系统拒绝",
        authorizationStatus: "Invalid",
      }),
    ).toEqual({
      chargingPointId: "00000000-0000-4000-8000-000000000001",
      connectorId: "00000000-0000-4000-8000-000000000002",
      evseId: 1,
      protocolConnectorId: 2,
      idTag: "CARD001",
      status: "rejected",
      reason: "Authorize 被中心系统拒绝",
      authorizationStatus: "Invalid",
    });
  });

  test("normalizes runtime transaction inputs and describes transaction results", () => {
    expect(runtimeStartTransactionRequestSchema.parse({ idTag: " CARD001 " })).toEqual({
      idTag: "CARD001",
    });
    expect(
      runtimeStartTransactionRequestSchema.parse({
        idTag: "CARD001",
        meterStartWh: 0,
        reservationId: 123,
      }),
    ).toEqual({
      idTag: "CARD001",
      meterStartWh: 0,
      reservationId: 123,
    });
    expect(() =>
      runtimeStartTransactionRequestSchema.parse({ idTag: "123456789012345678901" }),
    ).toThrow();

    expect(
      runtimeStopTransactionRequestSchema.parse({
        transactionId: " 1001 ",
        meterStopWh: 100,
        idTag: " CARD001 ",
      }),
    ).toEqual({
      transactionId: "1001",
      meterStopWh: 100,
      idTag: "CARD001",
    });
    expect(
      runtimeStopTransactionRequestSchema.parse({
        transactionId: "1001",
        reason: "ev-disconnected",
      }),
    ).toEqual({
      transactionId: "1001",
      reason: "ev-disconnected",
    });

    expect(
      runtimeStartTransactionResponseSchema.parse({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        connectorId: "00000000-0000-4000-8000-000000000002",
        evseId: 1,
        protocolConnectorId: 2,
        idTag: "CARD001",
        status: "accepted",
        transactionId: "1001",
      }),
    ).toMatchObject({
      status: "accepted",
      transactionId: "1001",
    });
    expect(
      runtimeStopTransactionResponseSchema.parse({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        connectorId: "00000000-0000-4000-8000-000000000002",
        evseId: 1,
        protocolConnectorId: 2,
        status: "accepted",
        transactionId: "1001",
        meterStopWh: 100,
        stoppedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      status: "accepted",
      meterStopWh: 100,
    });
    expect(runtimeStopTransactionRequestSchema.shape.reason.description).toContain(
      "未提供时 OCPP StopTransaction 不携带 reason",
    );
  });
});
