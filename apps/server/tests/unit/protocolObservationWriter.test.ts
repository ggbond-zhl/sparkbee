import { Writable } from "node:stream";

import { describe, expect, test, vi } from "vitest";
import {
  listProtocolEventsResponseSchema,
  listProtocolMessagesResponseSchema,
  type ChargingPointActorEvent,
} from "@spark-bee/contracts";

import { createApp } from "../../src/app";
import { createServerLogger } from "../../src/config/logger";
import type { ChargingPointActor } from "../../src/lib/chargingPointActor";
import { ChargingPointActorHost } from "../../src/lib/chargingPointActorHost";
import { ProtocolObservationWriter } from "../../src/modules/protocolObservation/protocolObservation.writer";
import { ProtocolObservationRetentionScheduler } from "../../src/modules/protocolObservation/protocolObservationRetentionScheduler";
import { createTestDatabase } from "../support/testDatabase";

describe("历史观察记录持久化", () => {
  test("没有 SSE 订阅者时仍持久化 Actor 产生的协议报文和协议事件", async () => {
    const database = await createTestDatabase();
    const writer = new ProtocolObservationWriter(database, { batchSize: 10 });
    let emit: ((event: ChargingPointActorEvent) => void | Promise<void>) | undefined;
    let actor: ChargingPointActor | undefined;
    const app = createApp({
      database,
      protocolObservationWriter: writer,
      createChargingPointActor: () => {
        if (actor === undefined) throw new Error("actor not initialized");
        return actor;
      },
    });
    const chargingPoint = await createChargingPoint(app);
    actor = createActor(chargingPoint.id, (listener) => {
      emit = listener;
      return () => undefined;
    });
    await createConnector(app, chargingPoint.id);
    expect((await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    })).status).toBe(200);
    await emit?.({
      id: "message-without-subscriber",
      sequence: 1,
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      occurredAt: "2026-07-20T00:00:00.000Z",
      type: "protocol.message",
      resource: { scope: "protocol" },
      direction: "sent",
      action: "BootNotification",
      messageId: "message-id-1",
      body: [2, "message-id-1", "BootNotification", { chargePointModel: "DebugBox" }],
    });
    await emit?.({
      id: "event-without-subscriber",
      sequence: 2,
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      occurredAt: "2026-07-20T00:00:01.000Z",
      type: "chargingPoint.lifecycle",
      resource: { scope: "chargingPoint" },
      previousStatus: "starting",
      currentStatus: "running",
    });
    await writer.flush();

    const messages = listProtocolMessagesResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/protocol-messages`)
    ).json());
    const events = listProtocolEventsResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/protocol-events`)
    ).json());
    expect(messages.items.map((item) => item.id)).toEqual([
      "message-without-subscriber",
    ]);
    expect(events.items.map((item) => item.id)).toEqual([
      "event-without-subscriber",
    ]);
  });

  test("数据库持续失败时不阻断 SSE 并记录持久化故障", async () => {
    const failure = new Error("database unavailable");
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => Promise.reject(failure),
      }),
    }));
    const lines: string[] = [];
    const captured: Array<{ error: unknown; context: Record<string, unknown> }> = [];
    const writer = new ProtocolObservationWriter(
      { insert } as never,
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
    let emit: ((event: ChargingPointActorEvent) => void | Promise<void>) | undefined;
    const actor = createActor(
      "00000000-0000-4000-8000-000000000001",
      (listener) => {
        emit = listener;
        return () => undefined;
      },
    );
    const host = new ChargingPointActorHost({ actorEventSink: writer });
    const streamed: unknown[] = [];
    await host.start(actor.id, () => actor);
    host.subscribe(actor.id, (event) => streamed.push(event));

    await emit?.({
      id: "failed-message",
      sequence: 1,
      chargingPointId: actor.id,
      protocol: "OCPP16J",
      occurredAt: "2026-07-20T00:00:00.000Z",
      type: "protocol.message",
      resource: { scope: "protocol" },
      direction: "sent",
      action: "Heartbeat",
    });
    await expect(writer.flush()).resolves.toBeUndefined();

    expect(insert).toHaveBeenCalledTimes(2);
    expect(streamed).toEqual([
      expect.objectContaining({
        event: "protocol.message",
        data: expect.objectContaining({ id: "failed-message" }),
      }),
    ]);
    expect(captured).toEqual([{
      error: failure,
      context: { module: "protocolObservationWriter", batchSize: 1 },
    }]);
    expect(JSON.parse(lines.join(""))).toMatchObject({
      event: "protocol-observation.persist.failed",
      batchSize: 1,
      error: { message: "database unavailable" },
      msg: "Failed to persist protocol observations",
    });
  });

  test("清理七天前的协议报文和协议事件", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const writer = new ProtocolObservationWriter(database, { batchSize: 10 });

    for (const [id, occurredAt] of [
      ["old-message", "2026-07-04T00:00:00.000Z"],
      ["recent-message", "2026-07-10T00:00:00.000Z"],
    ] as const) {
      writer.write({
        id,
        sequence: 1,
        chargingPointId: chargingPoint.id,
        protocol: "OCPP16J",
        occurredAt,
        type: "protocol.message",
        resource: { scope: "protocol" },
        direction: "sent",
        action: "Heartbeat",
      });
    }
    for (const [id, occurredAt] of [
      ["old-event", "2026-07-04T00:00:00.000Z"],
      ["recent-event", "2026-07-10T00:00:00.000Z"],
    ] as const) {
      writer.write({
        id,
        sequence: 2,
        chargingPointId: chargingPoint.id,
        protocol: "OCPP16J",
        occurredAt,
        type: "chargingPoint.lifecycle",
        resource: { scope: "chargingPoint" },
        previousStatus: "running",
        currentStatus: "stopped",
      });
    }
    await writer.flush();

    const scheduler = new ProtocolObservationRetentionScheduler(database, {
      now: () => new Date("2026-07-12T00:00:00.000Z"),
      batchSize: 1,
    });
    expect(await scheduler.cleanup()).toEqual({ messages: 1, events: 1 });

    const messages = listProtocolMessagesResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/protocol-messages`)
    ).json());
    const events = listProtocolEventsResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/protocol-events`)
    ).json());
    expect(messages.items.map((item) => item.id)).toEqual(["recent-message"]);
    expect(events.items.map((item) => item.id)).toEqual(["recent-event"]);
  });

  test("删除运行中的桩实例不会让停止事件重新形成孤立历史", async () => {
    const database = await createTestDatabase();
    const writer = new ProtocolObservationWriter(database, { batchSize: 10 });
    let emit: ((event: ChargingPointActorEvent) => void | Promise<void>) | undefined;
    let actor: ChargingPointActor | undefined;
    const app = createApp({
      database,
      protocolObservationWriter: writer,
      createChargingPointActor: () => {
        if (actor === undefined) throw new Error("actor not initialized");
        return actor;
      },
    });
    const chargingPoint = await createChargingPoint(app);
    actor = createActor(chargingPoint.id, (listener) => {
      emit = listener;
      return () => undefined;
    });
    actor.stop = async () => {
      await emit?.({
        id: "event-emitted-while-deleting",
        sequence: 9,
        chargingPointId: chargingPoint.id,
        protocol: "OCPP16J",
        occurredAt: "2026-07-20T00:00:09.000Z",
        type: "chargingPoint.lifecycle",
        resource: { scope: "chargingPoint" },
        previousStatus: "running",
        currentStatus: "stopped",
      });
      return {
        chargingPointId: chargingPoint.id,
        chargingPointActorStatus: "stopped",
      };
    };
    await createConnector(app, chargingPoint.id);
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });

    expect((await app.request(`/api/charging-points/${chargingPoint.id}`, {
      method: "DELETE",
    })).status).toBe(204);
    await writer.flush();

    const events = listProtocolEventsResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/protocol-events`)
    ).json());
    expect(events.items).toEqual([]);
  });
});

function createActor(
  id: string,
  subscribe: ChargingPointActor["events"]["subscribe"],
): ChargingPointActor {
  return {
    id,
    protocol: "OCPP16J",
    status: "starting",
    events: { subscribe },
    start: async () => ({
      chargingPointId: id,
      chargingPointActorStatus: "running",
      bootStatus: "Accepted",
    }),
    stop: async () => ({
      chargingPointId: id,
      chargingPointActorStatus: "stopped",
    }),
    dispose: async () => undefined,
    plug: async () => { throw new Error("not used"); },
    unplug: async () => { throw new Error("not used"); },
    authorize: async () => { throw new Error("not used"); },
    startTransaction: async () => { throw new Error("not used"); },
    getTransactionResource: () => undefined,
    reportMeterValue: async () => { throw new Error("not used"); },
    stopTransaction: async () => { throw new Error("not used"); },
  };
}

async function createChargingPoint(app: ReturnType<typeof createApp>) {
  const response = await app.request("/api/charging-points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "持久化测试桩",
      identity: "PERSISTENCE_CP",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string };
}

async function createConnector(
  app: ReturnType<typeof createApp>,
  chargingPointId: string,
) {
  const response = await app.request(
    `/api/charging-points/${chargingPointId}/connectors`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evseId: 1,
        connectorId: 1,
        type: "IEC_62196_T2",
        format: "socket",
        powerType: "ac",
        maxVoltage: 230,
        maxCurrent: 32,
      }),
    },
  );
  expect(response.status).toBe(201);
}
