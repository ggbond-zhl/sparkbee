import { describe, expect, test } from "vitest";

import { schema } from "../../src/db";
import { ChargingTransactionRepository } from "../../src/modules/chargingTransaction/chargingTransaction.repo";
import { TransactionDeliveryRepository } from "../../src/modules/transactionDelivery/transactionDelivery.repo";
import { createTestDatabase } from "../support/testDatabase";

const chargingPointId = "00000000-0000-4000-8000-000000000001";

describe("transaction delivery persistence", () => {
  test("atomically starts a local transaction with its first delivery message", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const deliveries = new TransactionDeliveryRepository(database);

    const created = await deliveries.start({
      chargingPointId,
      transactionId: "local-tx-1",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 0,
      startedAt: new Date("2026-07-24T01:00:00.000Z"),
      messageId: "00000000-0000-4000-8000-000000000011",
      payload: {
        connectorId: 1,
        idTag: "TAG-1",
        meterStartWh: 0,
        startedAt: "2026-07-24T01:00:00.000Z",
      },
    });

    expect(created).toMatchObject({
      transactionId: "local-tx-1",
      deliverySequence: 1n,
      messageType: "start",
      status: "pending",
      attemptCount: 0,
    });
    await expect(deliveries.listPending(chargingPointId)).resolves.toEqual([
      expect.objectContaining({
        messageId: "00000000-0000-4000-8000-000000000011",
        deliverySequence: 1n,
      }),
    ]);
    await expect(
      new ChargingTransactionRepository(database).loadActive(chargingPointId),
    ).resolves.toEqual([
      expect.objectContaining({ transactionId: "local-tx-1" }),
    ]);
  });

  test("assigns one station sequence across overlapping transaction messages", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const deliveries = new TransactionDeliveryRepository(database);
    const startedAt = new Date("2026-07-24T01:00:00.000Z");

    await deliveries.start({
      chargingPointId,
      transactionId: "tx-a",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-A",
      meterStartWh: 0,
      startedAt,
      messageId: "00000000-0000-4000-8000-000000000021",
      payload: { connectorId: 1, idTag: "TAG-A", meterStartWh: 0 },
    });
    await deliveries.start({
      chargingPointId,
      transactionId: "tx-b",
      evseId: 1,
      connectorId: 2,
      idTag: "TAG-B",
      meterStartWh: 0,
      startedAt,
      messageId: "00000000-0000-4000-8000-000000000022",
      payload: { connectorId: 2, idTag: "TAG-B", meterStartWh: 0 },
    });
    await deliveries.recordSample({
      chargingPointId,
      transactionId: "tx-a",
      sampleId: "sample-a-1",
      sampledAt: new Date("2026-07-24T01:01:00.000Z"),
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
      messageId: "00000000-0000-4000-8000-000000000023",
      payload: { meterWh: 100, readingContext: "Sample.Periodic" },
    });
    await deliveries.end({
      chargingPointId,
      transactionId: "tx-a",
      stoppedAt: new Date("2026-07-24T01:02:00.000Z"),
      meterStopWh: 120,
      messageId: "00000000-0000-4000-8000-000000000024",
      payload: { meterStopWh: 120, reason: "Local" },
    });

    await expect(deliveries.listPending(chargingPointId)).resolves.toEqual([
      expect.objectContaining({ deliverySequence: 1n, messageType: "start" }),
      expect.objectContaining({ deliverySequence: 2n, messageType: "start" }),
      expect.objectContaining({ deliverySequence: 3n, messageType: "meter_value" }),
      expect.objectContaining({ deliverySequence: 4n, messageType: "stop" }),
    ]);
  });

  test("claims only the station head and schedules linear retry", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const deliveries = new TransactionDeliveryRepository(database);
    await deliveries.start({
      chargingPointId,
      transactionId: "tx-a",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-A",
      meterStartWh: 0,
      startedAt: new Date("2026-07-24T01:00:00.000Z"),
      messageId: "00000000-0000-4000-8000-000000000031",
      payload: { connectorId: 1, idTag: "TAG-A", meterStartWh: 0 },
    });
    await deliveries.recordSample({
      chargingPointId,
      transactionId: "tx-a",
      sampleId: "sample-a-1",
      sampledAt: new Date("2026-07-24T01:01:00.000Z"),
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
      messageId: "00000000-0000-4000-8000-000000000032",
      payload: { meterWh: 100, readingContext: "Sample.Periodic" },
    });
    const firstAttemptAt = new Date("2026-07-24T02:00:00.000Z");

    const firstAttempt = await deliveries.claimHead(chargingPointId, firstAttemptAt);
    expect(firstAttempt).toMatchObject({
      deliverySequence: 1n,
      status: "in_flight",
      attemptCount: 1,
    });
    await expect(
      deliveries.claimHead(chargingPointId, firstAttemptAt),
    ).resolves.toBeNull();

    const retry = await deliveries.recordFailure({
      id: firstAttempt!.id,
      failedAt: firstAttemptAt,
      maxAttempts: 3,
      retryIntervalSec: 60,
      errorCode: "Timeout",
      errorMessage: "等待响应超时",
    });
    expect(retry).toMatchObject({
      status: "retry_wait",
      attemptCount: 1,
      nextAttemptAt: new Date("2026-07-24T02:01:00.000Z"),
    });
    await expect(
      deliveries.claimHead(
        chargingPointId,
        new Date("2026-07-24T02:00:59.999Z"),
      ),
    ).resolves.toBeNull();
    await expect(
      deliveries.claimHead(
        chargingPointId,
        new Date("2026-07-24T02:01:00.000Z"),
      ),
    ).resolves.toMatchObject({
      deliverySequence: 1n,
      status: "in_flight",
      attemptCount: 2,
    });
  });

  test("binds minus one after the final StartTransaction failure and advances", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const deliveries = new TransactionDeliveryRepository(database);
    await deliveries.start({
      chargingPointId,
      transactionId: "tx-a",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-A",
      meterStartWh: 0,
      startedAt: new Date("2026-07-24T01:00:00.000Z"),
      messageId: "00000000-0000-4000-8000-000000000041",
      payload: { connectorId: 1, idTag: "TAG-A", meterStartWh: 0 },
    });
    await deliveries.recordSample({
      chargingPointId,
      transactionId: "tx-a",
      sampleId: "sample-a-1",
      sampledAt: new Date("2026-07-24T01:01:00.000Z"),
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
      messageId: "00000000-0000-4000-8000-000000000042",
      payload: { meterWh: 100, readingContext: "Sample.Periodic" },
    });
    const failedAt = new Date("2026-07-24T02:00:00.000Z");
    const start = await deliveries.claimHead(chargingPointId, failedAt);

    await expect(deliveries.recordFailure({
      id: start!.id,
      failedAt,
      maxAttempts: 1,
      retryIntervalSec: 60,
      errorCode: "InternalError",
      errorMessage: "CSMS 无法处理",
    })).resolves.toMatchObject({
      status: "failed",
      ocppTransactionId: -1,
    });
    await expect(
      deliveries.claimHead(chargingPointId, failedAt),
    ).resolves.toMatchObject({
      deliverySequence: 2n,
      messageType: "meter_value",
      ocppTransactionId: -1,
    });
  });

  test("marks successful deliveries and binds the CSMS transaction id atomically", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const deliveries = new TransactionDeliveryRepository(database);
    await deliveries.start({
      chargingPointId,
      transactionId: "tx-success",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-A",
      meterStartWh: 0,
      startedAt: new Date("2026-07-24T01:00:00.000Z"),
      messageId: "00000000-0000-4000-8000-000000000051",
      payload: { connectorId: 1, idTag: "TAG-A", meterStartWh: 0 },
    });

    const start = await deliveries.claimHead(
      chargingPointId,
      new Date("2026-07-24T02:00:00.000Z"),
    );
    await expect(deliveries.recordSuccess({
      id: start!.id,
      deliveredAt: new Date("2026-07-24T02:00:01.000Z"),
      ocppTransactionId: 7001,
    })).resolves.toMatchObject({
      status: "delivered",
      ocppTransactionId: 7001,
      deliveredAt: new Date("2026-07-24T02:00:01.000Z"),
      inFlightAt: null,
    });

    await deliveries.recordSample({
      chargingPointId,
      transactionId: "tx-success",
      sampleId: "sample-success-1",
      sampledAt: new Date("2026-07-24T01:01:00.000Z"),
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
      messageId: "00000000-0000-4000-8000-000000000052",
      payload: { meterWh: 100, readingContext: "Sample.Periodic" },
    });
    const meterValue = await deliveries.claimHead(
      chargingPointId,
      new Date("2026-07-24T02:01:00.000Z"),
    );
    await expect(deliveries.recordSuccess({
      id: meterValue!.id,
      deliveredAt: new Date("2026-07-24T02:01:01.000Z"),
    })).resolves.toMatchObject({
      messageType: "meter_value",
      status: "delivered",
      ocppTransactionId: 7001,
    });

    await deliveries.end({
      chargingPointId,
      transactionId: "tx-success",
      stoppedAt: new Date("2026-07-24T01:02:00.000Z"),
      meterStopWh: 120,
      messageId: "00000000-0000-4000-8000-000000000053",
      payload: { meterStopWh: 120, reason: "Local" },
    });
    const stop = await deliveries.claimHead(
      chargingPointId,
      new Date("2026-07-24T02:02:00.000Z"),
    );
    await expect(deliveries.recordSuccess({
      id: stop!.id,
      deliveredAt: new Date("2026-07-24T02:02:01.000Z"),
    })).resolves.toMatchObject({
      messageType: "stop",
      status: "delivered",
      ocppTransactionId: 7001,
    });
    await expect(deliveries.listPending(chargingPointId)).resolves.toEqual([]);
  });

  test("recovers interrupted in-flight delivery without counting another attempt", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const deliveries = new TransactionDeliveryRepository(database);
    await deliveries.start({
      chargingPointId,
      transactionId: "tx-recovery",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-A",
      meterStartWh: 0,
      startedAt: new Date("2026-07-24T01:00:00.000Z"),
      messageId: "00000000-0000-4000-8000-000000000061",
      payload: { connectorId: 1, idTag: "TAG-A", meterStartWh: 0 },
    });
    await deliveries.claimHead(
      chargingPointId,
      new Date("2026-07-24T02:00:00.000Z"),
    );

    await expect(deliveries.recoverInFlight({
      chargingPointId,
      recoveredAt: new Date("2026-07-24T02:00:30.000Z"),
      maxAttempts: 2,
      retryIntervalSec: 60,
      errorCode: "ProcessRestarted",
      errorMessage: "发送结果因进程重启未知",
    })).resolves.toEqual([
      expect.objectContaining({
        status: "retry_wait",
        attemptCount: 1,
        nextAttemptAt: new Date("2026-07-24T02:01:00.000Z"),
      }),
    ]);
    await expect(deliveries.claimHead(
      chargingPointId,
      new Date("2026-07-24T02:00:59.999Z"),
    )).resolves.toBeNull();
    await expect(deliveries.claimHead(
      chargingPointId,
      new Date("2026-07-24T02:01:00.000Z"),
    )).resolves.toMatchObject({ attemptCount: 2 });

    await expect(deliveries.recoverInFlight({
      chargingPointId,
      recoveredAt: new Date("2026-07-24T02:01:30.000Z"),
      maxAttempts: 2,
      retryIntervalSec: 60,
      errorCode: "ProcessRestarted",
      errorMessage: "发送结果因进程重启未知",
    })).resolves.toEqual([
      expect.objectContaining({
        status: "failed",
        attemptCount: 2,
        ocppTransactionId: -1,
        failedAt: new Date("2026-07-24T02:01:30.000Z"),
      }),
    ]);
  });

  test("rolls back local facts when delivery insertion fails", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const deliveries = new TransactionDeliveryRepository(database);
    const duplicateMessageId = "00000000-0000-4000-8000-000000000071";
    await deliveries.start({
      chargingPointId,
      transactionId: "tx-existing",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-A",
      meterStartWh: 0,
      startedAt: new Date("2026-07-24T01:00:00.000Z"),
      messageId: duplicateMessageId,
      payload: { connectorId: 1, idTag: "TAG-A", meterStartWh: 0 },
    });

    await expect(deliveries.start({
      chargingPointId,
      transactionId: "tx-rolled-back",
      evseId: 1,
      connectorId: 2,
      idTag: "TAG-B",
      meterStartWh: 0,
      startedAt: new Date("2026-07-24T01:01:00.000Z"),
      messageId: duplicateMessageId,
      payload: { connectorId: 2, idTag: "TAG-B", meterStartWh: 0 },
    })).rejects.toThrow();
    await expect(deliveries.recordSample({
      chargingPointId,
      transactionId: "tx-existing",
      sampleId: "sample-rolled-back",
      sampledAt: new Date("2026-07-24T01:02:00.000Z"),
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
      messageId: duplicateMessageId,
      payload: { meterWh: 100, readingContext: "Sample.Periodic" },
    })).rejects.toThrow();
    await expect(deliveries.end({
      chargingPointId,
      transactionId: "tx-existing",
      stoppedAt: new Date("2026-07-24T01:03:00.000Z"),
      meterStopWh: 120,
      messageId: duplicateMessageId,
      payload: { meterStopWh: 120, reason: "Local" },
    })).rejects.toThrow();

    await expect(database.select().from(schema.chargingTransactions))
      .resolves.toEqual([
        expect.objectContaining({
          transactionId: "tx-existing",
          latestMeterWh: 0,
          endedAt: null,
        }),
      ]);
    await expect(database.select().from(schema.chargingSamples)).resolves.toEqual([]);
  });

  test("paginates delivery history, summarizes active states, and protects pending facts", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const deliveries = new TransactionDeliveryRepository(database);
    const transactions = new ChargingTransactionRepository(database);
    await deliveries.start({
      chargingPointId,
      transactionId: "tx-history",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-A",
      meterStartWh: 0,
      startedAt: new Date("2026-07-01T01:00:00.000Z"),
      messageId: "00000000-0000-4000-8000-000000000081",
      payload: { connectorId: 1, idTag: "TAG-A", meterStartWh: 0 },
    });
    await deliveries.recordSample({
      chargingPointId,
      transactionId: "tx-history",
      sampleId: "sample-history-1",
      sampledAt: new Date("2026-07-01T01:01:00.000Z"),
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
      messageId: "00000000-0000-4000-8000-000000000082",
      payload: { meterWh: 100, readingContext: "Sample.Periodic" },
    });
    await deliveries.end({
      chargingPointId,
      transactionId: "tx-history",
      stoppedAt: new Date("2026-07-01T01:02:00.000Z"),
      meterStopWh: 120,
      messageId: "00000000-0000-4000-8000-000000000083",
      payload: { meterStopWh: 120, reason: "Local" },
    });

    await expect(deliveries.listPage({ chargingPointId, limit: 2 }))
      .resolves.toMatchObject({
        items: [
          expect.objectContaining({ deliverySequence: 3n }),
          expect.objectContaining({ deliverySequence: 2n }),
        ],
        previousCursor: 2n,
      });
    await expect(deliveries.listPage({
      chargingPointId,
      limit: 2,
      before: 2n,
      messageType: "start",
      status: "pending",
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ deliverySequence: 1n })],
      previousCursor: null,
    });
    await expect(deliveries.getSummary(chargingPointId)).resolves.toEqual({
      pendingCount: 3,
      inFlightCount: 0,
      retryWaitCount: 0,
      failedCount: 0,
      oldestPendingAt: new Date("2026-07-01T01:00:00.000Z"),
    });

    const retentionBefore = new Date("2026-07-10T00:00:00.000Z");
    await expect(transactions.deleteExpired(retentionBefore, 100)).resolves.toEqual({
      samples: 0,
      transactions: 0,
    });
    await expect(deliveries.deleteTerminalBefore(retentionBefore, 100))
      .resolves.toBe(0);

    for (let index = 0; index < 3; index += 1) {
      const claimed = await deliveries.claimHead(
        chargingPointId,
        new Date(`2026-07-02T00:00:0${index}.000Z`),
      );
      await deliveries.recordSuccess({
        id: claimed!.id,
        deliveredAt: new Date(`2026-07-02T00:01:0${index}.000Z`),
        ...(claimed!.messageType === "start" ? { ocppTransactionId: 7002 } : {}),
      });
    }
    await expect(deliveries.deleteTerminalBefore(retentionBefore, 100))
      .resolves.toBe(3);
    await expect(transactions.deleteExpired(retentionBefore, 100)).resolves.toEqual({
      samples: 1,
      transactions: 1,
    });
  });
});
