import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, test } from "vitest";

describe("Actor 日志表迁移", () => {
  test("重命名物理表并保留数据、约束和索引", async () => {
    const client = new PGlite();
    for (const migrationName of [
      "0000_fixed_silk_fever.sql",
      "0001_flaky_johnny_blaze.sql",
      "0002_fast_luke_cage.sql",
    ]) {
      await client.exec(readFileSync(join(
        import.meta.dirname,
        "../../drizzle/migrations",
        migrationName,
      ), "utf8"));
    }
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
      insert into runtime_logs (
        id, sequence, charging_point_id, occurred_at, level, message
      ) values (
        'actor-log-before-rename',
        1,
        '00000000-0000-4000-8000-000000000001',
        '2026-07-15T00:00:00.000Z',
        'info',
        'before rename'
      );
    `);

    const migration = readFileSync(join(
      import.meta.dirname,
      "../../drizzle/migrations/0003_rename_actor_logs.sql",
    ), "utf8");
    await client.exec(migration);

    const rows = await client.query<{ id: string }>("select id from actor_logs");
    expect(rows.rows).toEqual([{ id: "actor-log-before-rename" }]);
    await expect(client.query("select id from runtime_logs")).rejects.toThrow();

    const constraints = await client.query<{ conname: string }>(`
      select conname
      from pg_constraint
      where conrelid = 'actor_logs'::regclass
      order by conname
    `);
    const constraintNames = constraints.rows.map((row) => row.conname);
    expect(constraintNames).toContain("actor_logs_charging_point_id_charging_points_id_fk");
    expect(constraintNames).toContain("actor_logs_pkey");
    expect(constraintNames.every((name) => name.startsWith("actor_logs_"))).toBe(true);

    const indexes = await client.query<{ indexname: string }>(`
      select indexname
      from pg_indexes
      where tablename = 'actor_logs'
      order by indexname
    `);
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "actor_logs_charging_point_occurred_at_idx",
      "actor_logs_code_idx",
      "actor_logs_occurred_at_idx",
      "actor_logs_operation_id_idx",
      "actor_logs_pkey",
    ]);
  }, 15_000);
});
