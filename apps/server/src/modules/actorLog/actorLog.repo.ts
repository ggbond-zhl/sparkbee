import { and, asc, desc, eq, gt, lt, lte, gte, or, sql } from "drizzle-orm";
import type { ActorLog, ListActorLogsQuery } from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { actorLogs, legacyActorLogs } from "../../db/schema/actorLog.schema";

type Cursor = { occurredAt: string; id: string };
type ActorLogTable = typeof actorLogs | typeof legacyActorLogs;

export class ActorLogRepository {
  private table?: ActorLogTable;

  constructor(private readonly db: ServerDatabase) {}

  async insertMany(records: ActorLog[]): Promise<void> {
    if (records.length === 0) return;
    await this.withTable((table) =>
      this.db.insert(table).values(records.map((record) => ({
        ...record,
        occurredAt: new Date(record.occurredAt),
      }))).onConflictDoNothing(),
    );
  }

  async list(chargingPointId: string, query: ListActorLogsQuery) {
    return this.withTable(async (table) => {
      const before = query.before === undefined ? undefined : decodeCursor(query.before);
      const after = query.after === undefined ? undefined : decodeCursor(query.after);
      const cursorFilter = before === undefined
        ? after === undefined
          ? undefined
          : or(
              gt(table.occurredAt, new Date(after.occurredAt)),
              and(eq(table.occurredAt, new Date(after.occurredAt)), gt(table.id, after.id)),
            )
        : or(
            lt(table.occurredAt, new Date(before.occurredAt)),
            and(eq(table.occurredAt, new Date(before.occurredAt)), lt(table.id, before.id)),
          );
      const conditions = [
        eq(table.chargingPointId, chargingPointId),
        cursorFilter,
        query.level === undefined ? undefined : eq(table.level, query.level),
        query.code === undefined ? undefined : eq(table.code, query.code),
        query.operationId === undefined
          ? undefined
          : sql`${table.context} ->> 'operationId' = ${query.operationId}`,
        query.from === undefined ? undefined : gte(table.occurredAt, new Date(query.from)),
        query.to === undefined ? undefined : lte(table.occurredAt, new Date(query.to)),
      ].filter((value) => value !== undefined);
      const order = after === undefined
        ? [desc(table.occurredAt), desc(table.id)] as const
        : [asc(table.occurredAt), asc(table.id)] as const;
      const rows = await this.db.select().from(table)
        .where(and(...conditions))
        .orderBy(...order)
        .limit(query.limit);
      const items = rows.map(toActorLog);

      return {
        items,
        previousCursor: items.length === query.limit ? encodeCursor(items.at(-1)!) : null,
        latestCursor: items.length === 0
          ? query.after ?? null
          : encodeCursor(after === undefined ? items[0]! : items.at(-1)!),
      };
    });
  }

  async deleteExpired(before: Date, limit: number): Promise<number> {
    return this.withTable(async (table) => {
      const deleted = await this.db.execute(sql`
        delete from ${table}
        where id in (
          select id from ${table}
          where ${table.occurredAt} < ${before}
          order by ${table.occurredAt}
          limit ${limit}
        )
        returning id
      `);
      return deleted.rows.length;
    });
  }

  async deleteForChargingPoint(chargingPointId: string): Promise<void> {
    await this.withTable(async (table) => {
      await this.db.delete(table).where(eq(table.chargingPointId, chargingPointId));
    });
  }

  private async withTable<T>(operation: (table: ActorLogTable) => Promise<T>): Promise<T> {
    const table = await this.resolveTable();
    try {
      return await operation(table);
    } catch (error) {
      if (!hasPostgresCode(error, "42P01")) throw error;
      this.table = undefined;
      const retryTable = await this.resolveTable();
      if (retryTable === table) throw error;
      return operation(retryTable);
    }
  }

  private async resolveTable(): Promise<ActorLogTable> {
    if (this.table !== undefined) return this.table;
    const result = await this.db.execute(sql`
      select
        to_regclass('public.actor_logs') as actor_logs,
        to_regclass('public.runtime_logs') as runtime_logs
    `);
    const row = result.rows[0] as {
      actor_logs: string | null;
      runtime_logs: string | null;
    } | undefined;
    if (row?.actor_logs !== null && row?.actor_logs !== undefined) {
      this.table = actorLogs;
      return this.table;
    }
    if (row?.runtime_logs !== null && row?.runtime_logs !== undefined) {
      this.table = legacyActorLogs;
      return this.table;
    }
    throw new Error("Actor log storage table does not exist");
  }
}

function toActorLog(row: typeof actorLogs.$inferSelect): ActorLog {
  return {
    id: row.id,
    sequence: row.sequence,
    chargingPointId: row.chargingPointId,
    occurredAt: row.occurredAt.toISOString(),
    level: row.level as ActorLog["level"],
    code: row.code,
    message: row.message,
    context: row.context ?? null,
  };
}

function encodeCursor(log: Pick<ActorLog, "occurredAt" | "id">): string {
  return Buffer.from(JSON.stringify({ occurredAt: log.occurredAt, id: log.id }), "utf8")
    .toString("base64url");
}

function decodeCursor(value: string): Cursor {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
}

function hasPostgresCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasPostgresCode(error.cause, code);
}
