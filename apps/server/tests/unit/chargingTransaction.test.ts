import { describe, expect, test } from "vitest";

import { schema } from "../../src/db";
import { ChargingTransactionRepository } from "../../src/modules/chargingTransaction/chargingTransaction.repo";
import { ChargingTransactionRetentionScheduler } from "../../src/modules/chargingTransaction/chargingTransactionRetentionScheduler";
import { ChargingPointRepository } from "../../src/modules/chargingPoint/chargingPoint.repo";
import { createTestDatabase } from "../support/testDatabase";

const chargingPointId = "00000000-0000-4000-8000-000000000001";

describe("charging transaction persistence", () => {
  test("keeps active transactions while pruning samples and ended transactions after 7 days", async () => {
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
    const repository = new ChargingTransactionRepository(database);
    await repository.start({
      chargingPointId,
      transactionId: "active-tx",
      ocppTransactionId: 1001,
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 0,
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    await repository.recordSample(chargingPointId, {
      id: "active-old-sample",
      resource: { transactionId: "active-tx" },
      sampledAt: "2026-07-01T00:01:00.000Z",
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
    });
    await repository.start({
      chargingPointId,
      transactionId: "ended-tx",
      ocppTransactionId: 1002,
      evseId: 1,
      connectorId: 2,
      idTag: "TAG-2",
      meterStartWh: 0,
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    await repository.recordSample(chargingPointId, {
      id: "ended-old-sample",
      resource: { transactionId: "ended-tx" },
      sampledAt: "2026-07-01T00:01:00.000Z",
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
    });
    await repository.end({
      chargingPointId,
      transactionId: "ended-tx",
      meterStopWh: 100,
      stoppedAt: new Date("2026-07-01T00:02:00.000Z"),
    });
    const scheduler = new ChargingTransactionRetentionScheduler(database, {
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      batchSize: 1,
    });

    await expect(scheduler.cleanup()).resolves.toEqual({
      samples: 1,
      transactions: 1,
    });
    await expect(repository.listActiveSamples(chargingPointId)).resolves.toEqual({
      items: [
        {
          transactionId: "active-tx",
          evseId: 1,
          connectorId: 1,
          samples: [],
        },
      ],
    });
    await expect(repository.listRecoverableChargingPointIds()).resolves.toEqual([
      chargingPointId,
    ]);
  });

  test("deletes persisted transactions and samples with a soft-deleted charging point", async () => {
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
    const transactions = new ChargingTransactionRepository(database);
    await transactions.start({
      chargingPointId,
      transactionId: "active-tx",
      ocppTransactionId: 1001,
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 0,
      startedAt: new Date("2026-07-20T00:00:00.000Z"),
    });
    await transactions.recordSample(chargingPointId, {
      id: "sample-1",
      resource: { transactionId: "active-tx" },
      sampledAt: "2026-07-20T00:01:00.000Z",
      meterWh: 100,
      powerW: 7000,
      currentA: 31,
      voltageV: 226,
    });

    await new ChargingPointRepository(database).softDelete(chargingPointId);

    await expect(transactions.listRecoverableChargingPointIds()).resolves.toEqual([]);
    await expect(transactions.listActiveSamples(chargingPointId)).resolves.toEqual({
      items: [],
    });
  });
});
