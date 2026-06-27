import { describe, expect, test } from "vitest";

import {
  apiErrorResponseSchema,
  chargingPointDetailResponseSchema,
  chargingPointOperationResponseSchema,
  connectorResponseSchema,
  listChargingPointsResponseSchema,
} from "@spark-bee/contracts";
import type {
  ChargingPointActor,
  ChargingPointActorStartResult,
  ChargingPointActorStatus,
  ChargingPointActorStopResult,
} from "@spark-bee/charging-point-actor";

import { createApp } from "../../src/app";
import { ChargingPointActorRegistry } from "../../src/lib/chargingPointActorRegistry";
import { createTestDatabase } from "../support/testDatabase";

describe("chargingPoint management API", () => {
  test("documents chargingPoint and connector APIs in Chinese", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const response = await app.request("/api/openapi.json");

    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document.paths).not.toHaveProperty("/chargingPoints");
    expect(document.paths["/api/charging-points"].get.summary).toBe("查询桩实例列表");
    expect(document.paths["/api/charging-points"].post.summary).toBe("创建桩实例");
    expect(document.paths["/api/charging-points/{id}"].get.summary).toBe("查看桩实例详情");
    expect(document.paths["/api/charging-points/{id}"].patch.summary).toBe("更新桩实例");
    expect(document.paths["/api/charging-points/{id}"].delete.summary).toBe("删除桩实例");
    expect(document.paths["/api/charging-points/{id}/start"].post.summary).toBe(
      "启动桩实例",
    );
    expect(document.paths["/api/charging-points/{id}/start"].post.tags).toEqual([
      "ChargingPointOperation",
    ]);
    expect(document.paths["/api/charging-points/{id}/stop"].post.summary).toBe(
      "停止桩实例",
    );
    expect(document.paths["/api/charging-points/{id}/stop"].post.tags).toEqual([
      "ChargingPointOperation",
    ]);
    expect(document.paths["/api/charging-points/{id}/status"].get.summary).toBe(
      "查询桩实例运行状态",
    );
    expect(document.paths["/api/charging-points/{id}/status"].get.tags).toEqual([
      "ChargingPointOperation",
    ]);
    expect(document.paths["/api/charging-points/{id}/connectors"].get.summary).toBe(
      "查询枪口列表",
    );
    expect(document.paths["/api/charging-points/{id}/connectors"].post.summary).toBe(
      "创建枪口",
    );
    expect(
      document.paths["/api/charging-points/{id}/connectors/{connectorId}"].patch.summary,
    ).toBe("更新枪口");

    const serializedDocument = JSON.stringify(document);
    expect(serializedDocument).toContain(
      "桩实例连接 CSMS 时使用的 charge point identity",
    );
    expect(serializedDocument).toContain("CSMS 基础 WebSocket 地址");
    expect(serializedDocument).toContain("枪口在所属桩实例内的 connectorId");
    expect(serializedDocument).toContain("当前服务进程中的运行状态");
  });

  test("does not expose the old camelCase chargingPoint path", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const response = await app.request("/chargingPoints");

    expect(response.status).toBe(404);
  });

  test("does not expose chargingPoint APIs without the API prefix", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const response = await app.request("/charging-points");

    expect(response.status).toBe(404);
  });

  test("creates and reads a chargingPoint without connectors", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const createResponse = await app.request("/api/charging-points", {
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

    const detailResponse = await app.request(`/api/charging-points/${created.id}`);

    expect(detailResponse.status).toBe(200);
    expect(chargingPointDetailResponseSchema.parse(await detailResponse.json())).toEqual(created);
  });

  test("lists chargingPoints with simple pagination and connector counts", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    for (const identity of ["CP001", "CP002"]) {
      await app.request("/api/charging-points", {
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

    const listResponse = await app.request("/api/charging-points?page=1&pageSize=1&keyword=CP");

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

    const response = await app.request(`/api/charging-points/${created.id}`, {
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

    const deleteResponse = await app.request(`/api/charging-points/${created.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);
    const detailResponse = await app.request(`/api/charging-points/${created.id}`);
    expect(detailResponse.status).toBe(404);

    const listResponse = await app.request("/api/charging-points");
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
      `/api/charging-points/${chargingPoint.id}/connectors`,
    );

    expect(listResponse.status).toBe(200);
    const connectors = connectorResponseSchema.array().parse(await listResponse.json());
    expect(connectors.map((connector) => connector.id)).toEqual([
      firstConnector.id,
      secondConnector.id,
    ]);

    const detailResponse = await app.request(`/api/charging-points/${chargingPoint.id}`);
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
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}`,
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
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors`,
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

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/connectors`, {
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

    const response = await app.request("/api/charging-points", {
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
      `/api/charging-points/${secondChargingPoint.id}/connectors/${connector.id}`,
    );

    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        code: "CONNECTOR_NOT_FOUND",
        message: "Connector not found",
      },
    });
  });

  test("returns stopped status when the chargingPoint is not running", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/status`);

    expect(response.status).toBe(200);
    expect(chargingPointOperationResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "stopped",
    });
  });

  test("rejects starting a chargingPoint without connectors", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        code: "CHARGING_POINT_NOT_RUNNABLE",
        message: "Charging point requires at least one connector",
      },
    });
  });

  test("starts a chargingPoint and keeps repeated starts idempotent", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble({
      startResult: {
        chargingPointId: "",
        chargingPointActorStatus: "running",
        bootStatus: "Accepted",
      },
    });
    const app = createApp({
      database,
      createChargingPointActor: (options) => {
        actor.id = options.id;
        actor.startResult = {
          chargingPointId: options.id,
          chargingPointActorStatus: "running",
          bootStatus: "Accepted",
        };
        return actor;
      },
    });
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

    const firstResponse = await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });
    const secondResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/start`,
      { method: "POST" },
    );

    expect(firstResponse.status).toBe(200);
    expect(chargingPointOperationResponseSchema.parse(await firstResponse.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "running",
      bootStatus: "Accepted",
    });
    expect(secondResponse.status).toBe(200);
    expect(chargingPointOperationResponseSchema.parse(await secondResponse.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "running",
    });
    expect(actor.startCalls).toBe(1);
  });

  test("maps Boot Pending to starting status", async () => {
    const database = await createTestDatabase();
    const app = createApp({
      database,
      createChargingPointActor: (options) =>
        createActorDouble({
          id: options.id,
          startResult: {
            chargingPointId: options.id,
            chargingPointActorStatus: "starting",
            bootStatus: "Pending",
            retryAfterSec: 30,
          },
        }),
    });
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

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(chargingPointOperationResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "starting",
      bootStatus: "Pending",
      retryAfterSec: 30,
    });
  });

  test("returns stopped when stopping a chargingPoint that is not running", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/stop`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(chargingPointOperationResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "stopped",
    });
  });

  test("removes and disposes the actor when start fails", async () => {
    const database = await createTestDatabase();
    const registry = new ChargingPointActorRegistry();
    const actor = createActorDouble({ startError: new Error("boom") });
    const app = createApp({
      database,
      chargingPointActorRegistry: registry,
      createChargingPointActor: (options) => {
        actor.id = options.id;
        return actor;
      },
    });
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

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });

    expect(response.status).toBe(502);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      error: {
        code: "CHARGING_POINT_START_FAILED",
      },
    });
    expect(registry.get(chargingPoint.id)).toBeUndefined();
    expect(actor.disposeCalls).toBe(1);
  });

  test("stops a running chargingPoint and removes its actor", async () => {
    const database = await createTestDatabase();
    const registry = new ChargingPointActorRegistry();
    const actor = createActorDouble();
    const app = createApp({
      database,
      chargingPointActorRegistry: registry,
      createChargingPointActor: (options) => {
        actor.id = options.id;
        actor.startResult = {
          chargingPointId: options.id,
          chargingPointActorStatus: "running",
          bootStatus: "Accepted",
        };
        actor.stopResult = {
          chargingPointId: options.id,
          chargingPointActorStatus: "stopped",
        };
        return actor;
      },
    });
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
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/stop`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(chargingPointOperationResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "stopped",
    });
    expect(registry.get(chargingPoint.id)).toBeUndefined();
    expect(actor.stopCalls).toBe(1);
    expect(actor.disposeCalls).toBe(1);
  });
});

async function createChargingPoint(
  app: ReturnType<typeof createApp>,
  input: Record<string, unknown>,
) {
  const response = await app.request("/api/charging-points", {
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
  const response = await app.request(`/api/charging-points/${chargingPointId}/connectors`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  expect(response.status).toBe(201);
  return connectorResponseSchema.parse(await response.json());
}

function createActorDouble(
  overrides: Partial<{
    id: string;
    status: ChargingPointActorStatus;
    startResult: ChargingPointActorStartResult;
    stopResult: ChargingPointActorStopResult;
    startError: Error;
    stopError: Error;
  }> = {},
) {
  return {
    id: overrides.id ?? "00000000-0000-4000-8000-000000000001",
    protocol: "OCPP16J",
    status: overrides.status ?? "stopped",
    startResult:
      overrides.startResult ??
      ({
        chargingPointId: overrides.id ?? "00000000-0000-4000-8000-000000000001",
        chargingPointActorStatus: "running",
        bootStatus: "Accepted",
      } satisfies ChargingPointActorStartResult),
    stopResult:
      overrides.stopResult ??
      ({
        chargingPointId: overrides.id ?? "00000000-0000-4000-8000-000000000001",
        chargingPointActorStatus: "stopped",
      } satisfies ChargingPointActorStopResult),
    startCalls: 0,
    stopCalls: 0,
    disposeCalls: 0,
    events: {
      subscribe: () => () => undefined,
    },
    async start() {
      this.startCalls += 1;
      if (overrides.startError !== undefined) {
        throw overrides.startError;
      }
      this.status = this.startResult.chargingPointActorStatus;
      return this.startResult;
    },
    async stop() {
      this.stopCalls += 1;
      if (overrides.stopError !== undefined) {
        throw overrides.stopError;
      }
      this.status = "stopped";
      return this.stopResult;
    },
    async dispose() {
      this.disposeCalls += 1;
    },
    async plug() {
      throw new Error("not implemented");
    },
    async unplug() {
      throw new Error("not implemented");
    },
    async authorize() {
      throw new Error("not implemented");
    },
    async startTransaction() {
      throw new Error("not implemented");
    },
    async reportMeterValue() {
      throw new Error("not implemented");
    },
    async stopTransaction() {
      throw new Error("not implemented");
    },
  } satisfies ChargingPointActor & {
    id: string;
    status: ChargingPointActorStatus;
    startResult: ChargingPointActorStartResult;
    stopResult: ChargingPointActorStopResult;
    startCalls: number;
    stopCalls: number;
    disposeCalls: number;
  };
}
