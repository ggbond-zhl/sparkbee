import { describe, expect, test } from "vitest";
import { listRuntimeLogsResponseSchema } from "@spark-bee/contracts";

import { createApp } from "../../src/app";
import { ChargingPointRuntimeLogWriter } from "../../src/lib/chargingPointRuntimeLogWriter";
import { RuntimeLogRetentionScheduler } from "../../src/modules/runtimeLog/runtimeLogRetentionScheduler";
import { createTestDatabase } from "../support/testDatabase";

describe("运行日志持久化", () => {
  test("完整保留运行日志上下文并通过后端 API 查询", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const writer = new ChargingPointRuntimeLogWriter(database, { batchSize: 1 });

    writer.createSink(chargingPoint.id).write({
      id: "runtime-log-1",
      sequence: 1,
      chargingPointId: chargingPoint.id,
      occurredAt: "2026-07-12T00:00:00.000Z",
      level: "error",
      code: "OCPP_ACTION_FAILED",
      message: "OCPP action failed",
      context: {
        operationId: "operation-1",
        idTag: "ID-TAG-1",
        password: "plain-password",
        nested: { apiToken: "plain-token" },
        centralSystemUrl: "wss://user:secret@example.com/ocpp?token=query-secret&region=sg",
      },
    });
    await writer.flush();

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/runtime-logs?operationId=operation-1`,
    );
    expect(response.status).toBe(200);
    const result = listRuntimeLogsResponseSchema.parse(await response.json());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "runtime-log-1",
      code: "OCPP_ACTION_FAILED",
      context: {
        operationId: "operation-1",
        idTag: "ID-TAG-1",
        password: "plain-password",
        nested: { apiToken: "plain-token" },
        centralSystemUrl: "wss://user:secret@example.com/ocpp?token=query-secret&region=sg",
      },
    });
  });

  test("清理七天前日志并在删除桩实例时删除关联日志", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const writer = new ChargingPointRuntimeLogWriter(database, { batchSize: 10 });
    const sink = writer.createSink(chargingPoint.id);
    sink.write(createLog(chargingPoint.id, "old", "2026-07-01T00:00:00.000Z"));
    sink.write(createLog(chargingPoint.id, "recent", "2026-07-10T00:00:00.000Z"));
    await writer.flush();

    const scheduler = new RuntimeLogRetentionScheduler(database, {
      now: () => new Date("2026-07-12T00:00:00.000Z"),
      batchSize: 1,
    });
    expect(await scheduler.cleanup()).toBe(1);
    let result = listRuntimeLogsResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/runtime-logs`)
    ).json());
    expect(result.items.map((item) => item.id)).toEqual(["recent"]);

    expect((await app.request(`/api/charging-points/${chargingPoint.id}`, {
      method: "DELETE",
    })).status).toBe(204);
    result = listRuntimeLogsResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/runtime-logs`)
    ).json());
    expect(result.items).toEqual([]);
  });
});

function createLog(chargingPointId: string, id: string, occurredAt: string) {
  return {
    id,
    sequence: 1,
    chargingPointId,
    occurredAt,
    level: "info" as const,
    message: id,
  };
}

async function createChargingPoint(app: ReturnType<typeof createApp>) {
  const response = await app.request("/api/charging-points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string };
}
