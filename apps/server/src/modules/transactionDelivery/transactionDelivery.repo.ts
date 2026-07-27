import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type {
  ChargingPointActorMeterValueDeliveryPayload,
  ChargingPointActorStartTransactionDeliveryPayload,
  ChargingPointActorStopTransactionDeliveryPayload,
  ChargingPointActorTransactionDeliveryRecord,
  ChargingPointActorTransactionStore,
} from "../../lib/chargingPointActor";

import type { ServerDatabase } from "../../db";
import {
  chargingSamples,
  chargingTransactions,
  transactionDeliveryMessages,
  transactionDeliverySequences,
} from "../../db/schema";
import { ChargingTransactionRepository } from "../chargingTransaction/chargingTransaction.repo";

const ACTIVE_DELIVERY_STATUSES = [
  "pending",
  "in_flight",
  "retry_wait",
] as const;

export type TransactionDeliveryStatus =
  | (typeof ACTIVE_DELIVERY_STATUSES)[number]
  | "delivered"
  | "failed";

export type TransactionDeliveryRecord =
  ChargingPointActorTransactionDeliveryRecord & {
  chargingPointId: string;
};

export interface StartTransactionWithDeliveryInput {
  chargingPointId: string;
  transactionId: string;
  evseId: number;
  connectorId: number;
  idTag: string;
  meterStartWh: number;
  startedAt: Date;
  messageId: string;
  payload: Record<string, unknown>;
}

export interface RecordSampleWithDeliveryInput {
  chargingPointId: string;
  transactionId: string;
  sampleId: string;
  sampledAt: Date;
  meterWh: number;
  powerW: number;
  currentA: number;
  voltageV: number;
  messageId: string;
  payload: Record<string, unknown>;
}

export interface EndTransactionWithDeliveryInput {
  chargingPointId: string;
  transactionId: string;
  stoppedAt: Date;
  meterStopWh: number;
  messageId: string;
  payload: Record<string, unknown>;
}

export interface RecordDeliveryFailureInput {
  id: string;
  failedAt: Date;
  maxAttempts: number;
  retryIntervalSec: number;
  errorCode: string;
  errorMessage: string;
}

export interface RecordDeliverySuccessInput {
  id: string;
  deliveredAt: Date;
  ocppTransactionId?: number;
}

export interface RecoverInFlightDeliveriesInput {
  chargingPointId: string;
  recoveredAt: Date;
  maxAttempts: number;
  retryIntervalSec: number;
  errorCode: string;
  errorMessage: string;
}

export interface ListTransactionDeliveriesInput {
  chargingPointId: string;
  limit: number;
  before?: bigint;
  status?: TransactionDeliveryStatus;
  messageType?: TransactionDeliveryRecord["messageType"];
}

export interface TransactionDeliveryPage {
  items: TransactionDeliveryRecord[];
  previousCursor: bigint | null;
}

export interface TransactionDeliverySummary {
  pendingCount: number;
  inFlightCount: number;
  retryWaitCount: number;
  failedCount: number;
  oldestPendingAt: Date | null;
}

export class TransactionDeliveryRepository {
  constructor(private readonly db: ServerDatabase) {}

  forChargingPoint(chargingPointId: string): ChargingPointActorTransactionStore {
    return {
      loadActive: () =>
        new ChargingTransactionRepository(this.db).loadActive(chargingPointId),
      start: (input) => this.start({
        chargingPointId,
        transactionId: input.transaction.transactionId,
        evseId: input.transaction.evseId,
        connectorId: input.transaction.connectorId,
        idTag: input.transaction.idTag,
        meterStartWh: input.transaction.meterStartWh,
        startedAt: input.transaction.startedAt,
        messageId: input.messageId,
        payload: input.payload,
      }),
      recordSample: (input) => this.recordSample({
        chargingPointId,
        ...input,
      }),
      end: (input) => this.end({ chargingPointId, ...input }),
      listPending: () => this.listPending(chargingPointId),
      claimHead: (claimedAt) => this.claimHead(chargingPointId, claimedAt),
      recordSuccess: (input) => this.recordSuccess(input),
      recordFailure: (input) => this.recordFailure(input),
      recoverInFlight: (input) => this.recoverInFlight({
        chargingPointId,
        ...input,
      }),
      getSummary: () => this.getSummary(chargingPointId),
    };
  }

  async start(
    input: StartTransactionWithDeliveryInput,
  ): Promise<TransactionDeliveryRecord> {
    return this.db.transaction(async (transaction) => {
      const [transactionRecord] = await transaction
        .insert(chargingTransactions)
        .values({
          chargingPointId: input.chargingPointId,
          transactionId: input.transactionId,
          evseId: input.evseId,
          connectorId: input.connectorId,
          idTag: input.idTag,
          state: "active",
          chargingState: "charging",
          meterStartWh: input.meterStartWh,
          latestMeterWh: input.meterStartWh,
          startedAt: input.startedAt,
        })
        .returning();
      if (transactionRecord === undefined) {
        throw new Error("创建本地交易失败");
      }

      const deliverySequence = await this.allocateSequence(
        transaction,
        input.chargingPointId,
      );
      const [delivery] = await transaction
        .insert(transactionDeliveryMessages)
        .values({
          chargingPointId: input.chargingPointId,
          transactionRecordId: transactionRecord.id,
          deliverySequence,
          messageId: input.messageId,
          messageType: "start",
          payload: input.payload,
          occurredAt: input.startedAt,
        })
        .returning();
      if (delivery === undefined) {
        throw new Error("创建交易交付消息失败");
      }

      return this.toRecord(delivery, input.transactionId, null);
    });
  }

  async recordSample(
    input: RecordSampleWithDeliveryInput,
  ): Promise<TransactionDeliveryRecord> {
    return this.db.transaction(async (transaction) => {
      const [transactionRecord] = await transaction
        .select({
          id: chargingTransactions.id,
          transactionId: chargingTransactions.transactionId,
          ocppTransactionId: chargingTransactions.ocppTransactionId,
        })
        .from(chargingTransactions)
        .where(
          and(
            eq(chargingTransactions.chargingPointId, input.chargingPointId),
            eq(chargingTransactions.transactionId, input.transactionId),
            sql`${chargingTransactions.endedAt} is null`,
          ),
        )
        .limit(1);
      if (transactionRecord === undefined) {
        throw new Error(`活动交易 ${input.transactionId} 不存在`);
      }

      await transaction.insert(chargingSamples).values({
        id: input.sampleId,
        transactionRecordId: transactionRecord.id,
        sampledAt: input.sampledAt,
        meterWh: input.meterWh,
        powerW: input.powerW,
        currentA: input.currentA,
        voltageV: input.voltageV,
      });
      await transaction
        .update(chargingTransactions)
        .set({ latestMeterWh: input.meterWh, updatedAt: new Date() })
        .where(eq(chargingTransactions.id, transactionRecord.id));

      const deliverySequence = await this.allocateSequence(
        transaction,
        input.chargingPointId,
      );
      const [delivery] = await transaction
        .insert(transactionDeliveryMessages)
        .values({
          chargingPointId: input.chargingPointId,
          transactionRecordId: transactionRecord.id,
          deliverySequence,
          messageId: input.messageId,
          messageType: "meter_value",
          payload: input.payload,
          occurredAt: input.sampledAt,
        })
        .returning();
      if (delivery === undefined) {
        throw new Error("创建采样交付消息失败");
      }

      return this.toRecord(
        delivery,
        transactionRecord.transactionId,
        transactionRecord.ocppTransactionId,
      );
    });
  }

  async end(
    input: EndTransactionWithDeliveryInput,
  ): Promise<TransactionDeliveryRecord> {
    return this.db.transaction(async (transaction) => {
      const [transactionRecord] = await transaction
        .select({
          id: chargingTransactions.id,
          transactionId: chargingTransactions.transactionId,
          ocppTransactionId: chargingTransactions.ocppTransactionId,
        })
        .from(chargingTransactions)
        .where(
          and(
            eq(chargingTransactions.chargingPointId, input.chargingPointId),
            eq(chargingTransactions.transactionId, input.transactionId),
            sql`${chargingTransactions.endedAt} is null`,
          ),
        )
        .limit(1);
      if (transactionRecord === undefined) {
        throw new Error(`活动交易 ${input.transactionId} 不存在`);
      }

      await transaction
        .update(chargingTransactions)
        .set({
          state: "ended",
          chargingState: "idle",
          latestMeterWh: input.meterStopWh,
          endedAt: input.stoppedAt,
          updatedAt: new Date(),
        })
        .where(eq(chargingTransactions.id, transactionRecord.id));

      const deliverySequence = await this.allocateSequence(
        transaction,
        input.chargingPointId,
      );
      const [delivery] = await transaction
        .insert(transactionDeliveryMessages)
        .values({
          chargingPointId: input.chargingPointId,
          transactionRecordId: transactionRecord.id,
          deliverySequence,
          messageId: input.messageId,
          messageType: "stop",
          payload: input.payload,
          occurredAt: input.stoppedAt,
        })
        .returning();
      if (delivery === undefined) {
        throw new Error("创建停止交付消息失败");
      }

      return this.toRecord(
        delivery,
        transactionRecord.transactionId,
        transactionRecord.ocppTransactionId,
      );
    });
  }

  async listPending(chargingPointId: string): Promise<TransactionDeliveryRecord[]> {
    const rows = await this.db
      .select({
        delivery: transactionDeliveryMessages,
        transactionId: chargingTransactions.transactionId,
        ocppTransactionId: chargingTransactions.ocppTransactionId,
      })
      .from(transactionDeliveryMessages)
      .innerJoin(
        chargingTransactions,
        eq(transactionDeliveryMessages.transactionRecordId, chargingTransactions.id),
      )
      .where(
        and(
          eq(transactionDeliveryMessages.chargingPointId, chargingPointId),
          inArray(transactionDeliveryMessages.status, [...ACTIVE_DELIVERY_STATUSES]),
        ),
      )
      .orderBy(asc(transactionDeliveryMessages.deliverySequence));

    return rows.map((row) =>
      this.toRecord(row.delivery, row.transactionId, row.ocppTransactionId)
    );
  }

  async claimHead(
    chargingPointId: string,
    claimedAt: Date,
  ): Promise<TransactionDeliveryRecord | null> {
    return this.db.transaction(async (transaction) => {
      const [head] = await transaction
        .select()
        .from(transactionDeliveryMessages)
        .where(
          and(
            eq(transactionDeliveryMessages.chargingPointId, chargingPointId),
            inArray(transactionDeliveryMessages.status, [
              ...ACTIVE_DELIVERY_STATUSES,
            ]),
          ),
        )
        .orderBy(asc(transactionDeliveryMessages.deliverySequence))
        .limit(1)
        .for("update");
      if (
        head === undefined ||
        head.status === "in_flight" ||
        (head.status === "retry_wait" &&
          head.nextAttemptAt !== null &&
          head.nextAttemptAt > claimedAt)
      ) {
        return null;
      }

      const [claimed] = await transaction
        .update(transactionDeliveryMessages)
        .set({
          status: "in_flight",
          attemptCount: head.attemptCount + 1,
          nextAttemptAt: null,
          inFlightAt: claimedAt,
          updatedAt: claimedAt,
        })
        .where(eq(transactionDeliveryMessages.id, head.id))
        .returning();
      if (claimed === undefined) {
        throw new Error("领取交易交付队头失败");
      }

      const [transactionRecord] = await transaction
        .select({
          transactionId: chargingTransactions.transactionId,
          ocppTransactionId: chargingTransactions.ocppTransactionId,
        })
        .from(chargingTransactions)
        .where(eq(chargingTransactions.id, claimed.transactionRecordId))
        .limit(1);
      if (transactionRecord === undefined) {
        throw new Error("交易交付消息关联的交易不存在");
      }

      return this.toRecord(
        claimed,
        transactionRecord.transactionId,
        transactionRecord.ocppTransactionId,
      );
    });
  }

  async recordFailure(
    input: RecordDeliveryFailureInput,
  ): Promise<TransactionDeliveryRecord> {
    return this.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(transactionDeliveryMessages)
        .where(eq(transactionDeliveryMessages.id, input.id))
        .limit(1)
        .for("update");
      if (current === undefined || current.status !== "in_flight") {
        throw new Error("只有发送中的交易交付消息可以记录失败");
      }

      const exhausted = current.attemptCount >= input.maxAttempts;
      const nextAttemptAt = exhausted
        ? null
        : new Date(
            input.failedAt.getTime() +
              input.retryIntervalSec * current.attemptCount * 1_000,
          );
      const [updated] = await transaction
        .update(transactionDeliveryMessages)
        .set({
          status: exhausted ? "failed" : "retry_wait",
          nextAttemptAt,
          inFlightAt: null,
          failedAt: exhausted ? input.failedAt : null,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage,
          updatedAt: input.failedAt,
        })
        .where(eq(transactionDeliveryMessages.id, current.id))
        .returning();
      if (updated === undefined) {
        throw new Error("更新交易交付失败状态失败");
      }

      if (exhausted && current.messageType === "start") {
        await transaction
          .update(chargingTransactions)
          .set({ ocppTransactionId: -1, updatedAt: input.failedAt })
          .where(
            and(
              eq(chargingTransactions.id, current.transactionRecordId),
              sql`${chargingTransactions.ocppTransactionId} is null`,
            ),
          );
      }

      const [transactionRecord] = await transaction
        .select({
          transactionId: chargingTransactions.transactionId,
          ocppTransactionId: chargingTransactions.ocppTransactionId,
        })
        .from(chargingTransactions)
        .where(eq(chargingTransactions.id, updated.transactionRecordId))
        .limit(1);
      if (transactionRecord === undefined) {
        throw new Error("交易交付消息关联的交易不存在");
      }

      return this.toRecord(
        updated,
        transactionRecord.transactionId,
        transactionRecord.ocppTransactionId,
      );
    });
  }

  async recordSuccess(
    input: RecordDeliverySuccessInput,
  ): Promise<TransactionDeliveryRecord> {
    return this.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(transactionDeliveryMessages)
        .where(eq(transactionDeliveryMessages.id, input.id))
        .limit(1)
        .for("update");
      if (current === undefined || current.status !== "in_flight") {
        throw new Error("只有发送中的交易交付消息可以记录成功");
      }
      if (
        current.messageType === "start" &&
        (!Number.isInteger(input.ocppTransactionId) ||
          input.ocppTransactionId === undefined)
      ) {
        throw new Error("StartTransaction 成功时必须保存 CSMS transactionId");
      }

      if (current.messageType === "start") {
        await transaction
          .update(chargingTransactions)
          .set({
            ocppTransactionId: input.ocppTransactionId,
            updatedAt: input.deliveredAt,
          })
          .where(eq(chargingTransactions.id, current.transactionRecordId));
      }

      const [updated] = await transaction
        .update(transactionDeliveryMessages)
        .set({
          status: "delivered",
          nextAttemptAt: null,
          inFlightAt: null,
          deliveredAt: input.deliveredAt,
          failedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: input.deliveredAt,
        })
        .where(eq(transactionDeliveryMessages.id, current.id))
        .returning();
      if (updated === undefined) {
        throw new Error("更新交易交付成功状态失败");
      }

      const [transactionRecord] = await transaction
        .select({
          transactionId: chargingTransactions.transactionId,
          ocppTransactionId: chargingTransactions.ocppTransactionId,
        })
        .from(chargingTransactions)
        .where(eq(chargingTransactions.id, updated.transactionRecordId))
        .limit(1);
      if (transactionRecord === undefined) {
        throw new Error("交易交付消息关联的交易不存在");
      }

      return this.toRecord(
        updated,
        transactionRecord.transactionId,
        transactionRecord.ocppTransactionId,
      );
    });
  }

  async recoverInFlight(
    input: RecoverInFlightDeliveriesInput,
  ): Promise<TransactionDeliveryRecord[]> {
    return this.db.transaction(async (transaction) => {
      const interrupted = await transaction
        .select()
        .from(transactionDeliveryMessages)
        .where(
          and(
            eq(
              transactionDeliveryMessages.chargingPointId,
              input.chargingPointId,
            ),
            eq(transactionDeliveryMessages.status, "in_flight"),
          ),
        )
        .orderBy(asc(transactionDeliveryMessages.deliverySequence))
        .for("update");
      const recovered: TransactionDeliveryRecord[] = [];

      for (const current of interrupted) {
        const exhausted = current.attemptCount >= input.maxAttempts;
        const retryFrom = current.inFlightAt ?? input.recoveredAt;
        const nextAttemptAt = exhausted
          ? null
          : new Date(
              retryFrom.getTime() +
                input.retryIntervalSec * current.attemptCount * 1_000,
            );
        const [updated] = await transaction
          .update(transactionDeliveryMessages)
          .set({
            status: exhausted ? "failed" : "retry_wait",
            nextAttemptAt,
            inFlightAt: null,
            failedAt: exhausted ? input.recoveredAt : null,
            lastErrorCode: input.errorCode,
            lastErrorMessage: input.errorMessage,
            updatedAt: input.recoveredAt,
          })
          .where(eq(transactionDeliveryMessages.id, current.id))
          .returning();
        if (updated === undefined) {
          throw new Error("恢复交易交付发送状态失败");
        }

        if (exhausted && current.messageType === "start") {
          await transaction
            .update(chargingTransactions)
            .set({ ocppTransactionId: -1, updatedAt: input.recoveredAt })
            .where(
              and(
                eq(chargingTransactions.id, current.transactionRecordId),
                sql`${chargingTransactions.ocppTransactionId} is null`,
              ),
            );
        }

        const [transactionRecord] = await transaction
          .select({
            transactionId: chargingTransactions.transactionId,
            ocppTransactionId: chargingTransactions.ocppTransactionId,
          })
          .from(chargingTransactions)
          .where(eq(chargingTransactions.id, updated.transactionRecordId))
          .limit(1);
        if (transactionRecord === undefined) {
          throw new Error("交易交付消息关联的交易不存在");
        }
        recovered.push(this.toRecord(
          updated,
          transactionRecord.transactionId,
          transactionRecord.ocppTransactionId,
        ));
      }

      return recovered;
    });
  }

  async listPage(
    input: ListTransactionDeliveriesInput,
  ): Promise<TransactionDeliveryPage> {
    const rows = await this.db
      .select({
        delivery: transactionDeliveryMessages,
        transactionId: chargingTransactions.transactionId,
        ocppTransactionId: chargingTransactions.ocppTransactionId,
      })
      .from(transactionDeliveryMessages)
      .innerJoin(
        chargingTransactions,
        eq(transactionDeliveryMessages.transactionRecordId, chargingTransactions.id),
      )
      .where(and(
        eq(transactionDeliveryMessages.chargingPointId, input.chargingPointId),
        input.before === undefined
          ? undefined
          : lt(transactionDeliveryMessages.deliverySequence, input.before),
        input.status === undefined
          ? undefined
          : eq(transactionDeliveryMessages.status, input.status),
        input.messageType === undefined
          ? undefined
          : eq(transactionDeliveryMessages.messageType, input.messageType),
      ))
      .orderBy(desc(transactionDeliveryMessages.deliverySequence))
      .limit(input.limit + 1);
    const hasPreviousPage = rows.length > input.limit;
    const items = rows.slice(0, input.limit).map((row) => this.toRecord(
      row.delivery,
      row.transactionId,
      row.ocppTransactionId,
    ));

    return {
      items,
      previousCursor: hasPreviousPage
        ? items.at(-1)?.deliverySequence ?? null
        : null,
    };
  }

  async getSummary(
    chargingPointId: string,
  ): Promise<TransactionDeliverySummary> {
    const [summary] = await this.db
      .select({
        pendingCount: sql<number>`count(*) filter (
          where ${transactionDeliveryMessages.status} = 'pending'
        )::integer`,
        inFlightCount: sql<number>`count(*) filter (
          where ${transactionDeliveryMessages.status} = 'in_flight'
        )::integer`,
        retryWaitCount: sql<number>`count(*) filter (
          where ${transactionDeliveryMessages.status} = 'retry_wait'
        )::integer`,
        failedCount: sql<number>`count(*) filter (
          where ${transactionDeliveryMessages.status} = 'failed'
        )::integer`,
        oldestPendingAt: sql<Date | null>`min(${transactionDeliveryMessages.occurredAt}) filter (
          where ${transactionDeliveryMessages.status} in ('pending', 'in_flight', 'retry_wait')
        )`.mapWith(transactionDeliveryMessages.occurredAt),
      })
      .from(transactionDeliveryMessages)
      .where(eq(transactionDeliveryMessages.chargingPointId, chargingPointId));

    return summary ?? {
      pendingCount: 0,
      inFlightCount: 0,
      retryWaitCount: 0,
      failedCount: 0,
      oldestPendingAt: null,
    };
  }

  async deleteTerminalBefore(before: Date, limit: number): Promise<number> {
    const deleted = await this.db.execute(sql`
      delete from ${transactionDeliveryMessages}
      where ${transactionDeliveryMessages.id} in (
        select ${transactionDeliveryMessages.id}
        from ${transactionDeliveryMessages}
        where (
          ${transactionDeliveryMessages.status} = 'delivered'
          and ${transactionDeliveryMessages.deliveredAt} < ${before}
        ) or (
          ${transactionDeliveryMessages.status} = 'failed'
          and ${transactionDeliveryMessages.failedAt} < ${before}
        )
        order by coalesce(
          ${transactionDeliveryMessages.deliveredAt},
          ${transactionDeliveryMessages.failedAt}
        ), ${transactionDeliveryMessages.id}
        limit ${limit}
      )
      returning ${transactionDeliveryMessages.id}
    `);
    return deleted.rows.length;
  }

  private async allocateSequence(
    transaction: Parameters<Parameters<ServerDatabase["transaction"]>[0]>[0],
    chargingPointId: string,
  ): Promise<bigint> {
    await transaction
      .insert(transactionDeliverySequences)
      .values({ chargingPointId })
      .onConflictDoNothing();
    const [row] = await transaction
      .update(transactionDeliverySequences)
      .set({
        nextSequence: sql`${transactionDeliverySequences.nextSequence} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(transactionDeliverySequences.chargingPointId, chargingPointId))
      .returning();
    if (row === undefined) {
      throw new Error("分配交易交付序号失败");
    }

    return row.nextSequence - 1n;
  }

  private toRecord(
    row: typeof transactionDeliveryMessages.$inferSelect,
    transactionId: string,
    ocppTransactionId: number | null,
  ): TransactionDeliveryRecord & ChargingPointActorTransactionDeliveryRecord {
    const base = {
      ...row,
      transactionId,
      ocppTransactionId,
      status: row.status as TransactionDeliveryStatus,
    };
    if (row.messageType === "start") {
      return {
        ...base,
        messageType: "start",
        payload: row.payload as unknown as ChargingPointActorStartTransactionDeliveryPayload,
      };
    }
    if (row.messageType === "meter_value") {
      return {
        ...base,
        messageType: "meter_value",
        payload: row.payload as unknown as ChargingPointActorMeterValueDeliveryPayload,
      };
    }
    return {
      ...base,
      messageType: "stop",
      payload: row.payload as unknown as ChargingPointActorStopTransactionDeliveryPayload,
    };
  }
}
