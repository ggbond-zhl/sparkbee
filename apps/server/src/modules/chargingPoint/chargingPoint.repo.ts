import type {
  CreateChargingPointRequest,
  ListChargingPointsQuery,
  UpdateChargingPointRequest,
} from "@spark-bee/contracts";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import type { ServerDatabase } from "../../db";
import {
  chargingPoints,
  chargingTransactions,
  connectors,
} from "../../db/schema";
import { ActorLogRepository } from "../actorLog/actorLog.repo";
import {
  HistoricalObservationEventRepository,
  ProtocolMessageRepository,
} from "../protocolObservation/protocolObservation.repo";
import { AppError } from "../../utils/errors";
import { toConnectorType } from "../connector/connectorType";
import { normalizeCentralSystemUrl } from "./centralSystemUrl";

type ChargingPointRow = typeof chargingPoints.$inferSelect;
type ConnectorRow = typeof connectors.$inferSelect;

export class ChargingPointRepository {
  constructor(private readonly db: ServerDatabase) {}

  async create(input: CreateChargingPointRequest) {
    const [row] = await this.db
      .insert(chargingPoints)
      .values({
        ...input,
        centralSystemUrl: normalizeCentralSystemUrl(input.centralSystemUrl),
        description: input.description ?? null,
        firmwareVersion: input.firmwareVersion ?? null,
        serialNumber: input.serialNumber ?? null,
      })
      .returning();

    if (row === undefined) {
      throw new AppError(500, "INTERNAL_SERVER_ERROR", "Internal server error");
    }

    return this.toDetail(row, []);
  }

  async list(query: ListChargingPointsQuery) {
    const page = query.page;
    const pageSize = query.pageSize;
    const where = this.createListWhere(query.keyword);

    const rows = await this.db
      .select({
        chargingPoint: chargingPoints,
        connectorCount: count(connectors.id),
      })
      .from(chargingPoints)
      .leftJoin(
        connectors,
        and(
          eq(connectors.chargingPointId, chargingPoints.id),
          isNull(connectors.deletedAt),
        ),
      )
      .where(where)
      .groupBy(chargingPoints.id)
      .orderBy(desc(chargingPoints.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(chargingPoints)
      .where(where);

    return {
      items: rows.map((row) => this.toSummary(row.chargingPoint, row.connectorCount)),
      page,
      pageSize,
      total: totalRow?.total ?? 0,
    };
  }

  async getById(id: string) {
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

  async update(id: string, input: UpdateChargingPointRequest) {
    await this.requireActiveChargingPoint(id);

    const values: Partial<typeof chargingPoints.$inferInsert> = {
      ...input,
      updatedAt: sql`now()` as unknown as Date,
    };

    if (input.centralSystemUrl !== undefined) {
      values.centralSystemUrl = normalizeCentralSystemUrl(input.centralSystemUrl);
    }

    if ("description" in input) {
      values.description = input.description ?? null;
    }

    if ("firmwareVersion" in input) {
      values.firmwareVersion = input.firmwareVersion ?? null;
    }

    if ("serialNumber" in input) {
      values.serialNumber = input.serialNumber ?? null;
    }

    const [row] = await this.db
      .update(chargingPoints)
      .set(values)
      .where(and(eq(chargingPoints.id, id), isNull(chargingPoints.deletedAt)))
      .returning();

    if (row === undefined) {
      throw new AppError(404, "CHARGING_POINT_NOT_FOUND", "Charging point not found");
    }

    const connectorRows = await this.listActiveConnectors(id);
    return this.toDetail(row, connectorRows);
  }

  async softDelete(id: string) {
    await this.requireActiveChargingPoint(id);

    await this.db.transaction(async (transaction) => {
      await new ActorLogRepository(transaction as ServerDatabase).deleteForChargingPoint(id);
      await new ProtocolMessageRepository(
        transaction as ServerDatabase,
      ).deleteForChargingPoint(id);
      await new HistoricalObservationEventRepository(
        transaction as ServerDatabase,
      ).deleteForChargingPoint(id);
      await transaction
        .delete(chargingTransactions)
        .where(eq(chargingTransactions.chargingPointId, id));
      await transaction
        .update(chargingPoints)
        .set({
          deletedAt: sql`now()` as unknown as Date,
          updatedAt: sql`now()` as unknown as Date,
        })
        .where(and(eq(chargingPoints.id, id), isNull(chargingPoints.deletedAt)));

      await transaction
        .update(connectors)
        .set({
          deletedAt: sql`now()` as unknown as Date,
          updatedAt: sql`now()` as unknown as Date,
        })
        .where(and(eq(connectors.chargingPointId, id), isNull(connectors.deletedAt)));
    });
  }

  private createListWhere(keyword: string | undefined) {
    const base = isNull(chargingPoints.deletedAt);
    const normalizedKeyword = keyword?.trim();
    if (!normalizedKeyword) {
      return base;
    }

    const pattern = `%${normalizedKeyword}%`;
    return and(
      base,
      or(
        ilike(chargingPoints.name, pattern),
        ilike(chargingPoints.identity, pattern),
        ilike(chargingPoints.vendor, pattern),
        ilike(chargingPoints.model, pattern),
      ),
    );
  }

  private async requireActiveChargingPoint(id: string): Promise<void> {
    const [row] = await this.db
      .select({ id: chargingPoints.id })
      .from(chargingPoints)
      .where(and(eq(chargingPoints.id, id), isNull(chargingPoints.deletedAt)))
      .limit(1);

    if (row === undefined) {
      throw new AppError(404, "CHARGING_POINT_NOT_FOUND", "Charging point not found");
    }
  }

  private async listActiveConnectors(chargingPointId: string): Promise<ConnectorRow[]> {
    return this.db
      .select()
      .from(connectors)
      .where(and(eq(connectors.chargingPointId, chargingPointId), isNull(connectors.deletedAt)))
      .orderBy(asc(connectors.sortOrder), asc(connectors.createdAt));
  }

  private toSummary(row: ChargingPointRow, connectorCount: number) {
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
      connectorCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: ChargingPointRow, connectorRows: ConnectorRow[]) {
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
      connectors: connectorRows.map((connector) => this.toConnector(connector)),
    };
  }

  private toConnector(connector: ConnectorRow) {
    return {
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
    };
  }
}
