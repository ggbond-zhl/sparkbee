import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { runtimeOperationResponseSchema } from "@spark-bee/contracts";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, test } from "vitest";

import { createApp } from "../../src/app";
import { schema } from "../../src/db";

const existingMigrationNames = [
  "0000_fixed_silk_fever.sql",
  "0001_flaky_johnny_blaze.sql",
  "0002_fast_luke_cage.sql",
  "0003_rename_actor_logs.sql",
  "0004_mushy_carnage.sql",
  "0005_smart_mauler.sql",
  "0006_strong_mystique.sql",
  "0007_fixed_odin.sql",
  "0008_fixed_galactus.sql",
];

describe("充电桩运行意图迁移", () => {
  test("将存在活动交易的旧桩回填为运行并让其他桩保持停止", async () => {
    const client = new PGlite();
    for (const migrationName of existingMigrationNames) {
      await applyMigration(client, migrationName);
    }

    await client.exec(`
      insert into charging_points (
        id, name, identity, protocol, central_system_url, vendor, model
      ) values
        (
          '00000000-0000-4000-8000-000000000001',
          '活动交易桩',
          'MIGRATION_ACTIVE',
          'OCPP16J',
          'ws://localhost/ocpp',
          'SparkBee',
          'MigrationTest'
        ),
        (
          '00000000-0000-4000-8000-000000000002',
          '已结束交易桩',
          'MIGRATION_ENDED',
          'OCPP16J',
          'ws://localhost/ocpp',
          'SparkBee',
          'MigrationTest'
        ),
        (
          '00000000-0000-4000-8000-000000000003',
          '无交易桩',
          'MIGRATION_IDLE',
          'OCPP16J',
          'ws://localhost/ocpp',
          'SparkBee',
          'MigrationTest'
        );

      insert into charging_transactions (
        charging_point_id,
        transaction_id,
        ocpp_transaction_id,
        evse_id,
        connector_id,
        id_tag,
        state,
        charging_state,
        meter_start_wh,
        latest_meter_wh,
        started_at,
        ended_at
      ) values
        (
          '00000000-0000-4000-8000-000000000001',
          'active-transaction',
          1001,
          1,
          1,
          'TAG-ACTIVE',
          'active',
          'charging',
          0,
          100,
          '2026-07-27T00:00:00.000Z',
          null
        ),
        (
          '00000000-0000-4000-8000-000000000002',
          'ended-transaction',
          1002,
          1,
          1,
          'TAG-ENDED',
          'ended',
          'idle',
          0,
          100,
          '2026-07-26T00:00:00.000Z',
          '2026-07-26T01:00:00.000Z'
        );
    `);

    await applyMigration(client, "0009_restore_running_intent.sql");
    await client.exec(`
      insert into charging_points (
        id, name, identity, protocol, central_system_url, vendor, model
      ) values (
        '00000000-0000-4000-8000-000000000004',
        '迁移后新桩',
        'MIGRATION_NEW',
        'OCPP16J',
        'ws://localhost/ocpp',
        'SparkBee',
        'MigrationTest'
      );
    `);

    const app = createApp({ database: drizzle({ client, schema }) });

    await expect(getRuntimeStatus(app, "00000000-0000-4000-8000-000000000001"))
      .resolves.toMatchObject({ runningIntent: "running", status: "stopped" });
    for (const chargingPointId of [
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
    ]) {
      await expect(getRuntimeStatus(app, chargingPointId)).resolves.toMatchObject({
        runningIntent: "stopped",
        status: "stopped",
      });
    }
  }, 20_000);
});

async function applyMigration(client: PGlite, migrationName: string): Promise<void> {
  await client.exec(readFileSync(join(
    import.meta.dirname,
    "../../drizzle/migrations",
    migrationName,
  ), "utf8"));
}

async function getRuntimeStatus(
  app: ReturnType<typeof createApp>,
  chargingPointId: string,
) {
  const response = await app.request(`/api/charging-points/${chargingPointId}/status`);
  expect(response.status).toBe(200);
  return runtimeOperationResponseSchema.parse(await response.json());
}
