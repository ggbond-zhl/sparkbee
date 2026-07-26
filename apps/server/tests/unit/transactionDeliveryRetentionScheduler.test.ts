import { describe, expect, test } from "vitest";

import { schema } from "../../src/db";
import { TransactionDeliveryRepository } from "../../src/modules/transactionDelivery/transactionDelivery.repo";
import { TransactionDeliveryRetentionScheduler } from "../../src/modules/transactionDelivery/transactionDeliveryRetentionScheduler";
import { createTestDatabase } from "../support/testDatabase";

const chargingPointId = "00000000-0000-4000-8000-000000000091";

describe("交易交付保留期调度", () => {
  test("先删除七天前终态交付，再清理其交易且保留非终态消息", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "交易交付保留期测试桩",
      identity: "TRANSACTION_DELIVERY_RETENTION",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const repository = new TransactionDeliveryRepository(database);
    await repository.start({
      chargingPointId,
      transactionId: "expired-transaction",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-OLD",
      meterStartWh: 0,
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
      messageId: "00000000-0000-4000-8000-000000000092",
      payload: { connectorId: 1, idTag: "TAG-OLD", meterStartWh: 0 },
    });
    await repository.end({
      chargingPointId,
      transactionId: "expired-transaction",
      stoppedAt: new Date("2026-07-01T00:01:00.000Z"),
      meterStopWh: 100,
      messageId: "00000000-0000-4000-8000-000000000093",
      payload: { meterStopWh: 100 },
    });
    for (let index = 0; index < 2; index += 1) {
      const claimed = await repository.claimHead(
        chargingPointId,
        new Date(`2026-07-02T00:00:0${index}.000Z`),
      );
      if (claimed === null) throw new Error("测试交付队列不能为空");
      await repository.recordSuccess({
        id: claimed.id,
        deliveredAt: new Date(`2026-07-02T00:01:0${index}.000Z`),
        ...(claimed.messageType === "start" ? { ocppTransactionId: 1001 } : {}),
      });
    }
    await repository.start({
      chargingPointId,
      transactionId: "pending-transaction",
      evseId: 1,
      connectorId: 2,
      idTag: "TAG-PENDING",
      meterStartWh: 0,
      startedAt: new Date("2026-07-01T01:00:00.000Z"),
      messageId: "00000000-0000-4000-8000-000000000094",
      payload: { connectorId: 2, idTag: "TAG-PENDING", meterStartWh: 0 },
    });
    const scheduler = new TransactionDeliveryRetentionScheduler(database, {
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      batchSize: 1,
    });

    await expect(scheduler.cleanup()).resolves.toEqual({
      deliveries: 2,
      samples: 0,
      transactions: 1,
    });
    await expect(repository.listPage({ chargingPointId, limit: 10 }))
      .resolves.toMatchObject({
        items: [expect.objectContaining({
          transactionId: "pending-transaction",
          status: "pending",
        })],
        previousCursor: null,
      });
  });
});
