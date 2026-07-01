import type { ChargingPointDetailResponse } from "@spark-bee/contracts";
import { and, asc, eq, isNull } from "drizzle-orm";

import type { ServerDatabase } from "../../db";
import { chargingPoints, connectors } from "../../db/schema";
import { AppError } from "../../utils/errors";

type ChargingPointRow = typeof chargingPoints.$inferSelect;
type ConnectorRow = typeof connectors.$inferSelect;

export class RuntimeOperationRepository {
  constructor(private readonly db: ServerDatabase) {}

  async getOperationDetail(id: string): Promise<ChargingPointDetailResponse> {
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

  private toDetail(
    row: ChargingPointRow,
    connectorRows: ConnectorRow[],
  ): ChargingPointDetailResponse {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      identity: row.identity,
      protocol: row.protocol,
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
        type: connector.type,
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
