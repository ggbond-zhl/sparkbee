import type { PGlite } from "@electric-sql/pglite";

export async function migrateDatabase(client: Pick<PGlite, "exec">): Promise<void> {
  await client.exec(`
    create type charging_point_protocol as enum ('OCPP16J');
    create type connector_format as enum ('socket', 'cable', 'unknown');
    create type connector_power_type as enum ('ac', 'dc', 'unknown');

    create table charging_points (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      description text,
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

    create table actor_logs (
      id text primary key,
      sequence integer not null,
      charging_point_id uuid not null references charging_points(id) on delete cascade,
      occurred_at timestamptz not null,
      level text not null,
      code text,
      message text not null,
      context jsonb,
      created_at timestamptz not null default now()
    );

    create index actor_logs_charging_point_occurred_at_idx
      on actor_logs (charging_point_id, occurred_at, id);
    create index actor_logs_occurred_at_idx on actor_logs (occurred_at);
    create index actor_logs_code_idx on actor_logs (charging_point_id, code);
    create index actor_logs_operation_id_idx
      on actor_logs (charging_point_id, ((context ->> 'operationId')));
    alter table actor_logs enable row level security;

    create table charging_transactions (
      id uuid primary key default gen_random_uuid(),
      charging_point_id uuid not null references charging_points(id) on delete cascade,
      transaction_id text not null,
      ocpp_transaction_id integer,
      evse_id integer not null,
      connector_id integer not null,
      id_tag text not null,
      state text not null,
      charging_state text not null,
      meter_start_wh double precision not null,
      latest_meter_wh double precision not null,
      started_at timestamptz not null,
      ended_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index charging_transactions_point_transaction_unique
      on charging_transactions (charging_point_id, transaction_id);
    create unique index charging_transactions_active_connector_unique
      on charging_transactions (charging_point_id, evse_id, connector_id)
      where ended_at is null;
    create index charging_transactions_active_point_idx
      on charging_transactions (charging_point_id, started_at)
      where ended_at is null;
    create index charging_transactions_ended_at_idx
      on charging_transactions (ended_at);

    create table charging_samples (
      id text primary key,
      transaction_record_id uuid not null references charging_transactions(id) on delete cascade,
      sampled_at timestamptz not null,
      meter_wh double precision not null,
      power_w double precision not null,
      current_a double precision not null,
      voltage_v double precision not null,
      created_at timestamptz not null default now()
    );

    create index charging_samples_transaction_sampled_at_idx
      on charging_samples (transaction_record_id, sampled_at, id);
    create unique index charging_samples_transaction_sampled_at_unique
      on charging_samples (transaction_record_id, sampled_at);
    create index charging_samples_sampled_at_idx
      on charging_samples (sampled_at);
    alter table charging_transactions enable row level security;
    alter table charging_samples enable row level security;
  `);
}
