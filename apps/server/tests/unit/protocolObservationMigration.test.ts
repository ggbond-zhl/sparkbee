import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, test } from "vitest";

describe("历史观察记录表迁移", () => {
  test("创建独立协议报文和事件表并启用 RLS 与查询索引", async () => {
    const client = new PGlite();
    for (const migrationName of [
      "0000_fixed_silk_fever.sql",
      "0001_flaky_johnny_blaze.sql",
      "0002_fast_luke_cage.sql",
      "0003_rename_actor_logs.sql",
      "0004_mushy_carnage.sql",
      "0005_smart_mauler.sql",
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
      where relname in ('protocol_events', 'protocol_messages')
      order by relname
    `);
    expect(tables.rows).toEqual([
      { relname: "protocol_events", relrowsecurity: true },
      { relname: "protocol_messages", relrowsecurity: true },
    ]);

    const indexes = await client.query<{ indexname: string }>(`
      select indexname
      from pg_indexes
      where tablename in ('protocol_events', 'protocol_messages')
      order by indexname
    `);
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "protocol_events_occurred_at_idx",
      "protocol_events_pkey",
      "protocol_events_point_occurred_at_idx",
      "protocol_events_point_type_occurred_at_idx",
      "protocol_messages_occurred_at_idx",
      "protocol_messages_pkey",
      "protocol_messages_point_action_occurred_at_idx",
      "protocol_messages_point_direction_occurred_at_idx",
      "protocol_messages_point_occurred_at_idx",
    ]);
  }, 20_000);
});
