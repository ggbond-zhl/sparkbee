import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, test } from "vitest";

import * as schema from "../../src/db/schema";
import { connectorSnapshots, transactions } from "../../src/db/schema";
import { PostgresEventRepository } from "../../src/repositories/postgres-event.repository";
import { PostgresChargingPointRepository } from "../../src/repositories/postgres-charging-point.repository";
import { PostgresTransactionRepository } from "../../src/repositories/postgres-transaction.repository";

const migrationsFolder = fileURLToPath(new URL("../../src/db/migrations", import.meta.url));

const clients: PGlite[] = [];

async function createTestDatabase() {
  const client = new PGlite();
  clients.push(client);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

const stationInput = {
  name: "测试桩",
  csmsBaseUrl: "ws://localhost:9000/ocpp",
  identity: "CP-001",
  vendor: "SparkBee",
  model: "BeeBox",
  connectorCount: 2,
  connectorMaxPowerW: 7000
};

describe("Postgres repositories", () => {
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  test("station repository creates and reads stations through migrated schema", async () => {
    const db = await createTestDatabase();
    const stations = new PostgresChargingPointRepository(db);

    const station = await stations.create(stationInput);

    await expect(stations.findById(station.id)).resolves.toMatchObject({
      id: station.id,
      name: "测试桩",
      desiredStatus: "stopped",
      runtimeStatus: "stopped"
    });
  });

  test("station identity stays unique in the database", async () => {
    const db = await createTestDatabase();
    const stations = new PostgresChargingPointRepository(db);

    await stations.create(stationInput);

    await expect(stations.create({ ...stationInput, name: "重复桩" })).rejects.toThrow();
  });

  test("deleting a station cascades connector snapshots", async () => {
    const db = await createTestDatabase();
    const stations = new PostgresChargingPointRepository(db);
    const station = await stations.create(stationInput);

    await stations.upsertConnectorSnapshot(station.id, {
      connectorId: 1,
      status: "occupied",
      plugState: "plugged",
      vehiclePresence: "detected"
    });
    await stations.delete(station.id);

    const snapshots = await db
      .select()
      .from(connectorSnapshots)
      .where(eq(connectorSnapshots.stationId, station.id));
    expect(snapshots).toEqual([]);
  });

  test("event repository paginates by cursor and trims old station events", async () => {
    const db = await createTestDatabase();
    const stations = new PostgresChargingPointRepository(db);
    const events = new PostgresEventRepository(db);
    const station = await stations.create(stationInput);

    const first = await events.append({
      stationId: station.id,
      type: "chargingPointSimulator.status",
      payload: { currentStatus: "starting" },
      occurredAt: new Date("2026-01-01T00:00:00.000Z")
    });
    await events.append({
      stationId: station.id,
      type: "connector.status",
      payload: { connectorId: 1 },
      occurredAt: new Date("2026-01-01T00:01:00.000Z")
    });
    await events.append({
      stationId: station.id,
      type: "transaction.status",
      payload: { transactionId: "tx-1" },
      occurredAt: new Date("2026-01-01T00:02:00.000Z")
    });

    await expect(events.listByChargingPoint(station.id, { after: first.id, limit: 10 })).resolves.toEqual([
      expect.objectContaining({ type: "connector.status" }),
      expect.objectContaining({ type: "transaction.status" })
    ]);

    await events.trimChargingPointEvents(station.id, 2);

    await expect(events.listByChargingPoint(station.id, { limit: 10 })).resolves.toEqual([
      expect.objectContaining({ type: "connector.status" }),
      expect.objectContaining({ type: "transaction.status" })
    ]);
  });

  test("transaction repository records active and ended transaction states", async () => {
    const db = await createTestDatabase();
    const stations = new PostgresChargingPointRepository(db);
    const transactionRepository = new PostgresTransactionRepository(db);
    const station = await stations.create(stationInput);

    await transactionRepository.create({
      stationId: station.id,
      simulatorTransactionId: "tx-1",
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 1000
    });
    await transactionRepository.markEnded({
      simulatorTransactionId: "tx-1",
      meterStopWh: 1300,
      stoppedAt: new Date("2026-01-01T00:01:00.000Z")
    });

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.simulatorTransactionId, "tx-1"));
    expect(transaction).toMatchObject({
      stationId: station.id,
      connectorId: 1,
      status: "ended",
      meterStartWh: 1000,
      meterStopWh: 1300,
      stoppedAt: new Date("2026-01-01T00:01:00.000Z")
    });
  });
});
