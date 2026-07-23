import {
  configurationDefinitions,
  type ConfigurationDefinition,
  type ChargingPointActorConfigurationEntry,
  type ChargingPointActorConfigurationPersistence,
} from "../../lib/chargingPointActor";
import type {
  ProtocolConfigurationItem,
  UpdateProtocolConfigurationRequest,
} from "@spark-bee/contracts";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { ServerDatabase } from "../../db";
import { chargingPoints, protocolConfigurations } from "../../db/schema";
import { AppError } from "../../utils/errors";

type Protocol = "OCPP16J";
type ConfigurationSource = ChargingPointActorConfigurationEntry["lastModifiedBy"];

interface PersistConfigurationInput {
  key: string;
  value: string;
  source: ConfigurationSource;
  pendingRestart: boolean;
  updatedAt: Date;
  expectedVersion?: number;
}

export class ProtocolConfigurationRepository {
  constructor(private readonly db: ServerDatabase) {}

  async initializeDirectory(chargingPointId: string, protocol: Protocol) {
    await this.db
      .insert(protocolConfigurations)
      .values(configurationDefinitions.map((definition) => ({
        chargingPointId,
        protocol,
        key: definition.key,
        value: definition.defaultValue,
      })))
      .onConflictDoNothing();
  }

  async initializeMissingDirectories(): Promise<void> {
    const rows = await this.db
      .select({ id: chargingPoints.id, protocol: chargingPoints.protocol })
      .from(chargingPoints)
      .where(isNull(chargingPoints.deletedAt));

    for (const row of rows) {
      await this.initializeDirectory(row.id, row.protocol);
    }
  }

  async list(chargingPointId: string) {
    const protocol = await this.getProtocol(chargingPointId);

    const rows = await this.db
      .select()
      .from(protocolConfigurations)
      .where(and(
        eq(protocolConfigurations.chargingPointId, chargingPointId),
        eq(protocolConfigurations.protocol, protocol),
      ));
    const rowsByKey = new Map(rows.map((row) => [row.key, row]));

    return {
      chargingPointId,
      protocol,
      items: configurationDefinitions.flatMap((definition) => {
        const row = rowsByKey.get(definition.key);
        return row === undefined ? [] : [toProtocolConfigurationItem(definition, row)];
      }),
    };
  }

  async changeWhileStopped(
    chargingPointId: string,
    key: string,
    input: UpdateProtocolConfigurationRequest,
  ): Promise<{
    status: "accepted" | "reboot-required";
    protocol: Protocol;
    entry: ChargingPointActorConfigurationEntry;
  }> {
    const protocol = await this.getProtocol(chargingPointId);
    const definition = requireDefinition(key);
    if (definition.readonly ?? definition.access === "R") {
      throw new AppError(
        422,
        "PROTOCOL_CONFIGURATION_READONLY",
        "Protocol configuration is readonly",
      );
    }

    const value = normalizeValue(definition, input.value);
    const pendingRestart = definition.rebootRequired ?? false;
    const entry = await this.persist(chargingPointId, protocol, {
      key,
      value,
      source: "ui",
      pendingRestart,
      updatedAt: new Date(),
      expectedVersion: input.expectedVersion,
    });
    return {
      status: pendingRestart ? "reboot-required" : "accepted",
      protocol,
      entry,
    };
  }

  async loadCatalog(chargingPointId: string) {
    const directory = await this.list(chargingPointId);
    return {
      chargingPointId,
      protocolVersion: directory.protocol,
      entries: directory.items.map((item) => ({
        key: item.key,
        value: item.value,
        readonly: item.readonly,
        valueType: item.valueType,
        rebootRequired: item.rebootRequired,
        minValue: item.minValue ?? undefined,
        maxValue: item.maxValue ?? undefined,
        updatedAt: new Date(item.updatedAt),
      })),
    };
  }

  forChargingPoint(
    chargingPointId: string,
    protocol: Protocol,
  ): ChargingPointActorConfigurationPersistence {
    return {
      save: (input) => this.persist(chargingPointId, protocol, input),
      markApplied: (updatedAt) =>
        this.markApplied(chargingPointId, protocol, updatedAt),
    };
  }

  describeEntry(entry: ChargingPointActorConfigurationEntry): ProtocolConfigurationItem {
    return toProtocolConfigurationItem(requireDefinition(entry.key), entry);
  }

  private async persist(
    chargingPointId: string,
    protocol: Protocol,
    input: PersistConfigurationInput,
  ): Promise<ChargingPointActorConfigurationEntry> {
    const where = and(
      eq(protocolConfigurations.chargingPointId, chargingPointId),
      eq(protocolConfigurations.protocol, protocol),
      eq(protocolConfigurations.key, input.key),
      input.expectedVersion === undefined
        ? undefined
        : eq(protocolConfigurations.version, input.expectedVersion),
    );
    const [row] = await this.db
      .update(protocolConfigurations)
      .set({
        value: input.value,
        version: sql`${protocolConfigurations.version} + 1`,
        pendingRestart: input.pendingRestart,
        lastModifiedBy: input.source,
        updatedAt: input.updatedAt,
      })
      .where(where)
      .returning();

    if (row !== undefined) {
      return toPersistedEntry(row);
    }

    const [existing] = await this.db
      .select({ version: protocolConfigurations.version })
      .from(protocolConfigurations)
      .where(and(
        eq(protocolConfigurations.chargingPointId, chargingPointId),
        eq(protocolConfigurations.protocol, protocol),
        eq(protocolConfigurations.key, input.key),
      ))
      .limit(1);
    if (existing === undefined) {
      throw new AppError(
        404,
        "PROTOCOL_CONFIGURATION_NOT_FOUND",
        "Protocol configuration not found",
      );
    }

    throw new AppError(
      409,
      "PROTOCOL_CONFIGURATION_VERSION_CONFLICT",
      "Protocol configuration version conflict",
    );
  }

  private async markApplied(
    chargingPointId: string,
    protocol: Protocol,
    updatedAt: Date,
  ): Promise<ChargingPointActorConfigurationEntry[]> {
    const rows = await this.db
      .update(protocolConfigurations)
      .set({
        version: sql`${protocolConfigurations.version} + 1`,
        pendingRestart: false,
        updatedAt,
      })
      .where(and(
        eq(protocolConfigurations.chargingPointId, chargingPointId),
        eq(protocolConfigurations.protocol, protocol),
        eq(protocolConfigurations.pendingRestart, true),
      ))
      .returning();
    return rows.map(toPersistedEntry);
  }

  private async getProtocol(chargingPointId: string): Promise<Protocol> {
    const [chargingPoint] = await this.db
      .select({ protocol: chargingPoints.protocol })
      .from(chargingPoints)
      .where(and(
        eq(chargingPoints.id, chargingPointId),
        isNull(chargingPoints.deletedAt),
      ))
      .limit(1);
    if (chargingPoint === undefined) {
      throw new AppError(404, "CHARGING_POINT_NOT_FOUND", "Charging point not found");
    }
    return chargingPoint.protocol;
  }
}

export function toProtocolConfigurationItem(
  definition: ConfigurationDefinition,
  row: Pick<
    typeof protocolConfigurations.$inferSelect,
    "key" | "value" | "version" | "pendingRestart" | "lastModifiedBy" | "updatedAt"
  >,
): ProtocolConfigurationItem {
  return {
    key: row.key,
    value: row.value,
    defaultValue: definition.defaultValue,
    readonly: definition.readonly ?? definition.access === "R",
    valueType: definition.valueType ?? "string",
    rebootRequired: definition.rebootRequired ?? false,
    minValue: definition.minValue ?? null,
    maxValue: definition.maxValue ?? null,
    description: definition.description,
    version: row.version,
    pendingRestart: row.pendingRestart,
    lastModifiedBy: row.lastModifiedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPersistedEntry(
  row: typeof protocolConfigurations.$inferSelect,
): ChargingPointActorConfigurationEntry {
  return {
    key: row.key,
    value: row.value,
    version: row.version,
    pendingRestart: row.pendingRestart,
    lastModifiedBy: row.lastModifiedBy,
    updatedAt: row.updatedAt,
  };
}

function requireDefinition(key: string): ConfigurationDefinition {
  const definition = configurationDefinitions.find((item) => item.key === key);
  if (definition === undefined) {
    throw new AppError(
      404,
      "PROTOCOL_CONFIGURATION_NOT_FOUND",
      "Protocol configuration not found",
    );
  }
  return definition;
}

function normalizeValue(definition: ConfigurationDefinition, value: string): string {
  if (definition.valueType === undefined || definition.valueType === "string") {
    return value;
  }

  if (definition.valueType === "boolean") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") {
      return normalized;
    }
    throwInvalidValue();
  }

  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throwInvalidValue();
  }
  const parsed = Number(normalized);
  const minimum = definition.key === "HeartbeatInterval"
    ? Math.max(1, definition.minValue ?? 1)
    : definition.minValue;
  if (
    !Number.isSafeInteger(parsed) ||
    (minimum !== undefined && parsed < minimum) ||
    (definition.maxValue !== undefined && parsed > definition.maxValue)
  ) {
    throwInvalidValue();
  }
  return String(parsed);
}

function throwInvalidValue(): never {
  throw new AppError(
    422,
    "PROTOCOL_CONFIGURATION_INVALID_VALUE",
    "Protocol configuration value is invalid",
  );
}
