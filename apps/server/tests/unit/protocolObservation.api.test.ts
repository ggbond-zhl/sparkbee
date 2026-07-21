import { describe, expect, test } from "vitest";
import {
  listProtocolEventsResponseSchema,
  listProtocolMessagesResponseSchema,
} from "@spark-bee/contracts";

import { createApp } from "../../src/app";
import { schema } from "../../src/db";
import { createTestDatabase } from "../support/testDatabase";

describe("历史观察记录 API", () => {
  test("停运桩刷新时返回最近 200 条协议报文和更早游标", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);

    await database.insert(schema.protocolMessages).values(
      Array.from({ length: 201 }, (_, index) => ({
        id: `message-${index}`,
        sequence: index,
        chargingPointId: chargingPoint.id,
        protocol: "OCPP16J" as const,
        occurredAt: new Date(Date.UTC(2026, 6, 20, 0, 0, index)),
        direction: (index % 2 === 0 ? "sent" : "received") as
          | "sent"
          | "received",
        action: "Heartbeat",
        messageId: `ocpp-${index}`,
        body: [2, `ocpp-${index}`, "Heartbeat", {}],
      })),
    );

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/protocol-messages`,
    );
    expect(response.status).toBe(200);

    const result = listProtocolMessagesResponseSchema.parse(await response.json());
    expect(result.items).toHaveLength(200);
    expect(result.items[0]?.id).toBe("message-200");
    expect(result.items.at(-1)?.id).toBe("message-1");
    expect(result.previousCursor).not.toBeNull();
  });

  test("停运桩可以按事件类型查询完整协议事件", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);
    const base = {
      sequence: 1,
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J" as const,
      occurredAt: "2026-07-20T00:00:00.000Z",
    };

    await database.insert(schema.protocolEvents).values([
      {
        id: "event-lifecycle",
        sequence: 1,
        chargingPointId: chargingPoint.id,
        protocol: "OCPP16J",
        occurredAt: new Date(base.occurredAt),
        eventType: "chargingPoint.lifecycle",
        resource: { scope: "chargingPoint" },
        data: {
          ...base,
          id: "event-lifecycle",
          type: "chargingPoint.lifecycle",
          resource: { scope: "chargingPoint" },
          previousStatus: null,
          currentStatus: "running",
        },
      },
      {
        id: "event-connector",
        sequence: 2,
        chargingPointId: chargingPoint.id,
        protocol: "OCPP16J",
        occurredAt: new Date("2026-07-20T00:00:01.000Z"),
        eventType: "connector.status",
        resource: { scope: "connector", evseId: 1, connectorId: 1 },
        data: {
          ...base,
          id: "event-connector",
          sequence: 2,
          occurredAt: "2026-07-20T00:00:01.000Z",
          type: "connector.status",
          resource: { scope: "connector", evseId: 1, connectorId: 1 },
          previousStatus: null,
          currentStatus: "available",
        },
      },
    ]);

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/protocol-events?eventType=connector.status`,
    );
    expect(response.status).toBe(200);
    const result = listProtocolEventsResponseSchema.parse(await response.json());
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "event-connector",
        type: "connector.status",
        resource: { scope: "connector", evseId: 1, connectorId: 1 },
        currentStatus: "available",
      }),
    ]);
  });

  test("删除桩实例时同步删除协议报文和协议事件", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app);

    await database.insert(schema.protocolMessages).values({
      id: "message-to-delete",
      sequence: 1,
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      occurredAt: new Date("2026-07-20T00:00:00.000Z"),
      direction: "sent",
      action: "Heartbeat",
    });
    await database.insert(schema.protocolEvents).values({
      id: "event-to-delete",
      sequence: 2,
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      occurredAt: new Date("2026-07-20T00:00:01.000Z"),
      eventType: "chargingPoint.lifecycle",
      resource: { scope: "chargingPoint" },
      data: {
        id: "event-to-delete",
        sequence: 2,
        chargingPointId: chargingPoint.id,
        protocol: "OCPP16J",
        occurredAt: "2026-07-20T00:00:01.000Z",
        type: "chargingPoint.lifecycle",
        resource: { scope: "chargingPoint" },
        previousStatus: "running",
        currentStatus: "stopped",
      },
    });

    expect((await app.request(`/api/charging-points/${chargingPoint.id}`, {
      method: "DELETE",
    })).status).toBe(204);

    const messageResult = listProtocolMessagesResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/protocol-messages`)
    ).json());
    const eventResult = listProtocolEventsResponseSchema.parse(await (
      await app.request(`/api/charging-points/${chargingPoint.id}/protocol-events`)
    ).json());
    expect(messageResult.items).toEqual([]);
    expect(eventResult.items).toEqual([]);
  });
});

async function createChargingPoint(app: ReturnType<typeof createApp>) {
  const response = await app.request("/api/charging-points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "历史观察测试桩",
      identity: "OBSERVATION_CP",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string };
}
