import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, test } from "vitest";

describe("交易交付表迁移", () => {
  test("创建桩级序号和交付消息表并启用 RLS 与查询索引", async () => {
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
        'transaction_delivery_messages',
        'transaction_delivery_sequences'
      )
      order by relname
    `);
    expect(tables.rows).toEqual([
      { relname: "transaction_delivery_messages", relrowsecurity: true },
      { relname: "transaction_delivery_sequences", relrowsecurity: true },
    ]);

    const indexes = await client.query<{ indexname: string }>(`
      select indexname
      from pg_indexes
      where tablename = 'transaction_delivery_messages'
      order by indexname
    `);
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "transaction_delivery_message_id_unique",
      "transaction_delivery_messages_pkey",
      "transaction_delivery_point_sequence_unique",
      "transaction_delivery_point_status_sequence_idx",
      "transaction_delivery_retry_idx",
      "transaction_delivery_terminal_idx",
    ]);
  }, 20_000);
});
