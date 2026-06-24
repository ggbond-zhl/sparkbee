import { and, eq } from "drizzle-orm";

import type { Database } from "../db";
import { connectorSnapshots, stations } from "../db/schema";
import { notFound } from "../utils/errors";
import type {
  ConnectorSnapshotRecord,
  CreateStationInput,
  StationRecord,
  StationRepository,
  StationRuntimeStatus,
  UpdateStationInput,
  UpsertConnectorSnapshotInput
} from "./station.repository";

function toStationRecord(row: typeof stations.$inferSelect): StationRecord {
  return {
    id: row.id,
    name: row.name,
    protocol: "OCPP16J",
    csmsBaseUrl: row.csmsBaseUrl,
    identity: row.identity,
    vendor: row.vendor,
    model: row.model,
    connectorCount: row.connectorCount,
    connectorMaxPowerW: row.connectorMaxPowerW,
    desiredStatus: row.desiredStatus,
    runtimeStatus: row.runtimeStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class PostgresStationRepository implements StationRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateStationInput): Promise<StationRecord> {
    const [row] = await this.db
      .insert(stations)
      .values({
        ...input,
        protocol: "OCPP16J",
        desiredStatus: "stopped",
        runtimeStatus: "stopped"
      })
      .returning();

    return toStationRecord(row!);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(stations).where(eq(stations.id, id));
  }

  async findById(id: string): Promise<StationRecord | null> {
    const [row] = await this.db.select().from(stations).where(eq(stations.id, id)).limit(1);
    return row === undefined ? null : toStationRecord(row);
  }

  async list(): Promise<StationRecord[]> {
    const rows = await this.db.select().from(stations);
    return rows.map(toStationRecord);
  }

  async listByDesiredStatus(status: "running" | "stopped"): Promise<StationRecord[]> {
    const rows = await this.db.select().from(stations).where(eq(stations.desiredStatus, status));
    return rows.map(toStationRecord);
  }

  async listConnectorSnapshots(stationId: string): Promise<ConnectorSnapshotRecord[]> {
    const rows = await this.db
      .select()
      .from(connectorSnapshots)
      .where(eq(connectorSnapshots.stationId, stationId));

    return rows.map((row) => ({
      connectorId: row.connectorId,
      status: row.status,
      plugState: row.plugState,
      vehiclePresence: row.vehiclePresence,
      updatedAt: row.updatedAt
    }));
  }

  async update(id: string, input: UpdateStationInput): Promise<StationRecord> {
    const [row] = await this.db
      .update(stations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(stations.id, id))
      .returning();

    if (row === undefined) {
      throw notFound(`桩实例 ${id} 不存在`);
    }

    return toStationRecord(row);
  }

  async updateDesiredStatus(id: string, status: "running" | "stopped"): Promise<void> {
    await this.db
      .update(stations)
      .set({ desiredStatus: status, updatedAt: new Date() })
      .where(eq(stations.id, id));
  }

  async updateRuntimeStatus(id: string, status: StationRuntimeStatus): Promise<void> {
    await this.db
      .update(stations)
      .set({ runtimeStatus: status, updatedAt: new Date() })
      .where(eq(stations.id, id));
  }

  async upsertConnectorSnapshot(
    stationId: string,
    input: UpsertConnectorSnapshotInput,
  ): Promise<void> {
    const existing = await this.db
      .select({ id: connectorSnapshots.id })
      .from(connectorSnapshots)
      .where(
        and(
          eq(connectorSnapshots.stationId, stationId),
          eq(connectorSnapshots.connectorId, input.connectorId),
        ),
      )
      .limit(1);

    const values = {
      plugState: input.plugState ?? "unplugged",
      status: input.status,
      vehiclePresence: input.vehiclePresence ?? "absent",
      updatedAt: new Date()
    };

    if (existing[0] === undefined) {
      await this.db.insert(connectorSnapshots).values({
        stationId,
        connectorId: input.connectorId,
        ...values
      });
      return;
    }

    await this.db
      .update(connectorSnapshots)
      .set(values)
      .where(eq(connectorSnapshots.id, existing[0].id));
  }
}
