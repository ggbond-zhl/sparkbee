import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { chargingPointProtocol, chargingPoints } from "./chargingPoint.schema";

export const localAuthorizationLists = pgTable(
  "local_authorization_lists",
  {
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    protocol: chargingPointProtocol("protocol").notNull(),
    version: integer("version").notNull(),
    source: text("source").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "local_authorization_lists_point_protocol_pk",
      columns: [table.chargingPointId, table.protocol],
    }),
  ],
);

export const localAuthorizationEntries = pgTable(
  "local_authorization_entries",
  {
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    protocol: chargingPointProtocol("protocol").notNull(),
    credentialId: text("credential_id").notNull(),
    status: text("status").notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    groupCredentialId: text("group_credential_id"),
  },
  (table) => [
    primaryKey({
      name: "local_authorization_entries_point_protocol_credential_pk",
      columns: [table.chargingPointId, table.protocol, table.credentialId],
    }),
  ],
);

export const authorizationCacheEntries = pgTable(
  "authorization_cache_entries",
  {
    chargingPointId: uuid("charging_point_id")
      .notNull()
      .references(() => chargingPoints.id, { onDelete: "cascade" }),
    protocol: chargingPointProtocol("protocol").notNull(),
    credentialId: text("credential_id").notNull(),
    evseId: integer("evse_id").notNull(),
    status: text("status").notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    groupCredentialId: text("group_credential_id"),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "authorization_cache_entries_point_protocol_credential_evse_pk",
      columns: [
        table.chargingPointId,
        table.protocol,
        table.credentialId,
        table.evseId,
      ],
    }),
    index("authorization_cache_entries_point_protocol_idx").on(
      table.chargingPointId,
      table.protocol,
    ),
  ],
);
