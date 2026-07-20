import { Writable } from "node:stream";

import { describe, expect, test, vi } from "vitest";
import { listActorLogsResponseSchema } from "@spark-bee/contracts";

import { createApp } from "../../src/app";
import { createServerLogger } from "../../src/config/logger";
import { ActorLogWriter } from "../../src/lib/actorLogWriter";
import { ActorLogRetentionScheduler } from "../../src/modules/actorLog/actorLogRetentionScheduler";
import { createTestDatabase } from "../support/testDatabase";

describe("Actor 日志持久化", () => {
  test("完整保留 Actor 日志上下文并通过后端 API 查询", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const writer = new ActorLogWriter(database, { batchSize: 1 });

    writer.createSink(chargingPoint.id).write({
      id: "actor-log-1",
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
      `/api/charging-points/${chargingPoint.id}/actor-logs?operationId=operation-1`,
    );
    expect(response.status).toBe(200);
    const result = listActorLogsResponseSchema.parse(await response.json());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "actor-log-1",
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
    const writer = new ActorLogWriter(database, { batchSize: 10 });
    const sink = writer.createSink(chargingPoint.id);
    sink.write(createLog(chargingPoint.id, "old", "2026-07-01T00:00:00.000Z"));
    sink.write(createLog(chargingPoint.id, "recent", "2026-07-10T00:00:00.000Z"));
    await writer.flush();

    const scheduler = new ActorLogRetentionScheduler(database, {
      now: () => new Date("2026-07-12T00:00:00.000Z"),
      batchSize: 1,
    });
    expect(await scheduler.cleanup()).toBe(1);
    let result = listActorLogsResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/actor-logs`)
    ).json());
    expect(result.items.map((item) => item.id)).toEqual(["recent"]);

    expect((await app.request(`/api/charging-points/${chargingPoint.id}`, {
      method: "DELETE",
    })).status).toBe(204);
    result = listActorLogsResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/actor-logs`)
    ).json());
    expect(result.items).toEqual([]);
  });

  test("数据库持续失败时记录并上报 Actor 日志写入故障", async () => {
    const failure = new Error("database unavailable");
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => Promise.reject(failure),
      }),
    }));
    const lines: string[] = [];
    const captured: Array<{ error: unknown; context: Record<string, unknown> }> = [];
    const writer = new ActorLogWriter(
      {
        insert,
      } as never,
      {
        batchSize: 1,
        logger: createServerLogger({
          environment: "production",
          level: "debug",
          destination: new Writable({
            write(chunk, _encoding, callback) {
              lines.push(chunk.toString());
              callback();
            },
          }),
        }),
        errorReporter: {
          captureException(error, context) {
            captured.push({ error, context });
          },
        },
      },
    );

    writer.createSink("00000000-0000-0000-0000-000000000001").write(createLog(
      "00000000-0000-0000-0000-000000000001",
      "failed-log",
      "2026-07-12T00:00:00.000Z",
    ));
    await writer.flush();

    expect(insert).toHaveBeenCalledTimes(2);
    expect(captured).toEqual([{
      error: failure,
      context: { module: "actorLogWriter", batchSize: 1 },
    }]);
    expect(JSON.parse(lines.join(""))).toMatchObject({
      event: "actor-log.persist.failed",
      batchSize: 1,
      error: { message: "database unavailable" },
      msg: "Failed to persist Actor logs",
    });
  });

  test("保留任务失败时记录并上报后台故障", async () => {
    const failure = new Error("cleanup unavailable");
    const lines: string[] = [];
    const captured: Array<{ error: unknown; context: Record<string, unknown> }> = [];
    const scheduler = new ActorLogRetentionScheduler(
      { execute: () => Promise.reject(failure) } as never,
      {
        intervalMs: 60_000,
        logger: createServerLogger({
          environment: "production",
          level: "debug",
          destination: new Writable({
            write(chunk, _encoding, callback) {
              lines.push(chunk.toString());
              callback();
            },
          }),
        }),
        errorReporter: {
          captureException(error, context) {
            captured.push({ error, context });
          },
        },
      },
    );

    scheduler.start();
    await new Promise((resolve) => setImmediate(resolve));
    scheduler.stop();

    expect(captured).toEqual([{
      error: failure,
      context: { module: "actorLogRetention" },
    }]);
    expect(JSON.parse(lines.join(""))).toMatchObject({
      event: "actor-log.retention.failed",
      error: { message: "cleanup unavailable" },
      msg: "Failed to remove expired Actor logs",
    });
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
