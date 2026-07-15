import { and, asc, desc, eq, gt, lt, lte, gte, or, sql } from "drizzle-orm";
import type { ActorLog, ListActorLogsQuery } from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { actorLogs } from "../../db/schema";

type Cursor = { occurredAt: string; id: string };

export class ActorLogRepository {
  constructor(private readonly db: ServerDatabase) {}

  async insertMany(records: ActorLog[]): Promise<void> {
    if (records.length === 0) return;
    await this.db.insert(actorLogs).values(records.map((record) => ({
      ...record,
      occurredAt: new Date(record.occurredAt),
    }))).onConflictDoNothing();
  }

  async list(chargingPointId: string, query: ListActorLogsQuery) {
    const before = query.before === undefined ? undefined : decodeCursor(query.before);
    const after = query.after === undefined ? undefined : decodeCursor(query.after);
    const cursorFilter = before === undefined
      ? after === undefined
        ? undefined
        : or(
            gt(actorLogs.occurredAt, new Date(after.occurredAt)),
            and(eq(actorLogs.occurredAt, new Date(after.occurredAt)), gt(actorLogs.id, after.id)),
          )
      : or(
          lt(actorLogs.occurredAt, new Date(before.occurredAt)),
          and(eq(actorLogs.occurredAt, new Date(before.occurredAt)), lt(actorLogs.id, before.id)),
        );
    const conditions = [
      eq(actorLogs.chargingPointId, chargingPointId),
      cursorFilter,
      query.level === undefined ? undefined : eq(actorLogs.level, query.level),
      query.code === undefined ? undefined : eq(actorLogs.code, query.code),
      query.operationId === undefined
        ? undefined
        : sql`${actorLogs.context} ->> 'operationId' = ${query.operationId}`,
      query.from === undefined ? undefined : gte(actorLogs.occurredAt, new Date(query.from)),
      query.to === undefined ? undefined : lte(actorLogs.occurredAt, new Date(query.to)),
    ].filter((value) => value !== undefined);
    const order = after === undefined
      ? [desc(actorLogs.occurredAt), desc(actorLogs.id)] as const
      : [asc(actorLogs.occurredAt), asc(actorLogs.id)] as const;
    const rows = await this.db.select().from(actorLogs)
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
  }

  async deleteExpired(before: Date, limit: number): Promise<number> {
    const deleted = await this.db.execute(sql`
      delete from ${actorLogs}
      where id in (
        select id from ${actorLogs}
        where ${actorLogs.occurredAt} < ${before}
        order by ${actorLogs.occurredAt}
        limit ${limit}
      )
      returning id
    `);
    return deleted.rows.length;
  }

  async deleteForChargingPoint(chargingPointId: string): Promise<void> {
    await this.db.delete(actorLogs).where(eq(actorLogs.chargingPointId, chargingPointId));
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
