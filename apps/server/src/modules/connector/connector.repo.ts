import type {
  CreateConnectorRequest,
  UpdateConnectorRequest,
} from "@spark-bee/contracts";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { ServerDatabase } from "../../db";
import { chargingPoints, connectors } from "../../db/schema";
import { AppError } from "../../utils/errors";

type ConnectorRow = typeof connectors.$inferSelect;

export class ConnectorRepository {
  constructor(private readonly db: ServerDatabase) {}

  async create(chargingPointId: string, input: CreateConnectorRequest) {
    await this.requireActiveChargingPoint(chargingPointId);
    await this.ensureConnectorNumbersAvailable(chargingPointId, input.evseId, input.connectorId);

    const [sortOrderRow] = await this.db
      .select({ maxSortOrder: sql<number>`coalesce(max(${connectors.sortOrder}), 0)` })
      .from(connectors)
      .where(and(eq(connectors.chargingPointId, chargingPointId), isNull(connectors.deletedAt)));

    const [row] = await this.db
      .insert(connectors)
      .values({
        ...input,
        chargingPointId,
        maxVoltage: input.maxVoltage ?? null,
        maxCurrent: input.maxCurrent ?? null,
        maxPower: input.maxPower ?? null,
        sortOrder: (sortOrderRow?.maxSortOrder ?? 0) + 1,
      })
      .returning();

    if (row === undefined) {
      throw new AppError(500, "INTERNAL_SERVER_ERROR", "Internal server error");
    }

    return this.toConnector(row);
  }

  async list(chargingPointId: string) {
    await this.requireActiveChargingPoint(chargingPointId);
    return (await this.listActiveConnectors(chargingPointId)).map((connector) =>
      this.toConnector(connector)
    );
  }

  async get(chargingPointId: string, connectorId: string) {
    await this.requireActiveChargingPoint(chargingPointId);
    const connector = await this.requireActiveConnector(chargingPointId, connectorId);
    return this.toConnector(connector);
  }

  async update(
    chargingPointId: string,
    connectorId: string,
    input: UpdateConnectorRequest,
  ) {
    await this.requireActiveChargingPoint(chargingPointId);
    const existing = await this.requireActiveConnector(chargingPointId, connectorId);
    const values: Partial<typeof connectors.$inferInsert> = {
      evseId: input.evseId,
      connectorId: input.connectorId,
      type: input.type,
      format: input.format,
      powerType: input.powerType,
      updatedAt: sql`now()` as unknown as Date,
    };

    if ("maxVoltage" in input) {
      values.maxVoltage = input.maxVoltage ?? null;
    }

    if ("maxCurrent" in input) {
      values.maxCurrent = input.maxCurrent ?? null;
    }

    if ("maxPower" in input) {
      values.maxPower = input.maxPower ?? null;
    }

    await this.ensureConnectorNumbersAvailable(
      chargingPointId,
      input.evseId ?? existing.evseId,
      input.connectorId ?? existing.connectorId,
      connectorId,
    );

    const [row] = await this.db
      .update(connectors)
      .set(values)
      .where(
        and(
          eq(connectors.id, connectorId),
          eq(connectors.chargingPointId, chargingPointId),
          isNull(connectors.deletedAt),
        ),
      )
      .returning();

    if (row === undefined) {
      throw new AppError(404, "CONNECTOR_NOT_FOUND", "Connector not found");
    }

    return this.toConnector(row);
  }

  async softDelete(chargingPointId: string, connectorId: string) {
    await this.requireActiveChargingPoint(chargingPointId);
    await this.requireActiveConnector(chargingPointId, connectorId);

    await this.db
      .update(connectors)
      .set({
        deletedAt: sql`now()` as unknown as Date,
        updatedAt: sql`now()` as unknown as Date,
      })
      .where(
        and(
          eq(connectors.id, connectorId),
          eq(connectors.chargingPointId, chargingPointId),
          isNull(connectors.deletedAt),
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

  private async requireActiveConnector(
    chargingPointId: string,
    connectorId: string,
  ): Promise<ConnectorRow> {
    const [row] = await this.db
      .select()
      .from(connectors)
      .where(
        and(
          eq(connectors.id, connectorId),
          eq(connectors.chargingPointId, chargingPointId),
          isNull(connectors.deletedAt),
        ),
      )
      .limit(1);

    if (row === undefined) {
      throw new AppError(404, "CONNECTOR_NOT_FOUND", "Connector not found");
    }

    return row;
  }

  private async ensureConnectorNumbersAvailable(
    chargingPointId: string,
    evseId: number,
    connectorId: number,
    excludingId?: string,
  ): Promise<void> {
    const activeConnectors = await this.listActiveConnectors(chargingPointId);
    const conflictingEvse = activeConnectors.some((connector) =>
      connector.evseId === evseId && connector.id !== excludingId
    );
    if (conflictingEvse) {
      throw new AppError(409, "CONNECTOR_CONFLICT", "EVSE ID already exists");
    }

    const conflictingConnector = activeConnectors.some((connector) =>
      connector.connectorId === connectorId && connector.id !== excludingId
    );
    if (conflictingConnector) {
      throw new AppError(409, "CONNECTOR_CONFLICT", "Connector ID already exists");
    }
  }

  private toConnector(connector: ConnectorRow) {
    return {
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
    };
  }
}
