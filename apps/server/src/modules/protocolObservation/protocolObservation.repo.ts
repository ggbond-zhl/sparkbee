import { and, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import {
  protocolEventSchema,
  type HistoricalObservationEvent,
  type ListHistoricalObservationEventsQuery,
  type ListProtocolMessagesQuery,
  type ProtocolMessageEvent,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { protocolEvents, protocolMessages } from "../../db/schema";

type Cursor = { occurredAt: string; id: string };

export class ProtocolMessageRepository {
  constructor(private readonly db: ServerDatabase) {}

  async insertMany(records: ProtocolMessageEvent[]): Promise<void> {
    if (records.length === 0) return;
    await this.db.insert(protocolMessages).values(records.map((record) => ({
      id: record.id,
      sequence: record.sequence,
      chargingPointId: record.chargingPointId,
      protocol: record.protocol,
      occurredAt: new Date(record.occurredAt),
      direction: record.direction,
      action: record.action ?? null,
      messageId: record.messageId ?? null,
      body: record.body ?? null,
    }))).onConflictDoNothing();
  }

  async list(chargingPointId: string, query: ListProtocolMessagesQuery) {
    const before = query.before === undefined
      ? undefined
      : decodeCursor(query.before);
    const rows = await this.db
      .select()
      .from(protocolMessages)
      .where(and(...[
        eq(protocolMessages.chargingPointId, chargingPointId),
        createBeforeFilter(protocolMessages, before),
        query.direction === undefined
          ? undefined
          : eq(protocolMessages.direction, query.direction),
        query.action === undefined
          ? undefined
          : eq(protocolMessages.action, query.action),
        query.from === undefined
          ? undefined
          : gte(protocolMessages.occurredAt, new Date(query.from)),
        query.to === undefined
          ? undefined
          : lte(protocolMessages.occurredAt, new Date(query.to)),
      ].filter((condition) => condition !== undefined)))
      .orderBy(desc(protocolMessages.occurredAt), desc(protocolMessages.id))
      .limit(query.limit);
    const items = rows.map(toProtocolMessage);
    return {
      items,
      previousCursor: items.length === query.limit
        ? encodeCursor(items.at(-1)!)
        : null,
    };
  }

  async deleteForChargingPoint(chargingPointId: string): Promise<void> {
    await this.db.delete(protocolMessages)
      .where(eq(protocolMessages.chargingPointId, chargingPointId));
  }

  async deleteExpired(before: Date, limit: number): Promise<number> {
    const deleted = await this.db.execute(sql`
      delete from ${protocolMessages}
      where id in (
        select id from ${protocolMessages}
        where ${protocolMessages.occurredAt} < ${before}
        order by ${protocolMessages.occurredAt}
        limit ${limit}
      )
      returning id
    `);
    return deleted.rows.length;
  }
}

export class HistoricalObservationEventRepository {
  constructor(private readonly db: ServerDatabase) {}

  async insertMany(records: HistoricalObservationEvent[]): Promise<void> {
    if (records.length === 0) return;
    await this.db.insert(protocolEvents).values(records.map((record) => ({
      id: record.id,
      sequence: record.sequence,
      chargingPointId: record.chargingPointId,
      protocol: record.protocol,
      occurredAt: new Date(record.occurredAt),
      eventType: record.type,
      resource: record.resource,
      data: record,
    }))).onConflictDoNothing();
  }

  async list(chargingPointId: string, query: ListHistoricalObservationEventsQuery) {
    const before = query.before === undefined
      ? undefined
      : decodeCursor(query.before);
    const rows = await this.db
      .select()
      .from(protocolEvents)
      .where(and(...[
        eq(protocolEvents.chargingPointId, chargingPointId),
        createBeforeFilter(protocolEvents, before),
        query.eventType === undefined
          ? undefined
          : eq(protocolEvents.eventType, query.eventType),
        query.from === undefined
          ? undefined
          : gte(protocolEvents.occurredAt, new Date(query.from)),
        query.to === undefined
          ? undefined
          : lte(protocolEvents.occurredAt, new Date(query.to)),
      ].filter((condition) => condition !== undefined)))
      .orderBy(desc(protocolEvents.occurredAt), desc(protocolEvents.id))
      .limit(query.limit);
    const items = rows.map((row) => protocolEventSchema.parse(row.data));
    return {
      items,
      previousCursor: items.length === query.limit
        ? encodeCursor(items.at(-1)!)
        : null,
    };
  }

  async deleteForChargingPoint(chargingPointId: string): Promise<void> {
    await this.db.delete(protocolEvents)
      .where(eq(protocolEvents.chargingPointId, chargingPointId));
  }

  async deleteExpired(before: Date, limit: number): Promise<number> {
    const deleted = await this.db.execute(sql`
      delete from ${protocolEvents}
      where id in (
        select id from ${protocolEvents}
        where ${protocolEvents.occurredAt} < ${before}
        order by ${protocolEvents.occurredAt}
        limit ${limit}
      )
      returning id
    `);
    return deleted.rows.length;
  }
}

function createBeforeFilter(
  table: typeof protocolMessages | typeof protocolEvents,
  before: Cursor | undefined,
) {
  return before === undefined
    ? undefined
    : or(
        lt(table.occurredAt, new Date(before.occurredAt)),
        and(
          eq(table.occurredAt, new Date(before.occurredAt)),
          lt(table.id, before.id),
        ),
      );
}

function toProtocolMessage(
  row: typeof protocolMessages.$inferSelect,
): ProtocolMessageEvent {
  return {
    id: row.id,
    sequence: row.sequence,
    chargingPointId: row.chargingPointId,
    protocol: row.protocol,
    occurredAt: row.occurredAt.toISOString(),
    type: "protocol.message",
    resource: { scope: "protocol" },
    direction: row.direction,
    ...(row.action === null ? {} : { action: row.action }),
    ...(row.messageId === null ? {} : { messageId: row.messageId }),
    ...(row.body === null ? {} : { body: row.body }),
  };
}

function encodeCursor(record: { occurredAt: string; id: string }) {
  return Buffer.from(JSON.stringify(record), "utf8").toString("base64url");
}

function decodeCursor(value: string): Cursor {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
}
