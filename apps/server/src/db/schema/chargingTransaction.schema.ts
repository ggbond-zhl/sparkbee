import { isNull } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { chargingPoints } from "./chargingPoint.schema";

export const chargingTransactions = pgTable(
  "charging_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id").notNull(),
    ocppTransactionId: integer("ocpp_transaction_id"),
    evseId: integer("evse_id").notNull(),
    connectorId: integer("connector_id").notNull(),
    idTag: text("id_tag").notNull(),
    state: text("state").notNull(),
    chargingState: text("charging_state").notNull(),
    meterStartWh: doublePrecision("meter_start_wh").notNull(),
    latestMeterWh: doublePrecision("latest_meter_wh").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("charging_transactions_point_transaction_unique")
      .on(table.chargingPointId, table.transactionId),
    uniqueIndex("charging_transactions_active_connector_unique")
      .on(table.chargingPointId, table.evseId, table.connectorId)
      .where(isNull(table.endedAt)),
    index("charging_transactions_active_point_idx")
      .on(table.chargingPointId, table.startedAt)
      .where(isNull(table.endedAt)),
    index("charging_transactions_ended_at_idx").on(table.endedAt),
  ],
);

export const chargingSamples = pgTable(
  "charging_samples",
  {
    id: text("id").primaryKey(),
    transactionRecordId: uuid("transaction_record_id")
      .notNull()
      .references(() => chargingTransactions.id, { onDelete: "cascade" }),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
    meterWh: doublePrecision("meter_wh").notNull(),
    powerW: doublePrecision("power_w").notNull(),
    currentA: doublePrecision("current_a").notNull(),
    voltageV: doublePrecision("voltage_v").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("charging_samples_transaction_sampled_at_idx")
      .on(table.transactionRecordId, table.sampledAt, table.id),
    uniqueIndex("charging_samples_transaction_sampled_at_unique")
      .on(table.transactionRecordId, table.sampledAt),
    index("charging_samples_sampled_at_idx").on(table.sampledAt),
  ],
);
