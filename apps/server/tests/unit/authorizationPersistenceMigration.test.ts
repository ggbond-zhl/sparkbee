import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, test } from "vitest";

describe("本地授权表迁移", () => {
  test("创建本地列表和缓存表并启用 RLS 与级联删除", async () => {
    const client = new PGlite();
    for (const migrationName of [
      "0000_fixed_silk_fever.sql",
      "0001_flaky_johnny_blaze.sql",
      "0002_fast_luke_cage.sql",
      "0003_rename_actor_logs.sql",
      "0004_mushy_carnage.sql",
      "0005_smart_mauler.sql",
      "0006_strong_mystique.sql",
      "0007_fixed_odin.sql",
      "0008_fixed_galactus.sql",
    ]) {
      await client.exec(readFileSync(join(
        import.meta.dirname,
        "../../drizzle/migrations",
        migrationName,
      ), "utf8"));
    }

    const tables = await client.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(`
      select relname, relrowsecurity
      from pg_class
      where relname in (
        'authorization_cache_entries',
        'local_authorization_entries',
        'local_authorization_lists'
      )
      order by relname
    `);
    expect(tables.rows).toEqual([
      { relname: "authorization_cache_entries", relrowsecurity: true },
      { relname: "local_authorization_entries", relrowsecurity: true },
      { relname: "local_authorization_lists", relrowsecurity: true },
    ]);

    await client.exec(`
      insert into charging_points (
        id, name, identity, protocol, central_system_url, vendor, model
      ) values (
        '00000000-0000-4000-8000-000000000001',
        '迁移测试桩',
        'MIGRATION_CP',
        'OCPP16J',
        'ws://localhost/ocpp',
        'SparkBee',
        'MigrationTest'
      );
      insert into local_authorization_lists (
        charging_point_id, protocol, version, source, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000001',
        'OCPP16J',
        1,
        'ocpp16',
        '2026-07-24T00:00:00.000Z'
      );
      insert into local_authorization_entries (
        charging_point_id, protocol, credential_id, status
      ) values (
        '00000000-0000-4000-8000-000000000001',
        'OCPP16J',
        'TAG-A',
        'accepted'
      );
      insert into authorization_cache_entries (
        charging_point_id, protocol, credential_id, evse_id, status,
        last_evaluated_at
      ) values (
        '00000000-0000-4000-8000-000000000001',
        'OCPP16J',
        'TAG-A',
        1,
        'accepted',
        '2026-07-24T00:00:00.000Z'
      );
      delete from charging_points
      where id = '00000000-0000-4000-8000-000000000001';
    `);
    const remaining = await client.query<{ count: number }>(`
      select (
        (select count(*) from local_authorization_lists) +
        (select count(*) from local_authorization_entries) +
        (select count(*) from authorization_cache_entries)
      )::integer as count
    `);
    expect(remaining.rows).toEqual([{ count: 0 }]);
  }, 20_000);
});
