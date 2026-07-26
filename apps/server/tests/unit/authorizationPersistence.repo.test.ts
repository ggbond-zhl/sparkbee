import { describe, expect, test } from "vitest";

import { schema } from "../../src/db";
import { AuthorizationRepository } from "../../src/modules/authorization/authorization.repo";
import { createTestDatabase } from "../support/testDatabase";

const chargingPointId = "00000000-0000-4000-8000-000000000001";

describe("本地授权持久化", () => {
  test("原子替换 Local Authorization List 并跨 repository 重建恢复", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const store = new AuthorizationRepository(database)
      .forChargingPoint(chargingPointId, "OCPP16J");
    await expect(store.load()).resolves.toEqual({
      localList: null,
      cacheEntries: [],
    });

    await store.replaceLocalList({
      version: 1,
      source: "ocpp16",
      updatedAt: new Date("2026-07-24T01:00:00.000Z"),
      entries: [
        {
          credentialId: "TAG-A",
          status: "accepted",
          validUntil: new Date("2026-08-01T00:00:00.000Z"),
          groupCredentialId: "PARENT-A",
        },
        {
          credentialId: "TAG-B",
          status: "blocked",
          validUntil: null,
          groupCredentialId: null,
        },
      ],
    });
    await store.replaceLocalList({
      version: 2,
      source: "ocpp16",
      updatedAt: new Date("2026-07-24T02:00:00.000Z"),
      entries: [
        {
          credentialId: "TAG-A",
          status: "invalid",
          validUntil: null,
          groupCredentialId: null,
        },
        {
          credentialId: "TAG-C",
          status: "accepted",
          validUntil: null,
          groupCredentialId: null,
        },
      ],
    });

    const recreatedStore = new AuthorizationRepository(database)
      .forChargingPoint(chargingPointId, "OCPP16J");
    await expect(recreatedStore.load()).resolves.toEqual({
      localList: {
        version: 2,
        source: "ocpp16",
        updatedAt: new Date("2026-07-24T02:00:00.000Z"),
        entries: [
          {
            credentialId: "TAG-A",
            status: "invalid",
            validUntil: null,
            groupCredentialId: null,
          },
          {
            credentialId: "TAG-C",
            status: "accepted",
            validUntil: null,
            groupCredentialId: null,
          },
        ],
      },
      cacheEntries: [],
    });
  });

  test("列表条目写入失败时保留原版本和原条目", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const store = new AuthorizationRepository(database)
      .forChargingPoint(chargingPointId, "OCPP16J");
    await store.replaceLocalList({
      version: 1,
      source: "ocpp16",
      updatedAt: new Date("2026-07-24T01:00:00.000Z"),
      entries: [{
        credentialId: "TAG-A",
        status: "accepted",
        validUntil: null,
        groupCredentialId: null,
      }],
    });

    await expect(store.replaceLocalList({
      version: 2,
      source: "ocpp16",
      updatedAt: new Date("2026-07-24T02:00:00.000Z"),
      entries: [
        {
          credentialId: "TAG-DUPLICATE",
          status: "accepted",
          validUntil: null,
          groupCredentialId: null,
        },
        {
          credentialId: "TAG-DUPLICATE",
          status: "blocked",
          validUntil: null,
          groupCredentialId: null,
        },
      ],
    })).rejects.toThrow();
    await expect(store.load()).resolves.toMatchObject({
      localList: {
        version: 1,
        entries: [expect.objectContaining({ credentialId: "TAG-A" })],
      },
    });
  });

  test("写穿更新并持久清空 Authorization Cache", async () => {
    const database = await createTestDatabase();
    await database.insert(schema.chargingPoints).values({
      id: chargingPointId,
      name: "调试桩",
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    });
    const store = new AuthorizationRepository(database)
      .forChargingPoint(chargingPointId, "OCPP16J");
    await store.upsertCacheEntry({
      credentialId: "TAG-A",
      evseId: 1,
      status: "accepted",
      validUntil: new Date("2026-08-01T00:00:00.000Z"),
      groupCredentialId: "PARENT-A",
      lastEvaluatedAt: new Date("2026-07-24T01:00:00.000Z"),
    });
    await store.upsertCacheEntry({
      credentialId: "TAG-A",
      evseId: 2,
      status: "invalid",
      validUntil: null,
      groupCredentialId: null,
      lastEvaluatedAt: new Date("2026-07-24T01:01:00.000Z"),
    });
    await store.upsertCacheEntry({
      credentialId: "TAG-A",
      evseId: 1,
      status: "blocked",
      validUntil: null,
      groupCredentialId: null,
      lastEvaluatedAt: new Date("2026-07-24T02:00:00.000Z"),
    });

    const recreatedStore = new AuthorizationRepository(database)
      .forChargingPoint(chargingPointId, "OCPP16J");
    await expect(recreatedStore.load()).resolves.toEqual({
      localList: null,
      cacheEntries: [
        {
          credentialId: "TAG-A",
          evseId: 1,
          status: "blocked",
          validUntil: null,
          groupCredentialId: null,
          lastEvaluatedAt: new Date("2026-07-24T02:00:00.000Z"),
        },
        {
          credentialId: "TAG-A",
          evseId: 2,
          status: "invalid",
          validUntil: null,
          groupCredentialId: null,
          lastEvaluatedAt: new Date("2026-07-24T01:01:00.000Z"),
        },
      ],
    });

    await recreatedStore.clearCache();
    await expect(store.load()).resolves.toEqual({
      localList: null,
      cacheEntries: [],
    });
  });
});
