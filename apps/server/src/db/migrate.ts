import type { PGlite } from "@electric-sql/pglite";

export async function migrateDatabase(client: Pick<PGlite, "exec">): Promise<void> {
  await client.exec(`
    create type charging_point_protocol as enum ('OCPP16J');
    create type connector_format as enum ('socket', 'cable', 'unknown');
    create type connector_power_type as enum ('ac', 'dc', 'unknown');

    create table charging_points (
      id uuid primary key default gen_random_uuid(),
      identity text not null,
      protocol charging_point_protocol not null,
      central_system_url text not null,
      vendor text not null,
      model text not null,
      firmware_version text,
      serial_number text,
      deleted_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index charging_points_active_created_at_idx
      on charging_points (created_at)
      where deleted_at is null;
    create index charging_points_deleted_at_created_at_idx
      on charging_points (deleted_at, created_at);

    create table connectors (
      id uuid primary key default gen_random_uuid(),
      charging_point_id uuid not null references charging_points(id),
      evse_id integer not null,
      connector_id integer not null,
      type text not null,
      format connector_format not null,
      power_type connector_power_type not null,
      max_voltage integer,
      max_current integer,
      max_power integer,
      sort_order integer not null,
      deleted_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index connectors_charging_point_idx
      on connectors (charging_point_id);
    create index connectors_active_order_idx
      on connectors (charging_point_id, sort_order, created_at)
      where deleted_at is null;
    create unique index connectors_active_evse_id_unique
      on connectors (charging_point_id, evse_id)
      where deleted_at is null;
    create unique index connectors_active_connector_id_unique
      on connectors (charging_point_id, connector_id)
      where deleted_at is null;
  `);
}
