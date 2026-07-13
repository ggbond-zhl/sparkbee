import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { chargingPoints } from "./chargingPoint.schema";

export const runtimeLogs = pgTable(
  "runtime_logs",
  {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    level: text("level").notNull(),
    code: text("code"),
    message: text("message").notNull(),
    context: jsonb("context").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("runtime_logs_charging_point_occurred_at_idx")
      .on(table.chargingPointId, table.occurredAt, table.id),
    index("runtime_logs_occurred_at_idx").on(table.occurredAt),
    index("runtime_logs_code_idx").on(table.chargingPointId, table.code),
    index("runtime_logs_operation_id_idx")
      .on(table.chargingPointId, sql`(${table.context} ->> 'operationId')`),
  ],
);
