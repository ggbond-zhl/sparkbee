import { describe, expect, test } from "vitest";

import {
  apiErrorResponseSchema,
  chargingPointConnectorActionResponseSchema,
  chargingPointDetailResponseSchema,
  connectorResponseSchema,
  listChargingPointsResponseSchema,
  runtimeAuthorizeResponseSchema,
  runtimeOperationResponseSchema,
  runtimeSnapshotResponseSchema,
  runtimeStartTransactionResponseSchema,
  runtimeStopTransactionResponseSchema,
} from "@spark-bee/contracts";
import { ChargingPointActorError } from "@spark-bee/charging-point-actor";
import type {
  ChargingPointActor,
  ChargingPointActorAuthorizeInput,
  ChargingPointActorAuthorizeResult,
  ChargingPointActorConnectorActionInput,
  ChargingPointActorConnectorActionResult,
  ChargingPointActorOptions,
  ChargingPointActorResourceRef,
  ChargingPointActorEvent,
  ChargingPointActorStartResult,
  ChargingPointActorStatus,
  ChargingPointActorStartTransactionInput,
  ChargingPointActorStopResult,
  ChargingPointActorStopTransactionInput,
  ChargingPointActorStopTransactionResult,
  ChargingPointActorTransactionStartResult,
} from "@spark-bee/charging-point-actor";

import { createApp } from "../../src/app";
import { ChargingPointActorHost } from "../../src/lib/chargingPointActorHost";
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
      "RuntimeOperation",
    ]);
    expect(document.paths["/api/charging-points/{id}/stop"].post.summary).toBe(
      "停止桩实例",
    );
    expect(document.paths["/api/charging-points/{id}/stop"].post.tags).toEqual([
      "RuntimeOperation",
    ]);
    expect(document.paths["/api/charging-points/{id}/status"].get.summary).toBe(
      "查询桩实例运行状态",
    );
    expect(document.paths["/api/charging-points/{id}/status"].get.tags).toEqual([
      "RuntimeOperation",
    ]);
    expect(
      document.paths["/api/charging-points/{id}/runtime-snapshot"].get.summary,
    ).toBe("查询桩实例运行状态快照");
    expect(
      document.paths["/api/charging-points/{id}/runtime-snapshot"].get.tags,
    ).toEqual(["RuntimeOperation"]);
    expect(document.paths["/api/charging-points/{id}/events"].get.summary).toBe(
      "订阅桩事件流",
    );
    expect(document.paths["/api/charging-points/{id}/events"].get.tags).toEqual([
      "ChargingPointEvent",
    ]);
    expect(
      document.paths["/api/charging-points/{id}/events"].get.responses["200"].content,
    ).toHaveProperty("text/event-stream");
    expect(document.paths["/api/charging-points/{id}/connectors"].get.summary).toBe(
      "查询枪口列表",
    );
    expect(document.paths["/api/charging-points/{id}/connectors"].post.summary).toBe(
      "创建枪口",
    );
    expect(
      document.paths["/api/charging-points/{id}/connectors/{connectorId}"].patch.summary,
    ).toBe("更新枪口");
    expect(
      document.paths["/api/charging-points/{id}/connectors/{connectorId}/plug"].post.summary,
    ).toBe("插枪");
    expect(
      document.paths["/api/charging-points/{id}/connectors/{connectorId}/plug"].post.tags,
    ).toEqual(["RuntimeOperation"]);
    expect(
      document.paths["/api/charging-points/{id}/connectors/{connectorId}/unplug"].post.summary,
    ).toBe("拔枪");
    expect(
      document.paths["/api/charging-points/{id}/connectors/{connectorId}/unplug"].post.tags,
    ).toEqual(["RuntimeOperation"]);
    expect(
      document.paths["/api/charging-points/{id}/connectors/{connectorId}/authorize"].post.summary,
    ).toBe("鉴权");
    expect(
      document.paths["/api/charging-points/{id}/connectors/{connectorId}/authorize"].post.tags,
    ).toEqual(["RuntimeOperation"]);
    expect(
      document.paths[
        "/api/charging-points/{id}/connectors/{connectorId}/start-transaction"
      ].post.summary,
    ).toBe("开始交易");
    expect(
      document.paths[
        "/api/charging-points/{id}/connectors/{connectorId}/start-transaction"
      ].post.tags,
    ).toEqual(["RuntimeOperation"]);
    expect(
      document.paths[
        "/api/charging-points/{id}/connectors/{connectorId}/stop-transaction"
      ].post.summary,
    ).toBe("停止交易");
    expect(
      document.paths[
        "/api/charging-points/{id}/connectors/{connectorId}/stop-transaction"
      ].post.tags,
    ).toEqual(["RuntimeOperation"]);

    const serializedDocument = JSON.stringify(document);
    expect(serializedDocument).toContain(
      "桩实例连接 CSMS 时使用的 charge point identity",
    );
    expect(serializedDocument).toContain("桩实例在 SparkBee 内部使用的展示名称");
    expect(serializedDocument).toContain("桩实例的备注说明");
    expect(serializedDocument).toContain("CSMS 基础 WebSocket 地址");
    expect(serializedDocument).toContain("枪口在所属桩实例内的 connectorId");
    expect(serializedDocument).toContain("当前服务进程中的运行状态");
    expect(serializedDocument).toContain("刷新后恢复当前运行态");
    expect(serializedDocument).toContain("车辆接入枪口模拟动作");
    expect(serializedDocument).toContain("用于 OCPP Authorize 的 idTag");
    expect(serializedDocument).toContain("不要求事先调用鉴权接口");
    expect(serializedDocument).toContain("未提供时 OCPP StopTransaction 不携带 reason");
    expect(serializedDocument).toContain("枪口的 UUID 主键");
    expect(serializedDocument).toContain("枪口在 OCPP 协议中的 connectorId");
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
        name: " 调试桩 A ",
        description: " 主调试桩 ",
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
      name: "调试桩 A",
      description: "主调试桩",
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
          name: `调试桩 ${identity}`,
          identity,
          protocol: "OCPP16J",
          centralSystemUrl: "ws://localhost:9000/ocpp",
          vendor: "SparkBee",
          model: "DebugBox",
        }),
      });
    }

    const listResponse = await app.request("/api/charging-points?page=1&pageSize=10&keyword=CP");

    expect(listResponse.status).toBe(200);
    const list = listChargingPointsResponseSchema.parse(await listResponse.json());
    expect(list).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 2,
    });
    expect(list.items).toHaveLength(2);
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
        name: "调试桩 B",
        description: "",
        centralSystemUrl: "wss://csms.example.com/root///",
        vendor: "NextVendor",
        firmwareVersion: "1.2.3",
        serialNumber: "",
      }),
    });

    expect(response.status).toBe(200);
    expect(chargingPointDetailResponseSchema.parse(await response.json())).toMatchObject({
      id: created.id,
      name: "调试桩 B",
      description: null,
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
    });
    const secondConnector = await createConnector(app, chargingPoint.id, {
      evseId: 2,
      connectorId: 2,
      type: "IEC_62196_T2_COMBO",
      format: "cable",
      powerType: "dc",
      maxVoltage: 750,
      maxCurrent: 200,
      maxPower: 150_000,
    });

    expect(firstConnector).toMatchObject({ sortOrder: 1, maxPower: null });
    expect(secondConnector).toMatchObject({ sortOrder: 2, maxPower: null });

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
      type: "IEC_62196_T2",
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
          type: "IEC_62196_T2_COMBO",
          format: "cable",
          powerType: "dc",
          maxVoltage: 750,
          maxCurrent: 200,
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
      type: "IEC_62196_T2_COMBO",
      format: "cable",
      powerType: "dc",
      maxVoltage: 750,
      maxCurrent: 200,
      maxPower: null,
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/connectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evseId: 1,
        connectorId: 2,
        type: "IEC_62196_T2_COMBO",
        format: "cable",
        powerType: "dc",
        maxVoltage: 750,
        maxCurrent: 200,
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
      type: "IEC_62196_T2",
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
    expect(runtimeOperationResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "stopped",
    });
  });

  test("keeps accepted Boot status when querying a running chargingPoint", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble();
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/status`);

    expect(response.status).toBe(200);
    expect(runtimeOperationResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "running",
      bootStatus: "Accepted",
    });
  });

  test("returns an empty runtime snapshot when the chargingPoint is stopped", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/runtime-snapshot`,
    );

    expect(response.status).toBe(200);
    expect(runtimeSnapshotResponseSchema.parse(await response.json())).toEqual(
      expectedRuntimeSnapshot(chargingPoint.id, "stopped"),
    );
  });

  test("streams a snapshot for an existing stopped chargingPoint", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/events`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await expect(readNextSseEvent(response)).resolves.toEqual({
      event: "snapshot",
      data: expectedRuntimeSnapshot(chargingPoint.id, "stopped"),
    });
  });

  test("restores the current runtime snapshot through HTTP and the SSE first event", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble();
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    actor.publish({
      id: "event-1",
      sequence: 1,
      type: "session.status",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "session" },
      occurredAt: "2026-07-04T09:00:00.000Z",
      previousStatus: "offline",
      currentStatus: "online",
      connectionUrl: "ws://localhost:9000/ocpp/CP001",
    });
    actor.publish({
      id: "event-2",
      sequence: 2,
      type: "chargingPoint.availability",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "chargingPoint" },
      occurredAt: "2026-07-04T09:00:01.000Z",
      previousAvailability: "operative",
      currentAvailability: "operative",
    });
    actor.publish({
      id: "event-3",
      sequence: 3,
      type: "chargingPoint.status",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "chargingPoint" },
      occurredAt: "2026-07-04T09:00:02.000Z",
      previousStatus: null,
      currentStatus: "available",
    });
    actor.publish({
      id: "event-4",
      sequence: 4,
      type: "connector.availability",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      occurredAt: "2026-07-04T09:00:03.000Z",
      previousAvailability: "operative",
      currentAvailability: "operative",
      requestedAvailability: "inoperative",
    });
    actor.publish({
      id: "event-5",
      sequence: 5,
      type: "connector.status",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      occurredAt: "2026-07-04T09:00:04.000Z",
      previousStatus: null,
      currentStatus: "occupied",
    });
    actor.publish({
      id: "event-6",
      sequence: 6,
      type: "transaction.status",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "tx-1",
      },
      occurredAt: "2026-07-04T09:00:05.000Z",
      previousStatus: "starting",
      currentStatus: "active",
    });
    actor.publish({
      id: "event-7",
      sequence: 7,
      type: "transaction.meterValue",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "tx-1",
      },
      occurredAt: "2026-07-04T09:00:06.000Z",
      meterWh: 1200,
      powerW: 7200,
      currentA: 32,
      voltageV: 225,
      sampledAt: "2026-07-04T09:00:06.000Z",
    });
    actor.publish({
      id: "event-8",
      sequence: 8,
      type: "protocol.message",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "protocol" },
      occurredAt: "2026-07-04T09:00:07.000Z",
      direction: "received",
      action: "Heartbeat",
      messageId: "message-1",
      body: { currentTime: "2026-07-04T09:00:07.000Z" },
    });

    const expectedSnapshot = {
      ...expectedRuntimeSnapshot(chargingPoint.id, "running"),
      sessionStatus: {
        currentStatus: "online",
        occurredAt: "2026-07-04T09:00:00.000Z",
        connectionUrl: "ws://localhost:9000/ocpp/CP001",
      },
      chargingPointStatus: {
        currentStatus: "available",
        occurredAt: "2026-07-04T09:00:02.000Z",
      },
      chargingPointAvailability: {
        currentAvailability: "operative",
        occurredAt: "2026-07-04T09:00:01.000Z",
      },
      connectorStatuses: [
        {
          evseId: 1,
          connectorId: 1,
          currentStatus: "occupied",
          occurredAt: "2026-07-04T09:00:04.000Z",
        },
      ],
      connectorAvailabilities: [
        {
          evseId: 1,
          connectorId: 1,
          currentAvailability: "operative",
          requestedAvailability: "inoperative",
          occurredAt: "2026-07-04T09:00:03.000Z",
        },
      ],
      transactionStatuses: [
        {
          transactionId: "tx-1",
          evseId: 1,
          connectorId: 1,
          currentStatus: "active",
          meterWh: 1200,
          powerW: 7200,
          currentA: 32,
          voltageV: 225,
          sampledAt: "2026-07-04T09:00:06.000Z",
          occurredAt: "2026-07-04T09:00:06.000Z",
        },
      ],
      lastHeartbeatAt: "2026-07-04T09:00:07.000Z",
    };

    const snapshotResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/runtime-snapshot`,
    );
    expect(snapshotResponse.status).toBe(200);
    expect(runtimeSnapshotResponseSchema.parse(await snapshotResponse.json())).toEqual(
      expectedSnapshot,
    );

    const streamResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/events`,
    );
    await expect(readNextSseEvent(streamResponse)).resolves.toEqual({
      event: "snapshot",
      data: expectedSnapshot,
    });
  });

  test("returns 404 when subscribing to a missing chargingPoint event stream", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const response = await app.request(
      "/api/charging-points/00000000-0000-4000-8000-000000000001/events",
    );

    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        code: "CHARGING_POINT_NOT_FOUND",
        message: "Charging point not found",
      },
    });
  });

  test("forwards running actor events to the chargingPoint event stream", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble();
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/events`);
    const reader = response.body!.getReader();

    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "snapshot",
      data: expectedRuntimeSnapshot(chargingPoint.id, "running"),
    });

    const actorEvent = {
      id: "event-1",
      sequence: 1,
      type: "protocol.message",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "protocol" },
      occurredAt: "2026-06-28T00:00:00.000Z",
      direction: "sent",
      action: "BootNotification",
      messageId: "message-1",
      body: { status: "Accepted" },
    } satisfies ChargingPointActorEvent;
    actor.publish(actorEvent);

    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "protocol.message",
      data: actorEvent,
    });
    await reader.cancel();
  });

  test("keeps a stopped chargingPoint event stream subscribed after start", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble();
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    const response = await app.request(`/api/charging-points/${chargingPoint.id}/events`);
    const reader = response.body!.getReader();

    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "snapshot",
      data: expectedRuntimeSnapshot(chargingPoint.id, "stopped"),
    });

    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });
    const actorEvent = {
      id: "event-1",
      sequence: 1,
      type: "session.status",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "session" },
      occurredAt: "2026-06-28T00:00:00.000Z",
      previousStatus: "offline",
      currentStatus: "online",
      connectionUrl: "ws://localhost:9000/ocpp/CP001",
    } satisfies ChargingPointActorEvent;
    actor.publish(actorEvent);

    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "session.status",
      data: actorEvent,
    });
    const nextActorEvent = {
      ...actorEvent,
      id: "event-2",
      sequence: 2,
      occurredAt: "2026-06-28T00:00:01.000Z",
      previousStatus: "online",
      currentStatus: "offline",
    } satisfies ChargingPointActorEvent;
    actor.publish(nextActorEvent);

    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "session.status",
      data: nextActorEvent,
    });
    await reader.cancel();
  });

  test("closes the chargingPoint event stream after deletion", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });
    const chargingPoint = await createChargingPoint(app, {
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const response = await app.request(`/api/charging-points/${chargingPoint.id}/events`);
    const reader = response.body!.getReader();

    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "snapshot",
      data: expectedRuntimeSnapshot(chargingPoint.id, "stopped"),
    });

    const deleteResponse = await app.request(`/api/charging-points/${chargingPoint.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);
    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "deleted",
      data: {
        chargingPointId: chargingPoint.id,
      },
    });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  test("keeps the chargingPoint event stream open after stop and restart", async () => {
    const database = await createTestDatabase();
    const actors = [createActorDouble(), createActorDouble()];
    const createdActors: ReturnType<typeof createActorDouble>[] = [];
    const app = createApp({
      database,
      createChargingPointActor: (options) => {
        const actor = actors.shift();
        expect(actor).toBeDefined();
        createdActors.push(actor!);
        actor!.id = options.id;
        actor!.startResult = {
          chargingPointId: options.id,
          chargingPointActorStatus: "running",
          bootStatus: "Accepted",
        };
        actor!.stopResult = {
          chargingPointId: options.id,
          chargingPointActorStatus: "stopped",
        };
        return actor!;
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });
    const response = await app.request(`/api/charging-points/${chargingPoint.id}/events`);
    const reader = response.body!.getReader();

    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "snapshot",
      data: expectedRuntimeSnapshot(chargingPoint.id, "running"),
    });

    await app.request(`/api/charging-points/${chargingPoint.id}/stop`, { method: "POST" });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });
    const restartedEvent = {
      id: "event-2",
      sequence: 1,
      type: "session.status",
      chargingPointId: chargingPoint.id,
      protocol: "OCPP16J",
      resource: { scope: "session" },
      occurredAt: "2026-06-28T00:00:01.000Z",
      previousStatus: "offline",
      currentStatus: "online",
      connectionUrl: "ws://localhost:9000/ocpp/CP001",
    } satisfies ChargingPointActorEvent;
    createdActors[1]!.publish(restartedEvent);

    await expect(readSseEvent(reader)).resolves.toEqual({
      event: "session.status",
      data: restartedEvent,
    });
    await reader.cancel();
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
      type: "IEC_62196_T2",
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
    expect(runtimeOperationResponseSchema.parse(await firstResponse.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "running",
      bootStatus: "Accepted",
    });
    expect(secondResponse.status).toBe(200);
    expect(runtimeOperationResponseSchema.parse(await secondResponse.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "running",
      bootStatus: "Accepted",
    });
    expect(actor.startCalls).toBe(1);
  });

  test("plugs and unplugs a running connector by connector resource id", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble();
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
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 2,
      connectorId: 7,
      type: "IEC_62196_T2_COMBO",
      format: "cable",
      powerType: "dc",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const plugResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/plug`,
      { method: "POST" },
    );
    const unplugResponse = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/unplug`,
      { method: "POST" },
    );

    expect(plugResponse.status).toBe(200);
    expect(chargingPointConnectorActionResponseSchema.parse(await plugResponse.json()))
      .toEqual({
        chargingPointId: chargingPoint.id,
        connectorId: connector.id,
        evseId: 2,
        protocolConnectorId: 7,
        plugState: "plugged",
        vehiclePresence: "detected",
        connectorStatus: "occupied",
      });
    expect(unplugResponse.status).toBe(200);
    expect(chargingPointConnectorActionResponseSchema.parse(await unplugResponse.json()))
      .toEqual({
        chargingPointId: chargingPoint.id,
        connectorId: connector.id,
        evseId: 2,
        protocolConnectorId: 7,
        plugState: "unplugged",
        vehiclePresence: "absent",
        connectorStatus: "available",
      });
    expect(actor.plugInputs).toEqual([{ evseId: 2, connectorId: 7 }]);
    expect(actor.unplugInputs).toEqual([{ evseId: 2, connectorId: 7 }]);
  });

  test("authorizes a running connector by connector resource id", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble();
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
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 2,
      connectorId: 7,
      type: "IEC_62196_T2_COMBO",
      format: "cable",
      powerType: "dc",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/authorize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idTag: " CARD001 " }),
      },
    );

    expect(response.status).toBe(200);
    expect(runtimeAuthorizeResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      connectorId: connector.id,
      evseId: 2,
      protocolConnectorId: 7,
      idTag: "CARD001",
      status: "accepted",
    });
    expect(actor.authorizeInputs).toEqual([
      { evseId: 2, connectorId: 7, idTag: "CARD001" },
    ]);
  });

  test("returns rejected and failed authorize results with HTTP 200", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble({
      authorizeResults: [
        {
          status: "rejected",
          reason: "Authorize 被中心系统拒绝",
          authorizationStatus: "Invalid",
        },
        {
          status: "failed",
          errorCode: "InternalError",
          errorMessage: "authorize timeout",
          shouldReconnect: true,
        },
      ],
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
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 1,
      connectorId: 1,
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const rejectedResponse = await authorizeConnector(
      app,
      chargingPoint.id,
      connector.id,
      "CARD-BLOCKED",
    );
    const failedResponse = await authorizeConnector(
      app,
      chargingPoint.id,
      connector.id,
      "CARD-FAILED",
    );

    expect(rejectedResponse.status).toBe(200);
    expect(runtimeAuthorizeResponseSchema.parse(await rejectedResponse.json()))
      .toMatchObject({
        chargingPointId: chargingPoint.id,
        connectorId: connector.id,
        evseId: 1,
        protocolConnectorId: 1,
        idTag: "CARD-BLOCKED",
        status: "rejected",
        reason: "Authorize 被中心系统拒绝",
        authorizationStatus: "Invalid",
      });
    expect(failedResponse.status).toBe(200);
    expect(runtimeAuthorizeResponseSchema.parse(await failedResponse.json()))
      .toMatchObject({
        chargingPointId: chargingPoint.id,
        connectorId: connector.id,
        evseId: 1,
        protocolConnectorId: 1,
        idTag: "CARD-FAILED",
        status: "failed",
        errorCode: "InternalError",
        errorMessage: "authorize timeout",
        shouldReconnect: true,
      });
  });

  test("starts a transaction on a running connector without prior authorize", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble({
      startTransactionResults: [{ status: "accepted", transactionId: "1001" }],
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
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 2,
      connectorId: 7,
      type: "IEC_62196_T2_COMBO",
      format: "cable",
      powerType: "dc",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/start-transaction`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idTag: " CARD001 ",
          meterStartWh: 10,
          reservationId: 123,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(runtimeStartTransactionResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      connectorId: connector.id,
      evseId: 2,
      protocolConnectorId: 7,
      idTag: "CARD001",
      status: "accepted",
      transactionId: "1001",
    });
    expect(actor.authorizeInputs).toEqual([]);
    expect(actor.startTransactionInputs).toEqual([
      {
        evseId: 2,
        connectorId: 7,
        idTag: "CARD001",
        meterStartWh: 10,
        reservationId: 123,
      },
    ]);
  });

  test("returns rejected start transaction results with HTTP 200", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble({
      startTransactionResults: [
        {
          status: "rejected",
          reason: "未找到有效授权",
          authorizationStatus: "Invalid",
        },
      ],
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
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 1,
      connectorId: 1,
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await startTransaction(
      app,
      chargingPoint.id,
      connector.id,
      "CARD-BLOCKED",
    );

    expect(response.status).toBe(200);
    expect(runtimeStartTransactionResponseSchema.parse(await response.json()))
      .toMatchObject({
        chargingPointId: chargingPoint.id,
        connectorId: connector.id,
        evseId: 1,
        protocolConnectorId: 1,
        idTag: "CARD-BLOCKED",
        status: "rejected",
        reason: "未找到有效授权",
        authorizationStatus: "Invalid",
      });
  });

  test("stops a transaction without sending a reason", async () => {
    const database = await createTestDatabase();
    const stoppedAt = new Date("2026-07-01T00:00:00.000Z");
    const actor = createActorDouble({
      transactionResources: new Map([
        ["1001", { scope: "transaction", evseId: 2, connectorId: 7, transactionId: "1001" }],
      ]),
      stopTransactionResults: [
        {
          status: "accepted",
          transactionId: "1001",
          meterStopWh: 100,
          stoppedAt,
        },
      ],
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
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 2,
      connectorId: 7,
      type: "IEC_62196_T2_COMBO",
      format: "cable",
      powerType: "dc",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/stop-transaction`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactionId: "1001",
          meterStopWh: 100,
          idTag: " CARD001 ",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(runtimeStopTransactionResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      connectorId: connector.id,
      evseId: 2,
      protocolConnectorId: 7,
      status: "accepted",
      transactionId: "1001",
      meterStopWh: 100,
      stoppedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(actor.stopTransactionInputs).toEqual([
      {
        transactionId: "1001",
        reason: undefined,
        meterStopWh: 100,
        idTag: "CARD001",
      },
    ]);
  });

  test("rejects stop transaction when the transaction belongs to another connector", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble({
      transactionResources: new Map([
        ["1001", { scope: "transaction", evseId: 9, connectorId: 9, transactionId: "1001" }],
      ]),
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
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 1,
      connectorId: 1,
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/stop-transaction`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionId: "1001", reason: "remote" }),
      },
    );

    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        code: "TRANSACTION_CONNECTOR_MISMATCH",
        message: "Transaction does not belong to connector",
      },
    });
    expect(actor.stopTransactionInputs).toEqual([]);
  });

  test("validates authorize idTag", async () => {
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/authorize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idTag: "123456789012345678901" }),
      },
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).error.code).toBe(
      "VALIDATION_FAILED",
    );
  });

  test("rejects connector actions while the chargingPoint is not running", async () => {
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/plug`,
      { method: "POST" },
    );

    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        code: "CHARGING_POINT_NOT_RUNNING",
        message: "Charging point is not running",
      },
    });
  });

  test("maps rejected connector actor actions to conflict responses", async () => {
    const database = await createTestDatabase();
    const actor = createActorDouble({
      plugError: new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_INVALID_OPERATION",
        "枪口 1/1 当前不可插枪",
      ),
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
    const connector = await createConnector(app, chargingPoint.id, {
      evseId: 1,
      connectorId: 1,
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await app.request(
      `/api/charging-points/${chargingPoint.id}/connectors/${connector.id}/plug`,
      { method: "POST" },
    );

    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        code: "CONNECTOR_OPERATION_CONFLICT",
        message: "枪口 1/1 当前不可插枪",
      },
    });
  });

  test("starts a chargingPoint with identity appended to the centralSystemUrl", async () => {
    const database = await createTestDatabase();
    let actorCentralSystemUrl = "";
    const app = createApp({
      database,
      createChargingPointActor: (options) => {
        actorCentralSystemUrl = options.centralSystemUrl;
        return createActorDouble({
          id: options.id,
          startResult: {
            chargingPointId: options.id,
            chargingPointActorStatus: "running",
            bootStatus: "Accepted",
          },
        });
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(actorCentralSystemUrl).toBe("ws://localhost:9000/ocpp/CP001");
  });

  test("injects a runtime log sink when starting a chargingPoint", async () => {
    const database = await createTestDatabase();
    let actorOptions: ChargingPointActorOptions | undefined;
    const app = createApp({
      database,
      runtimeLogDirectory: "logs/runtime",
      createChargingPointActor: (options) => {
        actorOptions = options;
        return createActorDouble({
          id: options.id,
          startResult: {
            chargingPointId: options.id,
            chargingPointActorStatus: "running",
            bootStatus: "Accepted",
          },
        });
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(actorOptions?.runtimeLogSink).toBeDefined();
    expect(typeof actorOptions?.runtimeLogSink?.write).toBe("function");
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/start`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(runtimeOperationResponseSchema.parse(await response.json())).toEqual({
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
    expect(runtimeOperationResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "stopped",
    });
  });

  test("removes and disposes the actor when start fails", async () => {
    const database = await createTestDatabase();
    const actorHost = new ChargingPointActorHost();
    const actor = createActorDouble({ startError: new Error("boom") });
    const app = createApp({
      database,
      chargingPointActorHost: actorHost,
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
      type: "IEC_62196_T2",
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
    expect(actorHost.get(chargingPoint.id)).toBeUndefined();
    expect(actor.disposeCalls).toBe(1);
  });

  test("stops a running chargingPoint and removes its actor", async () => {
    const database = await createTestDatabase();
    const actorHost = new ChargingPointActorHost();
    const actor = createActorDouble();
    const app = createApp({
      database,
      chargingPointActorHost: actorHost,
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
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
    });
    await app.request(`/api/charging-points/${chargingPoint.id}/start`, { method: "POST" });

    const response = await app.request(`/api/charging-points/${chargingPoint.id}/stop`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(runtimeOperationResponseSchema.parse(await response.json())).toEqual({
      chargingPointId: chargingPoint.id,
      status: "stopped",
    });
    expect(actorHost.get(chargingPoint.id)).toBeUndefined();
    expect(actor.stopCalls).toBe(1);
    expect(actor.disposeCalls).toBe(1);
  });
});

async function createChargingPoint(
  app: ReturnType<typeof createApp>,
  input: Record<string, unknown>,
) {
  const requestInput = {
    name: typeof input.identity === "string" ? `调试桩 ${input.identity}` : "调试桩",
    ...input,
  };
  const response = await app.request("/api/charging-points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestInput),
  });

  expect(response.status).toBe(201);
  return chargingPointDetailResponseSchema.parse(await response.json());
}

async function createConnector(
  app: ReturnType<typeof createApp>,
  chargingPointId: string,
  input: Record<string, unknown>,
) {
  const requestInput = {
    maxVoltage: 230,
    maxCurrent: 32,
    ...input,
  };
  const response = await app.request(`/api/charging-points/${chargingPointId}/connectors`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestInput),
  });

  expect(response.status).toBe(201);
  return connectorResponseSchema.parse(await response.json());
}

function authorizeConnector(
  app: ReturnType<typeof createApp>,
  chargingPointId: string,
  connectorId: string,
  idTag: string,
) {
  return app.request(
    `/api/charging-points/${chargingPointId}/connectors/${connectorId}/authorize`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idTag }),
    },
  );
}

function startTransaction(
  app: ReturnType<typeof createApp>,
  chargingPointId: string,
  connectorId: string,
  idTag: string,
) {
  return app.request(
    `/api/charging-points/${chargingPointId}/connectors/${connectorId}/start-transaction`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idTag }),
    },
  );
}

function createActorDouble(
  overrides: Partial<{
    id: string;
    status: ChargingPointActorStatus;
    startResult: ChargingPointActorStartResult;
    stopResult: ChargingPointActorStopResult;
    startError: Error;
    stopError: Error;
    plugError: Error;
    unplugError: Error;
    authorizeResults: ChargingPointActorAuthorizeResult[];
    startTransactionResults: ChargingPointActorTransactionStartResult[];
    stopTransactionResults: ChargingPointActorStopTransactionResult[];
    transactionResources: Map<
      string,
      Extract<ChargingPointActorResourceRef, { scope: "transaction" }>
    >;
  }> = {},
) {
  const listeners = new Set<(event: ChargingPointActorEvent) => void | Promise<void>>();
  const plugInputs: ChargingPointActorConnectorActionInput[] = [];
  const unplugInputs: ChargingPointActorConnectorActionInput[] = [];
  const authorizeInputs: ChargingPointActorAuthorizeInput[] = [];
  const startTransactionInputs: ChargingPointActorStartTransactionInput[] = [];
  const stopTransactionInputs: ChargingPointActorStopTransactionInput[] = [];
  const authorizeResults = [...(overrides.authorizeResults ?? [])];
  const startTransactionResults = [...(overrides.startTransactionResults ?? [])];
  const stopTransactionResults = [...(overrides.stopTransactionResults ?? [])];
  const transactionResources = overrides.transactionResources ?? new Map();

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
    plugInputs,
    unplugInputs,
    authorizeInputs,
    startTransactionInputs,
    stopTransactionInputs,
    events: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    publish(event: ChargingPointActorEvent) {
      for (const listener of listeners) {
        void listener(event);
      }
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
    async plug(input: ChargingPointActorConnectorActionInput) {
      this.plugInputs.push(input);
      if (overrides.plugError !== undefined) {
        throw overrides.plugError;
      }

      return createConnectorActionResult(this.id, input, "plugged");
    },
    async unplug(input: ChargingPointActorConnectorActionInput) {
      this.unplugInputs.push(input);
      if (overrides.unplugError !== undefined) {
        throw overrides.unplugError;
      }

      return createConnectorActionResult(this.id, input, "unplugged");
    },
    async authorize(input: ChargingPointActorAuthorizeInput) {
      this.authorizeInputs.push(input);
      return authorizeResults.shift() ?? { status: "accepted" };
    },
    async startTransaction(input: ChargingPointActorStartTransactionInput) {
      this.startTransactionInputs.push(input);
      const result = startTransactionResults.shift() ?? {
        status: "accepted",
        transactionId: "1001",
      };
      if (result.status === "accepted") {
        transactionResources.set(result.transactionId, {
          scope: "transaction",
          evseId: input.evseId,
          connectorId: input.connectorId,
          transactionId: result.transactionId,
        });
      }

      return result;
    },
    getTransactionResource(transactionId: string) {
      return transactionResources.get(transactionId);
    },
    async reportMeterValue() {
      throw new Error("not implemented");
    },
    async stopTransaction(input: ChargingPointActorStopTransactionInput) {
      this.stopTransactionInputs.push(input);
      return stopTransactionResults.shift() ?? {
        status: "accepted",
        transactionId: input.transactionId,
        meterStopWh: input.meterStopWh ?? 0,
        stoppedAt: new Date("2026-07-01T00:00:00.000Z"),
      };
    },
  } satisfies ChargingPointActor & {
    id: string;
    status: ChargingPointActorStatus;
    startResult: ChargingPointActorStartResult;
    stopResult: ChargingPointActorStopResult;
    startCalls: number;
    stopCalls: number;
    disposeCalls: number;
    plugInputs: ChargingPointActorConnectorActionInput[];
    unplugInputs: ChargingPointActorConnectorActionInput[];
    authorizeInputs: ChargingPointActorAuthorizeInput[];
    startTransactionInputs: ChargingPointActorStartTransactionInput[];
    stopTransactionInputs: ChargingPointActorStopTransactionInput[];
    publish(event: ChargingPointActorEvent): void;
  };
}

function createConnectorActionResult(
  chargingPointId: string,
  input: ChargingPointActorConnectorActionInput,
  plugState: "plugged" | "unplugged",
): ChargingPointActorConnectorActionResult {
  return {
    chargingPointId,
    evseId: input.evseId,
    connectorId: input.connectorId,
    plugState,
    vehiclePresence: plugState === "plugged" ? "detected" : "absent",
    connectorStatus: plugState === "plugged" ? "occupied" : "available",
  };
}

function expectedRuntimeSnapshot(
  chargingPointId: string,
  status: "stopped" | "starting" | "running",
) {
  const runtimeStatus =
    status === "stopped"
      ? { chargingPointId, status }
      : {
          chargingPointId,
          status,
          bootStatus: status === "running" ? "Accepted" : "Pending",
        };

  return {
    chargingPointId,
    runtimeStatus,
    sessionStatus: null,
    chargingPointStatus: null,
    chargingPointAvailability: null,
    evseStatuses: [],
    connectorStatuses: [],
    connectorAvailabilities: [],
    transactionStatuses: [],
    lastHeartbeatAt: null,
    recentIssue: null,
  };
}

async function readNextSseEvent(response: Response) {
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  const event = await readSseEvent(reader!);
  await reader!.cancel();

  return event;
}

async function readSseEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const result = await reader.read();
  expect(result.done).toBe(false);
  const chunk = new TextDecoder().decode(result.value);
  const eventLine = chunk.split("\n").find((line) => line.startsWith("event: "));
  const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));

  expect(eventLine).toBeDefined();
  expect(dataLine).toBeDefined();

  return {
    event: eventLine!.slice("event: ".length),
    data: JSON.parse(dataLine!.slice("data: ".length)) as unknown,
  };
}
