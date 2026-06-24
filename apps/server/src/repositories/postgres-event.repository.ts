import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";

import type { Database } from "../db";
import { eventLogs } from "../db/schema";
import type { CreateEventInput, EventRecord, EventRepository } from "./event.repository";

function toEventRecord(row: typeof eventLogs.$inferSelect): EventRecord {
  return {
    id: row.id,
    stationId: row.stationId,
    type: row.type,
    payload: row.payload,
    protocolMessage: row.protocolMessage,
    occurredAt: row.occurredAt
  };
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly db: Database) {}

  async append(input: CreateEventInput): Promise<EventRecord> {
    const [row] = await this.db
      .insert(eventLogs)
      .values({
        stationId: input.stationId ?? null,
        type: input.type,
        payload: input.payload,
        protocolMessage: input.protocolMessage ?? false,
        occurredAt: input.occurredAt ?? new Date()
      })
      .returning();

    return toEventRecord(row!);
  }

  async listByStation(
    stationId: string,
    options: { after?: string; limit: number },
  ): Promise<EventRecord[]> {
    const afterRows = options.after === undefined
      ? []
      : await this.db
        .select({ id: eventLogs.id, occurredAt: eventLogs.occurredAt })
        .from(eventLogs)
        .where(eq(eventLogs.id, options.after))
        .limit(1);
    const afterCursor = afterRows[0];

    const rows = await this.db
      .select()
      .from(eventLogs)
      .where(
        afterCursor === undefined
          ? eq(eventLogs.stationId, stationId)
          : and(
            eq(eventLogs.stationId, stationId),
            or(
              gt(eventLogs.occurredAt, afterCursor.occurredAt),
              and(
                eq(eventLogs.occurredAt, afterCursor.occurredAt),
                gt(eventLogs.id, afterCursor.id),
              ),
            ),
          ),
      )
      .orderBy(asc(eventLogs.occurredAt), asc(eventLogs.id))
      .limit(options.limit);

    return rows.map(toEventRecord);
  }

  async trimStationEvents(stationId: string, keep: number): Promise<void> {
    const staleRows = await this.db
      .select({ id: eventLogs.id })
      .from(eventLogs)
      .where(eq(eventLogs.stationId, stationId))
      .orderBy(desc(eventLogs.occurredAt))
      .offset(keep);

    const staleIds = staleRows.map((row) => row.id);
    if (staleIds.length === 0) {
      return;
    }

    await this.db.delete(eventLogs).where(inArray(eventLogs.id, staleIds));
  }
}
