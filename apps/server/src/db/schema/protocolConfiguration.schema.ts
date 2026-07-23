import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { chargingPointProtocol, chargingPoints } from "./chargingPoint.schema";

export const protocolConfigurations = pgTable(
  "protocol_configurations",
  {
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    protocol: chargingPointProtocol("protocol").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    version: integer("version").notNull().default(1),
    pendingRestart: boolean("pending_restart").notNull().default(false),
    lastModifiedBy: text("last_modified_by")
      .$type<"ui" | "csms" | "internal" | "initialization">()
      .notNull()
      .default("initialization"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "protocol_configurations_point_protocol_key_pk",
      columns: [table.chargingPointId, table.protocol, table.key],
    }),
    index("protocol_configurations_point_protocol_idx").on(
      table.chargingPointId,
      table.protocol,
    ),
  ],
);
