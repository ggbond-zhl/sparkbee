import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type {
  ActiveTransactionSamplesResponse,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import type {
  ChargingPointActorPersistedTransaction,
  ChargingPointActorTransactionStore,
} from "../../lib/chargingPointActor";
import {
  chargingSamples,
  chargingTransactions,
} from "../../db/schema";

export interface StartPersistedTransactionInput {
  chargingPointId: string;
  transactionId: string;
  ocppTransactionId?: number;
  evseId: number;
  connectorId: number;
  idTag: string;
  meterStartWh: number;
  startedAt: Date;
}

export class ChargingTransactionRepository {
  constructor(private readonly db: ServerDatabase) {}

  forChargingPoint(chargingPointId: string): ChargingPointActorTransactionStore {
    return {
      loadActive: () => withPersistenceRetry(
        () => this.loadActive(chargingPointId),
      ),
      saveStarted: (transaction) => withPersistenceRetry(() => this.start({
        chargingPointId,
        transactionId: transaction.transactionId,
        ocppTransactionId: transaction.ocppTransactionId,
        evseId: transaction.evseId,
        connectorId: transaction.connectorId,
        idTag: transaction.idTag,
        meterStartWh: transaction.meterStartWh,
        startedAt: transaction.startedAt,
      })),
      saveSample: (sample) => withPersistenceRetry(() =>
        this.recordSample(chargingPointId, {
          id: randomUUID(),
          resource: { transactionId: sample.transactionId },
          sampledAt: sample.sampledAt.toISOString(),
          meterWh: sample.meterWh,
          powerW: sample.powerW,
          currentA: sample.currentA,
          voltageV: sample.voltageV,
        })),
      saveEnded: (transaction) => withPersistenceRetry(() => this.end({
        chargingPointId,
        transactionId: transaction.transactionId,
        meterStopWh: transaction.meterStopWh,
        stoppedAt: transaction.stoppedAt,
      })),
    };
  }

  async loadActive(
    chargingPointId: string,
  ): Promise<ChargingPointActorPersistedTransaction[]> {
    const rows = await this.db
      .select()
      .from(chargingTransactions)
      .where(
        and(
          eq(chargingTransactions.chargingPointId, chargingPointId),
          isNull(chargingTransactions.endedAt),
        ),
      )
      .orderBy(asc(chargingTransactions.startedAt));

    return rows.map((row) => ({
      transactionId: row.transactionId,
      ...(row.ocppTransactionId === null
        ? {}
        : { ocppTransactionId: row.ocppTransactionId }),
      evseId: row.evseId,
      connectorId: row.connectorId,
      idTag: row.idTag,
      state: row.state as ChargingPointActorPersistedTransaction["state"],
      chargingState:
        row.chargingState as ChargingPointActorPersistedTransaction["chargingState"],
      meterStartWh: row.meterStartWh,
      latestMeterWh: row.latestMeterWh,
      startedAt: row.startedAt,
    }));
  }

  async listRecoverableChargingPointIds(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ chargingPointId: chargingTransactions.chargingPointId })
      .from(chargingTransactions)
      .where(isNull(chargingTransactions.endedAt));
    return rows.map((row) => row.chargingPointId);
  }

  async start(input: StartPersistedTransactionInput): Promise<void> {
    await this.db
      .insert(chargingTransactions)
      .values({
        chargingPointId: input.chargingPointId,
        transactionId: input.transactionId,
        ocppTransactionId: input.ocppTransactionId,
        evseId: input.evseId,
        connectorId: input.connectorId,
        idTag: input.idTag,
        state: "active",
        chargingState: "charging",
        meterStartWh: input.meterStartWh,
        latestMeterWh: input.meterStartWh,
        startedAt: input.startedAt,
      })
      .onConflictDoUpdate({
        target: [
          chargingTransactions.chargingPointId,
          chargingTransactions.transactionId,
        ],
        set: {
          ocppTransactionId: input.ocppTransactionId,
          state: "active",
          chargingState: "charging",
          latestMeterWh: input.meterStartWh,
          endedAt: null,
          updatedAt: new Date(),
        },
      });
  }

  async recordSample(
    chargingPointId: string,
    event: {
      id: string;
      resource: {
        transactionId: string;
      };
      sampledAt: string;
      meterWh: number;
      powerW: number;
      currentA: number;
      voltageV: number;
    },
    options: { requireActiveTransaction?: boolean } = {},
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [record] = await transaction
        .select({ id: chargingTransactions.id })
        .from(chargingTransactions)
        .where(
          and(
            eq(chargingTransactions.chargingPointId, chargingPointId),
            eq(
              chargingTransactions.transactionId,
              event.resource.transactionId,
            ),
            isNull(chargingTransactions.endedAt),
          ),
        )
        .limit(1);
      if (record === undefined) {
        if (options.requireActiveTransaction === false) {
          return;
        }
        throw new Error(
          `活动交易 ${event.resource.transactionId} 不存在，无法保存充电采样`,
        );
      }

      await transaction
        .insert(chargingSamples)
        .values({
          id: event.id,
          transactionRecordId: record.id,
          sampledAt: new Date(event.sampledAt),
          meterWh: event.meterWh,
          powerW: event.powerW,
          currentA: event.currentA,
          voltageV: event.voltageV,
        })
        .onConflictDoNothing();
      await transaction
        .update(chargingTransactions)
        .set({
          latestMeterWh: event.meterWh,
          updatedAt: new Date(),
        })
        .where(eq(chargingTransactions.id, record.id));
    });
  }

  async end(input: {
    chargingPointId: string;
    transactionId: string;
    meterStopWh: number;
    stoppedAt: Date;
  }): Promise<void> {
    await this.db
      .update(chargingTransactions)
      .set({
        state: "ended",
        chargingState: "idle",
        latestMeterWh: input.meterStopWh,
        endedAt: input.stoppedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chargingTransactions.chargingPointId, input.chargingPointId),
          eq(chargingTransactions.transactionId, input.transactionId),
          isNull(chargingTransactions.endedAt),
        ),
      );
  }

  async listActiveSamples(
    chargingPointId: string,
  ): Promise<ActiveTransactionSamplesResponse> {
    const rows = await this.db
      .select({
        transactionRecordId: chargingTransactions.id,
        transactionId: chargingTransactions.transactionId,
        evseId: chargingTransactions.evseId,
        connectorId: chargingTransactions.connectorId,
        sampleId: chargingSamples.id,
        sampledAt: chargingSamples.sampledAt,
        meterWh: chargingSamples.meterWh,
        powerW: chargingSamples.powerW,
        currentA: chargingSamples.currentA,
        voltageV: chargingSamples.voltageV,
      })
      .from(chargingTransactions)
      .leftJoin(
        chargingSamples,
        eq(chargingSamples.transactionRecordId, chargingTransactions.id),
      )
      .where(
        and(
          eq(chargingTransactions.chargingPointId, chargingPointId),
          isNull(chargingTransactions.endedAt),
        ),
      )
      .orderBy(
        asc(chargingTransactions.startedAt),
        asc(chargingSamples.sampledAt),
        asc(chargingSamples.id),
      );
    const itemsByRecord = new Map<
      string,
      ActiveTransactionSamplesResponse["items"][number]
    >();

    for (const row of rows) {
      const item = itemsByRecord.get(row.transactionRecordId) ?? {
        transactionId: row.transactionId,
        evseId: row.evseId,
        connectorId: row.connectorId,
        samples: [],
      };
      if (row.sampleId !== null && row.sampledAt !== null) {
        item.samples.push({
          id: row.sampleId,
          sampledAt: row.sampledAt.toISOString(),
          meterWh: row.meterWh!,
          powerW: row.powerW!,
          currentA: row.currentA!,
          voltageV: row.voltageV!,
        });
      }
      itemsByRecord.set(row.transactionRecordId, item);
    }

    return { items: [...itemsByRecord.values()] };
  }

  async deleteExpired(
    before: Date,
    limit: number,
  ): Promise<{ samples: number; transactions: number }> {
    const deletedSamples = await this.db.execute(sql`
      delete from ${chargingSamples}
      where id in (
        select id from ${chargingSamples}
        where ${chargingSamples.sampledAt} < ${before}
        order by ${chargingSamples.sampledAt}
        limit ${limit}
      )
      returning id
    `);
    const deletedTransactions = await this.db.execute(sql`
      delete from ${chargingTransactions}
      where id in (
        select id from ${chargingTransactions}
        where ${chargingTransactions.endedAt} < ${before}
        order by ${chargingTransactions.endedAt}
        limit ${limit}
      )
      returning id
    `);
    return {
      samples: deletedSamples.rows.length,
      transactions: deletedTransactions.rows.length,
    };
  }
}

async function withPersistenceRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}
