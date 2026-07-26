import type {
  ChargingPointActorPersistedTransaction,
  ChargingPointActorTransactionDeliveryRecord,
  ChargingPointActorTransactionDeliverySummary,
  ChargingPointActorTransactionStore,
} from "../../../chargingPointActor/types";

const ACTIVE_STATUSES = new Set(["pending", "in_flight", "retry_wait"]);

export class MemoryTransactionDeliveryStore
  implements ChargingPointActorTransactionStore {
  private readonly activeTransactions = new Map<
    string,
    ChargingPointActorPersistedTransaction
  >();
  private readonly ocppTransactionIds = new Map<string, number>();
  private readonly messages: ChargingPointActorTransactionDeliveryRecord[] = [];
  private nextSequence = 1n;

  async loadActive(): Promise<ChargingPointActorPersistedTransaction[]> {
    return [...this.activeTransactions.values()].map(cloneTransaction);
  }

  async start(
    input: Parameters<ChargingPointActorTransactionStore["start"]>[0],
  ): Promise<ChargingPointActorTransactionDeliveryRecord> {
    this.activeTransactions.set(
      input.transaction.transactionId,
      cloneTransaction(input.transaction),
    );
    return this.append({
      transactionId: input.transaction.transactionId,
      messageId: input.messageId,
      messageType: "start",
      payload: input.payload,
      occurredAt: input.transaction.startedAt,
    });
  }

  async recordSample(
    input: Parameters<ChargingPointActorTransactionStore["recordSample"]>[0],
  ): Promise<ChargingPointActorTransactionDeliveryRecord> {
    const transaction = this.activeTransactions.get(input.transactionId);
    if (transaction === undefined) {
      throw new Error(`活动交易 ${input.transactionId} 不存在`);
    }
    this.activeTransactions.set(input.transactionId, {
      ...transaction,
      latestMeterWh: input.meterWh,
    });
    return this.append({
      transactionId: input.transactionId,
      messageId: input.messageId,
      messageType: "meter_value",
      payload: input.payload,
      occurredAt: input.sampledAt,
    });
  }

  async end(
    input: Parameters<ChargingPointActorTransactionStore["end"]>[0],
  ): Promise<ChargingPointActorTransactionDeliveryRecord> {
    if (!this.activeTransactions.delete(input.transactionId)) {
      throw new Error(`活动交易 ${input.transactionId} 不存在`);
    }
    return this.append({
      transactionId: input.transactionId,
      messageId: input.messageId,
      messageType: "stop",
      payload: input.payload,
      occurredAt: input.stoppedAt,
    });
  }

  async listPending(): Promise<ChargingPointActorTransactionDeliveryRecord[]> {
    return this.messages
      .filter((message) => ACTIVE_STATUSES.has(message.status))
      .sort(compareSequence)
      .map(cloneRecord);
  }

  async claimHead(
    claimedAt: Date,
  ): Promise<ChargingPointActorTransactionDeliveryRecord | null> {
    const head = this.messages
      .filter((message) => ACTIVE_STATUSES.has(message.status))
      .sort(compareSequence)[0];
    if (
      head === undefined ||
      head.status === "in_flight" ||
      (head.status === "retry_wait" &&
        head.nextAttemptAt !== null &&
        head.nextAttemptAt > claimedAt)
    ) {
      return null;
    }
    head.status = "in_flight";
    head.attemptCount += 1;
    head.nextAttemptAt = null;
    head.inFlightAt = new Date(claimedAt);
    return cloneRecord(this.withBinding(head));
  }

  async recordSuccess(
    input: Parameters<ChargingPointActorTransactionStore["recordSuccess"]>[0],
  ): Promise<ChargingPointActorTransactionDeliveryRecord> {
    const current = this.requireInFlight(input.id);
    if (current.messageType === "start") {
      if (input.ocppTransactionId === undefined) {
        throw new Error("StartTransaction 成功时必须保存 CSMS transactionId");
      }
      this.ocppTransactionIds.set(current.transactionId, input.ocppTransactionId);
    }
    current.status = "delivered";
    current.inFlightAt = null;
    current.deliveredAt = new Date(input.deliveredAt);
    current.lastErrorCode = null;
    current.lastErrorMessage = null;
    return cloneRecord(this.withBinding(current));
  }

  async recordFailure(
    input: Parameters<ChargingPointActorTransactionStore["recordFailure"]>[0],
  ): Promise<ChargingPointActorTransactionDeliveryRecord> {
    const current = this.requireInFlight(input.id);
    this.applyFailure(current, input);
    return cloneRecord(this.withBinding(current));
  }

  async recoverInFlight(
    input: Parameters<ChargingPointActorTransactionStore["recoverInFlight"]>[0],
  ): Promise<ChargingPointActorTransactionDeliveryRecord[]> {
    return this.messages
      .filter((message) => message.status === "in_flight")
      .sort(compareSequence)
      .map((message) => {
        const retryFrom = message.inFlightAt ?? input.recoveredAt;
        this.applyFailure(message, {
          ...input,
          failedAt: input.recoveredAt,
          retryFrom,
        });
        return cloneRecord(this.withBinding(message));
      });
  }

  async getSummary(): Promise<ChargingPointActorTransactionDeliverySummary> {
    const active = this.messages.filter((message) => ACTIVE_STATUSES.has(message.status));
    return {
      pendingCount: this.messages.filter((message) => message.status === "pending").length,
      inFlightCount: this.messages.filter((message) => message.status === "in_flight").length,
      retryWaitCount: this.messages.filter((message) => message.status === "retry_wait").length,
      failedCount: this.messages.filter((message) => message.status === "failed").length,
      oldestPendingAt: active.length === 0
        ? null
        : new Date(Math.min(...active.map((message) => message.occurredAt.getTime()))),
    };
  }

  private append(input: {
    transactionId: string;
    messageId: string;
    messageType: ChargingPointActorTransactionDeliveryRecord["messageType"];
    payload: Record<string, unknown>;
    occurredAt: Date;
  }): ChargingPointActorTransactionDeliveryRecord {
    const record: ChargingPointActorTransactionDeliveryRecord = {
      id: input.messageId,
      transactionId: input.transactionId,
      ocppTransactionId: this.ocppTransactionIds.get(input.transactionId) ?? null,
      deliverySequence: this.nextSequence,
      messageId: input.messageId,
      messageType: input.messageType,
      payload: structuredClone(input.payload),
      occurredAt: new Date(input.occurredAt),
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: null,
      inFlightAt: null,
      deliveredAt: null,
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    };
    this.nextSequence += 1n;
    this.messages.push(record);
    return cloneRecord(record);
  }

  private requireInFlight(id: string): ChargingPointActorTransactionDeliveryRecord {
    const current = this.messages.find((message) => message.id === id);
    if (current === undefined || current.status !== "in_flight") {
      throw new Error("只有发送中的交易交付消息可以推进状态");
    }
    return current;
  }

  private applyFailure(
    current: ChargingPointActorTransactionDeliveryRecord,
    input: {
      failedAt: Date;
      maxAttempts: number;
      retryIntervalSec: number;
      errorCode: string;
      errorMessage: string;
      retryFrom?: Date;
    },
  ): void {
    const exhausted = current.attemptCount >= input.maxAttempts;
    current.status = exhausted ? "failed" : "retry_wait";
    current.nextAttemptAt = exhausted
      ? null
      : new Date(
          (input.retryFrom ?? input.failedAt).getTime() +
            input.retryIntervalSec * current.attemptCount * 1_000,
        );
    current.inFlightAt = null;
    current.failedAt = exhausted ? new Date(input.failedAt) : null;
    current.lastErrorCode = input.errorCode;
    current.lastErrorMessage = input.errorMessage;
    if (exhausted && current.messageType === "start") {
      this.ocppTransactionIds.set(current.transactionId, -1);
    }
  }

  private withBinding(
    record: ChargingPointActorTransactionDeliveryRecord,
  ): ChargingPointActorTransactionDeliveryRecord {
    record.ocppTransactionId = this.ocppTransactionIds.get(record.transactionId) ?? null;
    return record;
  }
}

function compareSequence(
  left: ChargingPointActorTransactionDeliveryRecord,
  right: ChargingPointActorTransactionDeliveryRecord,
): number {
  return left.deliverySequence < right.deliverySequence ? -1 : 1;
}

function cloneTransaction(
  transaction: ChargingPointActorPersistedTransaction,
): ChargingPointActorPersistedTransaction {
  return { ...transaction, startedAt: new Date(transaction.startedAt) };
}

function cloneRecord(
  record: ChargingPointActorTransactionDeliveryRecord,
): ChargingPointActorTransactionDeliveryRecord {
  return {
    ...record,
    payload: structuredClone(record.payload),
    occurredAt: new Date(record.occurredAt),
    nextAttemptAt: cloneNullableDate(record.nextAttemptAt),
    inFlightAt: cloneNullableDate(record.inFlightAt),
    deliveredAt: cloneNullableDate(record.deliveredAt),
    failedAt: cloneNullableDate(record.failedAt),
  };
}

function cloneNullableDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value);
}
