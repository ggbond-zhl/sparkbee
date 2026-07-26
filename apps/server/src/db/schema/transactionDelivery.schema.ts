import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { chargingPoints } from "./chargingPoint.schema";
import { chargingTransactions } from "./chargingTransaction.schema";

export const transactionDeliverySequences = pgTable(
  "transaction_delivery_sequences",
  {
    chargingPointId: uuid("charging_point_id")
      .primaryKey()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    nextSequence: bigint("next_sequence", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const transactionDeliveryMessages = pgTable(
  "transaction_delivery_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    transactionRecordId: uuid("transaction_record_id")
      .notNull()
      .references(() => chargingTransactions.id, { onDelete: "cascade" }),
    deliverySequence: bigint("delivery_sequence", { mode: "bigint" }).notNull(),
    messageId: uuid("message_id").notNull(),
    messageType: text("message_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    inFlightAt: timestamp("in_flight_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transaction_delivery_point_sequence_unique")
      .on(table.chargingPointId, table.deliverySequence),
    uniqueIndex("transaction_delivery_message_id_unique").on(table.messageId),
    index("transaction_delivery_point_status_sequence_idx")
      .on(table.chargingPointId, table.status, table.deliverySequence),
    index("transaction_delivery_retry_idx")
      .on(table.chargingPointId, table.nextAttemptAt, table.deliverySequence),
    index("transaction_delivery_terminal_idx")
      .on(table.status, table.deliveredAt, table.failedAt),
  ],
);
