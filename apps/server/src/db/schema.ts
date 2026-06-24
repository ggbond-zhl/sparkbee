import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const stationDesiredStatusEnum = pgEnum("station_desired_status", [
  "running",
  "stopped"
]);

export const stationRuntimeStatusEnum = pgEnum("station_runtime_status", [
  "starting",
  "running",
  "stopped"
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "active",
  "ended",
  "failed",
  "rejected"
]);

export const stations = pgTable(
  "stations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    protocol: text("protocol").notNull().default("OCPP16J"),
    csmsBaseUrl: text("csms_base_url").notNull(),
    identity: text("identity").notNull().unique(),
    vendor: text("vendor").notNull(),
    model: text("model").notNull(),
    connectorCount: integer("connector_count").notNull(),
    connectorMaxPowerW: integer("connector_max_power_w").notNull(),
    desiredStatus: stationDesiredStatusEnum("desired_status").notNull().default("stopped"),
    runtimeStatus: stationRuntimeStatusEnum("runtime_status").notNull().default("stopped"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    identityIdx: index("stations_identity_idx").on(table.identity),
    desiredStatusIdx: index("stations_desired_status_idx").on(table.desiredStatus)
  })
);

export const connectorSnapshots = pgTable(
  "connector_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stationId: uuid("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }),
    connectorId: integer("connector_id").notNull(),
    status: text("status").notNull().default("available"),
    plugState: text("plug_state").notNull().default("unplugged"),
    vehiclePresence: text("vehicle_presence").notNull().default("absent"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    stationConnectorIdx: index("connector_snapshots_station_connector_idx").on(
      table.stationId,
      table.connectorId
    )
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stationId: uuid("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }),
    simulatorTransactionId: text("simulator_transaction_id").notNull(),
    connectorId: integer("connector_id").notNull(),
    idTag: text("id_tag").notNull(),
    meterStartWh: integer("meter_start_wh").notNull().default(0),
    meterStopWh: integer("meter_stop_wh"),
    status: transactionStatusEnum("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true })
  },
  (table) => ({
    stationIdx: index("transactions_station_idx").on(table.stationId),
    simulatorTransactionIdx: index("transactions_simulator_transaction_idx").on(
      table.simulatorTransactionId
    )
  })
);

export const eventLogs = pgTable(
  "event_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stationId: uuid("station_id").references(() => stations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    protocolMessage: boolean("protocol_message").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    stationOccurredAtIdx: index("event_logs_station_occurred_at_idx").on(
      table.stationId,
      table.occurredAt
    )
  })
);

export const stationRelations = relations(stations, ({ many }) => ({
  connectorSnapshots: many(connectorSnapshots),
  eventLogs: many(eventLogs),
  transactions: many(transactions)
}));
