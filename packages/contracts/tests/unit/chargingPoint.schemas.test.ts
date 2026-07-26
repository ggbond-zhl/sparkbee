import { describe, expect, test } from "vitest";

import {
  chargingPointEventStreamMessageSchema,
  protocolConfigurationListResponseSchema,
  updateProtocolConfigurationRequestSchema,
  updateProtocolConfigurationResponseSchema,
  chargingPointConnectorActionResponseSchema,
  activeTransactionSamplesResponseSchema,
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
  transactionDeliveryStatusSchema,
  listTransactionDeliveriesQuerySchema,
  listTransactionDeliveriesResponseSchema,
  transactionDeliverySummarySchema,
} from "../../src";

describe("chargingPoint contract schemas", () => {
  test("validates protocol configuration list, update, and stream event contracts", () => {
    const chargingPointId = "00000000-0000-4000-8000-000000000001";
    const entry = {
      key: "HeartbeatInterval",
      value: "30",
      defaultValue: "60",
      readonly: false,
      valueType: "integer",
      rebootRequired: false,
      minValue: 0,
      maxValue: null,
      description: "Heartbeat.req 的发送间隔，单位为秒。",
      version: 2,
      pendingRestart: false,
      lastModifiedBy: "csms",
      updatedAt: "2026-07-22T08:00:00.000Z",
    } as const;

    expect(protocolConfigurationListResponseSchema.parse({
      chargingPointId,
      protocol: "OCPP16J",
      items: [entry],
    }).items).toEqual([entry]);
    expect(updateProtocolConfigurationRequestSchema.parse({
      value: " 30 ",
      expectedVersion: 2,
    })).toEqual({ value: " 30 ", expectedVersion: 2 });
    expect(updateProtocolConfigurationResponseSchema.parse({
      status: "accepted",
      item: entry,
    })).toEqual({ status: "accepted", item: entry });

    const event = {
      event: "configuration.changed",
      data: {
        id: "event-configuration-1",
        sequence: 3,
        type: "configuration.changed",
        chargingPointId,
        protocol: "OCPP16J",
        resource: { scope: "configuration", key: "HeartbeatInterval" },
        occurredAt: "2026-07-22T08:00:00.000Z",
        value: "30",
        version: 2,
        lastModifiedBy: "csms",
        pendingRestart: false,
      },
    } as const;
    expect(chargingPointEventStreamMessageSchema.parse(event)).toEqual(event);
  });

  test("validates persisted active transaction charging samples", () => {
    expect(activeTransactionSamplesResponseSchema.parse({
      items: [
        {
          transactionId: "tx-1",
          evseId: 1,
          connectorId: 1,
          samples: [
            {
              id: "sample-1",
              sampledAt: "2026-07-04T09:00:00.000Z",
              meterWh: 100,
              powerW: 7000,
              currentA: 31,
              voltageV: 226,
            },
          ],
        },
      ],
    }).items[0]?.samples).toHaveLength(1);
  });

  test("validates the complete charging point event stream interface", () => {
    const chargingPointId = "00000000-0000-4000-8000-000000000001";
    const meterValueMessage = {
      event: "transaction.meterValue",
      data: {
        id: "event-1",
        sequence: 1,
        type: "transaction.meterValue",
        chargingPointId,
        protocol: "OCPP16J",
        resource: {
          scope: "transaction",
          evseId: 1,
          connectorId: 1,
          transactionId: "transaction-1",
        },
        occurredAt: "2026-07-10T00:00:00.000Z",
        meterWh: 100,
        powerW: 7360,
        currentA: 32,
        voltageV: 230,
        sampledAt: "2026-07-10T00:00:00.000Z",
      },
    } as const;

    expect(chargingPointEventStreamMessageSchema.parse(meterValueMessage)).toEqual(
      meterValueMessage,
    );
    const bootMessage = {
      event: "chargingPoint.boot",
      data: {
        id: "event-2",
        sequence: 2,
        type: "chargingPoint.boot",
        chargingPointId,
        protocol: "OCPP16J",
        resource: { scope: "chargingPoint" },
        occurredAt: "2026-07-10T00:00:01.000Z",
        status: "Pending",
        retryAfterSec: 10,
      },
    } as const;
    expect(chargingPointEventStreamMessageSchema.parse(bootMessage)).toEqual(
      bootMessage,
    );
    const transactionDeliveryMessage = {
      event: "transaction-delivery.changed",
      data: {
        id: "event-delivery-1",
        sequence: 3,
        type: "transaction-delivery.changed",
        chargingPointId,
        protocol: "OCPP16J",
        resource: {
          scope: "transactionDelivery",
          transactionId: "transaction-1",
          messageId: "00000000-0000-4000-8000-000000000011",
          deliverySequence: "42",
        },
        occurredAt: "2026-07-10T00:00:02.000Z",
        messageType: "start",
        previousStatus: "pending",
        currentStatus: "in_flight",
        attemptCount: 1,
        nextAttemptAt: null,
        lastError: null,
      },
    } as const;
    expect(
      chargingPointEventStreamMessageSchema.parse(transactionDeliveryMessage),
    ).toEqual(transactionDeliveryMessage);
    expect(
      chargingPointEventStreamMessageSchema.safeParse({
        ...meterValueMessage,
        data: { ...meterValueMessage.data, sampledAt: "not-a-date" },
      }).success,
    ).toBe(false);
    expect(
      chargingPointEventStreamMessageSchema.parse({
        event: "deleted",
        data: { chargingPointId },
      }),
    ).toEqual({ event: "deleted", data: { chargingPointId } });
  });

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
        type: "IEC_62196_T2",
        format: "socket",
        powerType: "ac",
        maxVoltage: 230,
        maxCurrent: 32,
        maxPower: 7360,
      }),
    ).toEqual({
      evseId: 1,
      connectorId: 1,
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
    });

    expect(() =>
      createConnectorRequestSchema.parse({
        evseId: 1,
        connectorId: 1,
        type: "IEC_62196_T2",
        format: "socket",
        powerType: "ac",
        maxCurrent: 32,
      }),
    ).toThrow();
    expect(() =>
      createConnectorRequestSchema.parse({
        evseId: 1,
        connectorId: 1,
        type: "IEC_62196_T2",
        format: "socket",
        powerType: "ac",
        maxVoltage: null,
        maxCurrent: 32,
      }),
    ).toThrow();
  });

  test("restricts connector type to supported standards and describes them", () => {
    expect(
      createConnectorRequestSchema.parse({
        evseId: 1,
        connectorId: 1,
        type: "GBT_DC",
        format: "cable",
        powerType: "dc",
        maxVoltage: 750,
        maxCurrent: 250,
      }),
    ).toMatchObject({
      type: "GBT_DC",
    });

    expect(() =>
      createConnectorRequestSchema.parse({
        evseId: 1,
        connectorId: 1,
        type: "Type2",
        format: "socket",
        powerType: "ac",
        maxVoltage: 230,
        maxCurrent: 32,
      }),
    ).toThrow();
    expect(createConnectorRequestSchema.shape.type.description).toContain(
      "IEC_62196_T2: 欧标交流 Type 2",
    );
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
        chargingPointAvailability: {
          currentAvailability: "operative",
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
        connectorAvailabilities: [
          {
            evseId: 1,
            connectorId: 1,
            currentAvailability: "operative",
            requestedAvailability: "inoperative",
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
            powerW: 7200,
            currentA: 32,
            voltageV: 225,
            sampledAt: "2026-07-04T09:00:04.000Z",
            occurredAt: "2026-07-04T09:00:04.000Z",
          },
        ],
        transactionDeliverySummary: {
          pendingCount: 2,
          inFlightCount: 0,
          retryWaitCount: 1,
          failedCount: 0,
          oldestPendingAt: "2026-07-04T08:59:00.000Z",
        },
        lastHeartbeatAt: "2026-07-04T09:00:05.000Z",
        recentIssue: null,
      }),
    ).toMatchObject({
      sessionStatus: { currentStatus: "online" },
      chargingPointAvailability: { currentAvailability: "operative" },
      connectorAvailabilities: [{
        currentAvailability: "operative",
        requestedAvailability: "inoperative",
      }],
      connectorStatuses: [{ currentStatus: "occupied" }],
      transactionDeliverySummary: { pendingCount: 2, retryWaitCount: 1 },
    });
    expect(runtimeSnapshotResponseSchema.shape.sessionStatus.description).toBe(
      "桩实例当前会话状态；没有运行态事件时为 null。",
    );
    expect(runtimeSnapshotResponseSchema.shape.chargingPointAvailability.description)
      .toContain("整桩可用性");
  });

  test("accepts decimal meter readings in runtime snapshot", () => {
    const snapshot = runtimeSnapshotResponseSchema.parse({
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
      transactionStatuses: [
        {
          transactionId: "tx-1",
          evseId: 1,
          connectorId: 1,
          currentStatus: "active",
          meterWh: 19.4444444444,
          occurredAt: "2026-07-04T09:00:04.000Z",
        },
      ],
      transactionDeliverySummary: {
        pendingCount: 0,
        inFlightCount: 0,
        retryWaitCount: 0,
        failedCount: 0,
        oldestPendingAt: null,
      },
      lastHeartbeatAt: null,
      recentIssue: null,
    });

    expect(snapshot.transactionStatuses[0]?.meterWh).toBe(19.4444444444);
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
        deliveryStatus: "pending",
      }),
    ).toMatchObject({
      status: "accepted",
      transactionId: "1001",
      deliveryStatus: "pending",
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
        deliveryStatus: "pending",
      }),
    ).toMatchObject({
      status: "accepted",
      meterStopWh: 100,
      deliveryStatus: "pending",
    });
    expect(runtimeStopTransactionRequestSchema.shape.reason.description).toContain(
      "未提供时 OCPP StopTransaction 不携带 reason",
    );
  });

  test("requires transaction delivery status for locally accepted transactions", () => {
    expect(transactionDeliveryStatusSchema.options).toEqual([
      "pending",
      "in_flight",
      "retry_wait",
      "delivered",
      "failed",
    ]);
    expect(transactionDeliveryStatusSchema.description).toBe(
      "交易消息当前的交付状态。",
    );
    expect(() =>
      runtimeStartTransactionResponseSchema.parse({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        connectorId: "00000000-0000-4000-8000-000000000002",
        evseId: 1,
        protocolConnectorId: 2,
        idTag: "CARD001",
        status: "accepted",
        transactionId: "1001",
      }),
    ).toThrow();
  });

  test("validates the read-only transaction delivery query contract", () => {
    expect(listTransactionDeliveriesQuerySchema.parse({
      limit: "50",
      before: "42",
      status: "retry_wait",
      messageType: "meter_value",
    })).toEqual({
      limit: 50,
      before: "42",
      status: "retry_wait",
      messageType: "meter_value",
    });
    expect(transactionDeliverySummarySchema.parse({
      pendingCount: 2,
      inFlightCount: 1,
      retryWaitCount: 3,
      failedCount: 4,
      oldestPendingAt: "2026-07-24T01:00:00.000Z",
    })).toMatchObject({ pendingCount: 2, failedCount: 4 });
    expect(listTransactionDeliveriesResponseSchema.parse({
      items: [
        {
          id: "00000000-0000-4000-8000-000000000010",
          messageId: "00000000-0000-4000-8000-000000000011",
          transactionId: "local-tx-1",
          ocppTransactionId: null,
          deliverySequence: "42",
          messageType: "meter_value",
          status: "retry_wait",
          attemptCount: 2,
          nextAttemptAt: "2026-07-24T01:02:00.000Z",
          occurredAt: "2026-07-24T01:00:00.000Z",
          lastError: { code: "Timeout", message: "等待响应超时" },
          payload: { idTag: "不得公开" },
        },
      ],
      previousCursor: "42",
    }).items[0]).not.toHaveProperty("payload");
  });
});
