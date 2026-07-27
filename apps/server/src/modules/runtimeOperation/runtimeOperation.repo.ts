import type {
  ChargingPointDetailResponse,
  ChargingPointRunningIntent,
} from "@spark-bee/contracts";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { ServerDatabase } from "../../db";
import { chargingPoints, connectors } from "../../db/schema";
import { AppError } from "../../utils/errors";
import { toConnectorType } from "../connector/connectorType";

type ChargingPointRow = typeof chargingPoints.$inferSelect;
type ConnectorRow = typeof connectors.$inferSelect;
export type RuntimeOperationDetail = ChargingPointDetailResponse & {
  runningIntent: ChargingPointRunningIntent;
};

export class RuntimeOperationRepository {
  constructor(private readonly db: ServerDatabase) {}

  async getOperationDetail(id: string): Promise<RuntimeOperationDetail> {
    const [chargingPoint] = await this.db
      .select()
      .from(chargingPoints)
      .where(and(eq(chargingPoints.id, id), isNull(chargingPoints.deletedAt)))
      .limit(1);

    if (chargingPoint === undefined) {
      throw new AppError(404, "CHARGING_POINT_NOT_FOUND", "Charging point not found");
    }

    const connectorRows = await this.db
      .select()
      .from(connectors)
      .where(and(eq(connectors.chargingPointId, id), isNull(connectors.deletedAt)))
      .orderBy(asc(connectors.sortOrder), asc(connectors.createdAt));

    return this.toDetail(chargingPoint, connectorRows);
  }

  async setRunningIntent(
    id: string,
    runningIntent: ChargingPointRunningIntent,
  ): Promise<void> {
    const [row] = await this.db
      .update(chargingPoints)
      .set({
        runningIntent,
        updatedAt: sql`now()` as unknown as Date,
      })
      .where(and(eq(chargingPoints.id, id), isNull(chargingPoints.deletedAt)))
      .returning();

    if (row === undefined) {
      throw new AppError(404, "CHARGING_POINT_NOT_FOUND", "Charging point not found");
    }
  }

  async listRunningChargingPointIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: chargingPoints.id })
      .from(chargingPoints)
      .where(and(
        eq(chargingPoints.runningIntent, "running"),
        isNull(chargingPoints.deletedAt),
      ))
      .orderBy(asc(chargingPoints.createdAt), asc(chargingPoints.id));
    return rows.map((row) => row.id);
  }

  private toDetail(
    row: ChargingPointRow,
    connectorRows: ConnectorRow[],
  ): RuntimeOperationDetail {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      identity: row.identity,
      protocol: row.protocol,
      runningIntent: row.runningIntent,
      centralSystemUrl: row.centralSystemUrl,
      vendor: row.vendor,
      model: row.model,
      firmwareVersion: row.firmwareVersion,
      serialNumber: row.serialNumber,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      connectors: connectorRows.map((connector) => ({
        id: connector.id,
        chargingPointId: connector.chargingPointId,
        evseId: connector.evseId,
        connectorId: connector.connectorId,
        type: toConnectorType(connector.type),
        format: connector.format,
        powerType: connector.powerType,
        maxVoltage: connector.maxVoltage,
        maxCurrent: connector.maxCurrent,
        maxPower: connector.maxPower,
        sortOrder: connector.sortOrder,
        createdAt: connector.createdAt.toISOString(),
        updatedAt: connector.updatedAt.toISOString(),
      })),
    };
  }
}
