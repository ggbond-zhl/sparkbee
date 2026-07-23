import { describe, expect, test } from "vitest";

import { chargingPoints } from "../../src/db/schema";
import { ProtocolConfigurationRepository } from "../../src/modules/protocolConfiguration/protocolConfiguration.repo";
import { createTestDatabase } from "../support/testDatabase";

describe("ProtocolConfigurationRepository", () => {
  test("幂等补齐历史桩实例的完整协议配置目录", async () => {
    const database = await createTestDatabase();
    const [chargingPoint] = await database.insert(chargingPoints).values({
      name: "历史桩",
      identity: "LEGACY-CP",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "LegacyBox",
    }).returning();
    expect(chargingPoint).toBeDefined();
    const repository = new ProtocolConfigurationRepository(database);

    await repository.initializeMissingDirectories();
    await repository.initializeMissingDirectories();

    const directory = await repository.list(chargingPoint!.id);
    expect(directory.items).toHaveLength(45);
    expect(directory.items.every((item) => item.version === 1)).toBe(true);
  });

  test("成功启动后清除待重启标记并递增版本", async () => {
    const database = await createTestDatabase();
    const [chargingPoint] = await database.insert(chargingPoints).values({
      name: "待重启桩",
      identity: "PENDING-RESTART-CP",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
    }).returning();
    const repository = new ProtocolConfigurationRepository(database);
    await repository.initializeDirectory(chargingPoint!.id, "OCPP16J");
    const persistence = repository.forChargingPoint(chargingPoint!.id, "OCPP16J");
    await persistence.save({
      key: "WebSocketPingInterval",
      value: "30",
      source: "ui",
      pendingRestart: true,
      expectedVersion: 1,
      updatedAt: new Date("2026-07-22T08:00:00.000Z"),
    });

    await expect(persistence.markApplied?.(
      new Date("2026-07-22T09:00:00.000Z"),
    )).resolves.toEqual([
      expect.objectContaining({
        key: "WebSocketPingInterval",
        value: "30",
        version: 3,
        pendingRestart: false,
        lastModifiedBy: "ui",
      }),
    ]);
  });
});
