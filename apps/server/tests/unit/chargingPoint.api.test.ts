import { describe, expect, test } from "vitest";

import {
  apiErrorResponseSchema,
  chargingPointDetailResponseSchema,
  connectorResponseSchema,
  listChargingPointsResponseSchema,
} from "@spark-bee/contracts";

import { createApp } from "../../src/app";
import { createTestDatabase } from "../support/testDatabase";

describe("chargingPoint management API", () => {
  test("documents chargingPoint and connector APIs in Chinese", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document.paths["/chargingPoints"].get.summary).toBe("查询桩实例列表");
    expect(document.paths["/chargingPoints"].post.summary).toBe("创建桩实例");
    expect(document.paths["/chargingPoints/{id}"].get.summary).toBe("查看桩实例详情");
    expect(document.paths["/chargingPoints/{id}"].patch.summary).toBe("更新桩实例");
    expect(document.paths["/chargingPoints/{id}"].delete.summary).toBe("删除桩实例");
    expect(document.paths["/chargingPoints/{chargingPointId}/connectors"].get.summary).toBe(
      "查询枪口列表",
    );
    expect(document.paths["/chargingPoints/{chargingPointId}/connectors"].post.summary).toBe(
      "创建枪口",
    );
    expect(
      document.paths["/chargingPoints/{chargingPointId}/connectors/{id}"].patch.summary,
    ).toBe("更新枪口");

    const serializedDocument = JSON.stringify(document);
    expect(serializedDocument).toContain(
      "桩实例连接 CSMS 时使用的 charge point identity",
    );
    expect(serializedDocument).toContain("CSMS 基础 WebSocket 地址");
    expect(serializedDocument).toContain("枪口在所属桩实例内的 connectorId");
  });

  test("creates and reads a chargingPoint without connectors", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const createResponse = await app.request("/chargingPoints", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identity: "CP001",
        protocol: "OCPP16J",
        centralSystemUrl: "ws://localhost:9000/ocpp///",
        vendor: "SparkBee",
        model: "DebugBox",
        firmwareVersion: "  ",
        serialNumber: "SN-001",
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = chargingPointDetailResponseSchema.parse(await createResponse.json());
    expect(created).toMatchObject({
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
      firmwareVersion: null,
      serialNumber: "SN-001",
      connectors: [],
    });

    const detailResponse = await app.request(`/chargingPoints/${created.id}`);

    expect(detailResponse.status).toBe(200);
    expect(chargingPointDetailResponseSchema.parse(await detailResponse.json())).toEqual(created);
  });

  test("lists chargingPoints with simple pagination and connector counts", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    for (const identity of ["CP001", "CP002"]) {
      await app.request("/chargingPoints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identity,
          protocol: "OCPP16J",
          centralSystemUrl: "ws://localhost:9000/ocpp",
          vendor: "SparkBee",
          model: "DebugBox",
        }),
      });
    }

    const listResponse = await app.request("/chargingPoints?page=1&pageSize=1&keyword=CP");

    expect(listResponse.status).toBe(200);
    const list = listChargingPointsResponseSchema.parse(await listResponse.json());
    expect(list).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
    });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.connectorCount).toBe(0);
  });

  test("updates editable chargingPoint fields", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const created = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });

    const response = await app.request(`/chargingPoints/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identity: "CP002",
        centralSystemUrl: "wss://csms.example.com/root///",
        vendor: "NextVendor",
        firmwareVersion: "1.2.3",
        serialNumber: "",
      }),
    });

    expect(response.status).toBe(200);
    expect(chargingPointDetailResponseSchema.parse(await response.json())).toMatchObject({
      id: created.id,
      identity: "CP002",
      centralSystemUrl: "wss://csms.example.com/root",
      vendor: "NextVendor",
      model: "DebugBox",
      firmwareVersion: "1.2.3",
      serialNumber: null,
    });
  });

  test("soft deletes chargingPoints", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const created = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });

    const deleteResponse = await app.request(`/chargingPoints/${created.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);
    const detailResponse = await app.request(`/chargingPoints/${created.id}`);
    expect(detailResponse.status).toBe(404);

    const listResponse = await app.request("/chargingPoints");
    const list = listChargingPointsResponseSchema.parse(await listResponse.json());
    expect(list.total).toBe(0);
  });

  test("creates and lists connectors for a chargingPoint", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });

    const firstConnector = await createConnector(app, chargingPoint.id, {
      evseId: 1,
      connectorId: 1,
      type: "Type2",
      format: "socket",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
      maxPower: 7000,
    });
    const secondConnector = await createConnector(app, chargingPoint.id, {
      evseId: 2,
      connectorId: 2,
      type: "CCS2",
      format: "cable",
      powerType: "dc",
    });

    expect(firstConnector).toMatchObject({ sortOrder: 1 });
    expect(secondConnector).toMatchObject({ sortOrder: 2 });

    const listResponse = await app.request(
      `/chargingPoints/${chargingPoint.id}/connectors`,
    );

    expect(listResponse.status).toBe(200);
    const connectors = connectorResponseSchema.array().parse(await listResponse.json());
    expect(connectors.map((connector) => connector.id)).toEqual([
      firstConnector.id,
      secondConnector.id,
    ]);

    const detailResponse = await app.request(`/chargingPoints/${chargingPoint.id}`);
    const detail = chargingPointDetailResponseSchema.parse(await detailResponse.json());
    expect(detail.connectors.map((connector) => connector.id)).toEqual([
      firstConnector.id,
      secondConnector.id,
    ]);
  });

  test("updates and soft deletes connectors", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 1,
      connectorId: 1,
      type: "Type2",
      format: "socket",
      powerType: "ac",
    });

    const updateResponse = await app.request(
      `/chargingPoints/${chargingPoint.id}/connectors/${connector.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evseId: 10,
          connectorId: 20,
          type: "CCS2",
          format: "cable",
          powerType: "dc",
          maxPower: 50_000,
          sortOrder: 99,
        }),
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(connectorResponseSchema.parse(await updateResponse.json())).toMatchObject({
      id: connector.id,
      evseId: 10,
      connectorId: 20,
      type: "CCS2",
      format: "cable",
      powerType: "dc",
      maxPower: 50_000,
      sortOrder: 1,
    });

    const deleteResponse = await app.request(
      `/chargingPoints/${chargingPoint.id}/connectors/${connector.id}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await app.request(
      `/chargingPoints/${chargingPoint.id}/connectors`,
    );
    expect(connectorResponseSchema.array().parse(await listResponse.json())).toEqual([]);
  });

  test("rejects duplicate connector numbers within a chargingPoint", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    await createConnector(app, chargingPoint.id, {
      evseId: 1,
      connectorId: 1,
      type: "Type2",
      format: "socket",
      powerType: "ac",
    });

    const response = await app.request(`/chargingPoints/${chargingPoint.id}/connectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evseId: 1,
        connectorId: 2,
        type: "CCS2",
        format: "cable",
        powerType: "dc",
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CONNECTOR_CONFLICT",
        message: "EVSE ID already exists",
      },
    });
  });

  test("returns validation details for invalid chargingPoint input", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const response = await app.request("/chargingPoints", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identity: "CP 001",
        protocol: "OCPP16J",
        centralSystemUrl: "https://example.com/ocpp",
        vendor: "",
        model: "DebugBox",
      }),
    });

    expect(response.status).toBe(400);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.error.code).toBe("VALIDATION_FAILED");
    expect(error.error.message).toBe("Validation failed");
    expect(error.error.details?.length).toBeGreaterThan(0);
  });

  test("hides connectors outside the requested chargingPoint", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const firstChargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const secondChargingPoint = await createChargingPoint(app, {
      identity: "CP002",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const connector = await createConnector(app, firstChargingPoint.id, {
      evseId: 1,
      connectorId: 1,
      type: "Type2",
      format: "socket",
      powerType: "ac",
    });

    const response = await app.request(
      `/chargingPoints/${secondChargingPoint.id}/connectors/${connector.id}`,
    );

    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        code: "CONNECTOR_NOT_FOUND",
        message: "Connector not found",
      },
    });
  });
});

async function createChargingPoint(
  app: ReturnType<typeof createApp>,
  input: Record<string, unknown>,
) {
  const response = await app.request("/chargingPoints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  expect(response.status).toBe(201);
  return chargingPointDetailResponseSchema.parse(await response.json());
}

async function createConnector(
  app: ReturnType<typeof createApp>,
  chargingPointId: string,
  input: Record<string, unknown>,
) {
  const response = await app.request(`/chargingPoints/${chargingPointId}/connectors`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  expect(response.status).toBe(201);
  return connectorResponseSchema.parse(await response.json());
}
