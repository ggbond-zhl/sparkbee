import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { HistoricalObservationEvent } from "@spark-bee/contracts";

import { chargingPointProtocol, chargingPoints } from "./chargingPoint.schema";

export const protocolMessages = pgTable(
  "protocol_messages",
  {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    protocol: chargingPointProtocol("protocol").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    direction: text("direction").$type<"sent" | "received">().notNull(),
    action: text("action"),
    messageId: text("message_id"),
    body: jsonb("body").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("protocol_messages_point_occurred_at_idx")
      .on(table.chargingPointId, table.occurredAt, table.id),
    index("protocol_messages_point_direction_occurred_at_idx")
      .on(table.chargingPointId, table.direction, table.occurredAt, table.id),
    index("protocol_messages_point_action_occurred_at_idx")
      .on(table.chargingPointId, table.action, table.occurredAt, table.id),
    index("protocol_messages_occurred_at_idx").on(table.occurredAt),
  ],
);

export const protocolEvents = pgTable(
  "protocol_events",
  {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    protocol: chargingPointProtocol("protocol").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    eventType: text("event_type").notNull(),
    resource: jsonb("resource").$type<HistoricalObservationEvent["resource"]>().notNull(),
    data: jsonb("data").$type<HistoricalObservationEvent>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("protocol_events_point_occurred_at_idx")
      .on(table.chargingPointId, table.occurredAt, table.id),
    index("protocol_events_point_type_occurred_at_idx")
      .on(table.chargingPointId, table.eventType, table.occurredAt, table.id),
    index("protocol_events_occurred_at_idx").on(table.occurredAt),
  ],
);
