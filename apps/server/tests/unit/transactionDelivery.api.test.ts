import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";
import { listTransactionDeliveriesResponseSchema } from "@spark-bee/contracts";

import { createApp } from "../../src/app";
import { TransactionDeliveryRepository } from "../../src/modules/transactionDelivery/transactionDelivery.repo";
import { createTestDatabase } from "../support/testDatabase";

describe("交易交付记录 API", () => {
  test("按单桩序号倒序分页且不暴露 idTag 或完整 payload", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const repository = new TransactionDeliveryRepository(database);

    for (let index = 1; index <= 3; index += 1) {
      await repository.start({
        chargingPointId: chargingPoint.id,
        transactionId: `transaction-${index}`,
        evseId: 1,
        connectorId: index,
        idTag: `SECRET-TAG-${index}`,
        meterStartWh: index * 100,
        startedAt: new Date(`2026-07-20T00:00:0${index}.000Z`),
        messageId: randomUUID(),
        payload: {
          connectorId: 1,
          idTag: `SECRET-TAG-${index}`,
          meterStartWh: index * 100,
        },
      });
    }
    const claimed = await repository.claimHead(
      chargingPoint.id,
      new Date("2026-07-20T00:01:00.000Z"),
    );
    if (claimed === null) {
      throw new Error("测试必须领取到第一条交易交付记录");
    }
    await repository.recordSuccess({
      id: claimed.id,
      deliveredAt: new Date("2026-07-20T00:01:01.000Z"),
      ocppTransactionId: 1001,
    });

    const firstResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/transaction-deliveries?limit=2`,
    );
    expect(firstResponse.status).toBe(200);
    const firstJson = await firstResponse.json();
    const first = listTransactionDeliveriesResponseSchema.parse(firstJson);
    expect(first.items.map((item) => item.deliverySequence)).toEqual(["3", "2"]);
    expect(first.previousCursor).toBe("2");
    expect(JSON.stringify(firstJson)).not.toContain("SECRET-TAG");
    expect(first.items[0]).not.toHaveProperty("payload");

    const olderResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/transaction-deliveries?before=${first.previousCursor}`,
    );
    const older = listTransactionDeliveriesResponseSchema.parse(
      await olderResponse.json(),
    );
    expect(older.items).toEqual([
      expect.objectContaining({
        deliverySequence: "1",
        status: "delivered",
        ocppTransactionId: 1001,
      }),
    ]);
    expect(older.previousCursor).toBeNull();

    const filteredResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/transaction-deliveries?status=delivered&messageType=start`,
    );
    const filtered = listTransactionDeliveriesResponseSchema.parse(
      await filteredResponse.json(),
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.deliverySequence).toBe("1");
  });

  test("校验查询参数并在 OpenAPI 中提供中文说明", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);

    const invalid = await app.request(
      `/api/charging-points/${chargingPoint.id}/transaction-deliveries?before=not-a-sequence`,
    );
    expect(invalid.status).toBe(400);

    const document = await (await app.request("/api/openapi.json")).json();
    const operation = document.paths[
      "/api/charging-points/{id}/transaction-deliveries"
    ].get;
    expect(operation.summary).toBe("查询交易交付记录");
    expect(operation.description).toContain("不包含 idTag");
    expect(operation.responses["200"].description).toBe(
      "交易交付记录的游标分页结果。",
    );
  });

  test("运行时快照读取数据库中的真实交易交付摘要", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const occurredAt = new Date("2026-07-20T00:00:01.000Z");
    await new TransactionDeliveryRepository(database).start({
      chargingPointId: chargingPoint.id,
      transactionId: "pending-transaction",
      evseId: 1,
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
      startedAt: occurredAt,
      messageId: randomUUID(),
      payload: { connectorId: 1, idTag: "TAG-1", meterStartWh: 100 },
    });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/runtime-snapshot`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      transactionDeliverySummary: {
        pendingCount: 1,
        inFlightCount: 0,
        retryWaitCount: 0,
        failedCount: 0,
        oldestPendingAt: occurredAt.toISOString(),
      },
    });
  });
});

async function createChargingPoint(app: ReturnType<typeof createApp>) {
  const response = await app.request("/api/charging-points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "交易交付测试桩",
      identity: `TRANSACTION_DELIVERY_${randomUUID()}`,
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string };
}
