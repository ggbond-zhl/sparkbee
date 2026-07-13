import { and, asc, desc, eq, gt, lt, lte, gte, or, sql } from "drizzle-orm";
import type { ListRuntimeLogsQuery, RuntimeLog } from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { runtimeLogs } from "../../db/schema";

type Cursor = { occurredAt: string; id: string };

export class RuntimeLogRepository {
  constructor(private readonly db: ServerDatabase) {}

  async insertMany(records: RuntimeLog[]): Promise<void> {
    if (records.length === 0) return;
    await this.db.insert(runtimeLogs).values(records.map((record) => ({
      ...record,
      occurredAt: new Date(record.occurredAt),
    }))).onConflictDoNothing();
  }

  async list(chargingPointId: string, query: ListRuntimeLogsQuery) {
    const before = query.before === undefined ? undefined : decodeCursor(query.before);
    const after = query.after === undefined ? undefined : decodeCursor(query.after);
    const cursorFilter = before === undefined
      ? after === undefined
        ? undefined
        : or(
            gt(runtimeLogs.occurredAt, new Date(after.occurredAt)),
            and(eq(runtimeLogs.occurredAt, new Date(after.occurredAt)), gt(runtimeLogs.id, after.id)),
          )
      : or(
          lt(runtimeLogs.occurredAt, new Date(before.occurredAt)),
          and(eq(runtimeLogs.occurredAt, new Date(before.occurredAt)), lt(runtimeLogs.id, before.id)),
        );
    const conditions = [
      eq(runtimeLogs.chargingPointId, chargingPointId),
      cursorFilter,
      query.level === undefined ? undefined : eq(runtimeLogs.level, query.level),
      query.code === undefined ? undefined : eq(runtimeLogs.code, query.code),
      query.operationId === undefined
        ? undefined
        : sql`${runtimeLogs.context} ->> 'operationId' = ${query.operationId}`,
      query.from === undefined ? undefined : gte(runtimeLogs.occurredAt, new Date(query.from)),
      query.to === undefined ? undefined : lte(runtimeLogs.occurredAt, new Date(query.to)),
    ].filter((value) => value !== undefined);
    const order = after === undefined
      ? [desc(runtimeLogs.occurredAt), desc(runtimeLogs.id)] as const
      : [asc(runtimeLogs.occurredAt), asc(runtimeLogs.id)] as const;
    const rows = await this.db.select().from(runtimeLogs)
      .where(and(...conditions))
      .orderBy(...order)
      .limit(query.limit);
    const items = rows.map(toRuntimeLog);

    return {
      items,
      previousCursor: items.length === query.limit ? encodeCursor(items.at(-1)!) : null,
      latestCursor: items.length === 0
        ? query.after ?? null
        : encodeCursor(after === undefined ? items[0]! : items.at(-1)!),
    };
  }

  async deleteExpired(before: Date, limit: number): Promise<number> {
    const deleted = await this.db.execute(sql`
      delete from ${runtimeLogs}
      where id in (
        select id from ${runtimeLogs}
        where ${runtimeLogs.occurredAt} < ${before}
        order by ${runtimeLogs.occurredAt}
        limit ${limit}
      )
      returning id
    `);
    return deleted.rows.length;
  }
}

function toRuntimeLog(row: typeof runtimeLogs.$inferSelect): RuntimeLog {
  return {
    id: row.id,
    sequence: row.sequence,
    chargingPointId: row.chargingPointId,
    occurredAt: row.occurredAt.toISOString(),
    level: row.level as RuntimeLog["level"],
    code: row.code,
    message: row.message,
    context: row.context ?? null,
  };
}

function encodeCursor(log: Pick<RuntimeLog, "occurredAt" | "id">): string {
  return Buffer.from(JSON.stringify({ occurredAt: log.occurredAt, id: log.id }), "utf8")
    .toString("base64url");
}

function decodeCursor(value: string): Cursor {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
}
