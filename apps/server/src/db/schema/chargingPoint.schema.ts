import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";

export const chargingPointProtocol = pgEnum("charging_point_protocol", ["OCPP16J"]);
export const chargingPointRunningIntent = pgEnum(
  "charging_point_running_intent",
  ["stopped", "running"],
);

export const chargingPoints = pgTable(
  "charging_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    identity: text("identity").notNull(),
    protocol: chargingPointProtocol("protocol").notNull(),
    runningIntent: chargingPointRunningIntent("running_intent")
      .notNull()
      .default("stopped"),
    centralSystemUrl: text("central_system_url").notNull(),
    vendor: text("vendor").notNull(),
    model: text("model").notNull(),
    firmwareVersion: text("firmware_version"),
    serialNumber: text("serial_number"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("charging_points_active_created_at_idx")
      .on(table.createdAt)
      .where(isNull(table.deletedAt)),
    index("charging_points_deleted_at_created_at_idx").on(table.deletedAt, table.createdAt),
  ],
);
