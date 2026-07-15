import { describe, expect, test } from "vitest";
import { listActorLogsResponseSchema } from "@spark-bee/contracts";
import { sql } from "drizzle-orm";

import { createApp } from "../../src/app";
import { ActorLogWriter } from "../../src/lib/actorLogWriter";
import { createTestDatabase } from "../support/testDatabase";

describe("Actor 日志 API", () => {
  test("通过新接口读写旧物理表且不保留旧接口", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const writer = new ActorLogWriter(database, { batchSize: 1 });

    writer.createSink(chargingPoint.id).write({
      id: "actor-log-1",
      sequence: 1,
      chargingPointId: chargingPoint.id,
      occurredAt: "2026-07-15T00:00:00.000Z",
      level: "info",
      code: "CHARGING_POINT_ACTOR_STARTED",
      message: "Charging point actor started",
    });
    await writer.flush();

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/actor-logs`,
    );
    expect(response.status).toBe(200);
    expect(listActorLogsResponseSchema.parse(await response.json()).items).toEqual([
      expect.objectContaining({ id: "actor-log-1" }),
    ]);

    expect((await app.request(
      `/api/charging-points/${chargingPoint.id}/runtime-logs`,
    )).status).toBe(404);
  });

  test("物理表在线重命名后自动切换并重试", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const writer = new ActorLogWriter(database, { batchSize: 1 });

    writer.createSink(chargingPoint.id).write(createActorLog(chargingPoint.id, "before"));
    await writer.flush();
    expect((await app.request(
      `/api/charging-points/${chargingPoint.id}/actor-logs`,
    )).status).toBe(200);

    await database.execute(sql`alter table runtime_logs rename to actor_logs`);

    writer.createSink(chargingPoint.id).write(createActorLog(chargingPoint.id, "after"));
    await writer.flush();

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/actor-logs`,
    );
    expect(response.status).toBe(200);
    expect(listActorLogsResponseSchema.parse(await response.json()).items.map(
      (item) => item.id,
    )).toEqual(["after", "before"]);
  });
});

function createActorLog(chargingPointId: string, id: string) {
  return {
    id,
    sequence: 1,
    chargingPointId,
    occurredAt: id === "before"
      ? "2026-07-15T00:00:00.000Z"
      : "2026-07-15T00:00:01.000Z",
    level: "info" as const,
    message: id,
  };
}

async function createChargingPoint(app: ReturnType<typeof createApp>) {
  const response = await app.request("/api/charging-points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Actor 日志测试桩",
      identity: "ACTOR_LOG_CP",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string };
}
