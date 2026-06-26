import { isNull, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { chargingPoints } from "./chargingPoint.schema";

export const connectorFormat = pgEnum("connector_format", ["socket", "cable", "unknown"]);
export const connectorPowerType = pgEnum("connector_power_type", ["ac", "dc", "unknown"]);

export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id),
    evseId: integer("evse_id").notNull(),
    connectorId: integer("connector_id").notNull(),
    type: text("type").notNull(),
    format: connectorFormat("format").notNull(),
    powerType: connectorPowerType("power_type").notNull(),
    maxVoltage: integer("max_voltage"),
    maxCurrent: integer("max_current"),
    maxPower: integer("max_power"),
    sortOrder: integer("sort_order").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connectors_charging_point_idx").on(table.chargingPointId),
    index("connectors_active_order_idx")
      .on(table.chargingPointId, table.sortOrder, table.createdAt)
      .where(isNull(table.deletedAt)),
    uniqueIndex("connectors_active_evse_id_unique")
      .on(table.chargingPointId, table.evseId)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("connectors_active_connector_id_unique")
      .on(table.chargingPointId, table.connectorId)
      .where(sql`${table.deletedAt} is null`),
  ],
);
