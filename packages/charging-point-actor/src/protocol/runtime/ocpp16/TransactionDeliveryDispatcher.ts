import type {
  ChargingPointActorTransactionDeliveryRecord,
  ChargingPointActorTransactionDeliverySummary,
} from "../../../chargingPointActor/types";
import type { Ocpp16RequestOf } from "../../validator/Ocpp16";

import { getOcpp16AuthorizationPolicy } from "./Ocpp16AuthorizationPolicy";
import { createMeterValue, toOcppDate } from "./payloadBuilders";
import { parseStopTransactionResponse } from "./responseParsers";
import { toRequestErrorInfo } from "./requestErrors";
import type { Ocpp16RuntimeContext } from "./state";
import type { Ocpp16StartTransactionCallResult } from "./types";
import { sendStartTransaction } from "./actions/transactionStart";
import { stopTransaction } from "./actions/stopTransaction";
import { sendStatusNotification } from "./actions/statusNotification";
import { mapConnectorFlowStatus } from "./mappings";
import { emitTransactionDeliveryChanged } from "./transactionDeliveryEvents";
import { resolveConnectorOcppStatus } from "./actions/connectorStatusTransition";
import { emitAuthorizationStatus } from "./events";

export class TransactionDeliveryDispatcher {
  private drainPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly context: Ocpp16RuntimeContext) {}

  wake(): void {
    void this.drain();
  }

  drain(): Promise<void> {
    if (this.drainPromise !== null) {
      return this.drainPromise;
    }
    this.clearRetryTimer();
    this.drainPromise = this.run().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  async recoverInterrupted(): Promise<ChargingPointActorTransactionDeliveryRecord[]> {
    const records = await this.context.transactionStore.recoverInFlight({
      recoveredAt: this.context.clock(),
      ...this.retryConfiguration(),
      errorCode: "ProcessRestarted",
      errorMessage: "发送结果因进程重启未知",
    });
    for (const record of records) {
      emitTransactionDeliveryChanged(this.context, record, "in_flight");
    }
    return records;
  }

  summary(): Promise<ChargingPointActorTransactionDeliverySummary> {
    return this.context.transactionStore.getSummary();
  }

  stop(): void {
    this.clearRetryTimer();
  }

  private async run(): Promise<void> {
    while (this.canSend()) {
      const claimedAt = this.context.clock();
      const delivery = await this.context.transactionStore.claimHead(claimedAt);
      if (delivery === null) {
        await this.scheduleRetry();
        return;
      }
      emitTransactionDeliveryChanged(
        this.context,
        delivery,
        delivery.attemptCount === 1 ? "pending" : "retry_wait",
      );

      const terminal = await this.deliver(delivery);
      if (!terminal) {
        await this.scheduleRetry();
        return;
      }
    }
  }

  private canSend(): boolean {
    return this.context.session.isConnected() &&
      this.context.registrationStatus === "Accepted";
  }

  private async deliver(
    delivery: ChargingPointActorTransactionDeliveryRecord,
  ): Promise<boolean> {
    try {
      if (delivery.messageType === "start") {
        return this.deliverStart(delivery);
      }

      const action = delivery.messageType === "meter_value"
        ? "MeterValues"
        : "StopTransaction";
      if (delivery.messageType === "stop") {
        await sendStatusNotification(this.context, {
          connectorId: readNumber(delivery.payload, "connectorId"),
          status: mapConnectorFlowStatus("finishing"),
          at: delivery.occurredAt,
        });
      }
      const result = await this.context.session.request(
        action,
        this.createPayload(delivery),
        { messageId: delivery.messageId },
      );
      if (result.kind === "error") {
        const terminal = await this.fail(
          delivery,
          result.errorCode,
          result.errorMessage,
        );
        if (delivery.messageType === "stop") {
          await this.reportPostStopStatus(delivery);
        }
        return terminal;
      }

      const deliveredAt = this.context.clock();
      const updated = await this.context.transactionStore.recordSuccess({
        id: delivery.id,
        deliveredAt,
      });
      emitTransactionDeliveryChanged(this.context, updated, "in_flight");
      if (delivery.messageType === "stop") {
        const response = parseStopTransactionResponse(result.payload);
        const idTag = readOptionalString(delivery.payload, "authorizationIdTag");
        const evseId = readOptionalNumber(delivery.payload, "evseId");
        if (idTag !== null && evseId !== null) {
          await getOcpp16AuthorizationPolicy(this.context)
            .absorbStopTransactionResult({
              evseId,
              idTag,
              authorizationStatus: response.idTagInfoStatus,
              expiryDate: response.expiryDate,
              parentIdTag: response.parentIdTag,
              receivedAt: deliveredAt,
            });
        }
        await this.reportPostStopStatus(delivery);
      }
      return true;
    } catch (cause) {
      const error = toRequestErrorInfo(cause);
      return this.fail(delivery, error.errorCode, error.errorMessage);
    }
  }

  private async deliverStart(
    delivery: ChargingPointActorTransactionDeliveryRecord,
  ): Promise<boolean> {
    const result = await sendStartTransaction(this.context, {
      connectorId: readNumber(delivery.payload, "connectorId"),
      idTag: readString(delivery.payload, "idTag"),
      meterStartWh: readNumber(delivery.payload, "meterStartWh"),
      ...(readOptionalNumber(delivery.payload, "reservationId") === null
        ? {}
        : { reservationId: readNumber(delivery.payload, "reservationId") }),
      at: delivery.occurredAt,
    }, { messageId: delivery.messageId });
    if (result.outcome === "Failed") {
      return this.fail(delivery, result.errorCode, result.errorMessage);
    }

    const updated = await this.context.transactionStore.recordSuccess({
      id: delivery.id,
      deliveredAt: result.receivedAt,
      ocppTransactionId: result.ocppTransactionId,
    });
    emitTransactionDeliveryChanged(this.context, updated, "in_flight");
    this.context.ocppTransactionIds.set(
      delivery.transactionId,
      updated.ocppTransactionId ?? result.ocppTransactionId,
    );
    const evseId = readNumber(delivery.payload, "evseId");
    const connectorId = readNumber(delivery.payload, "connectorId");
    await getOcpp16AuthorizationPolicy(this.context)
      .absorbStartTransactionResult({
        evseId,
        result,
      });
    emitAuthorizationStatus(this.context, {
      idTag: result.idTag,
      evseId,
      connectorId,
      authorizationStatus: result.authorizationStatus,
      source: "online",
      occurredAt: result.receivedAt,
    });
    if (result.outcome === "Accepted") {
      await sendStatusNotification(this.context, {
        connectorId,
        status: mapConnectorFlowStatus("charging"),
        at: result.receivedAt,
      });
    } else if (this.context.configurationFacts.shouldStopTransactionOnInvalidId()) {
      await stopTransaction(this.context, {
        transactionId: delivery.transactionId,
        reason: "deauthorized",
        stoppedAt: result.receivedAt,
      });
    }
    return true;
  }

  private async reportPostStopStatus(
    delivery: ChargingPointActorTransactionDeliveryRecord,
  ): Promise<void> {
    const connectorRef = {
      evseId: readNumber(delivery.payload, "evseId"),
      connectorId: readNumber(delivery.payload, "connectorId"),
    };
    await sendStatusNotification(this.context, {
      connectorId: connectorRef.connectorId,
      status: resolveConnectorOcppStatus(this.context, connectorRef),
      at: this.context.clock(),
    });
  }

  private createPayload(
    delivery: ChargingPointActorTransactionDeliveryRecord,
  ): Ocpp16RequestOf<"MeterValues"> | Ocpp16RequestOf<"StopTransaction"> {
    const ocppTransactionId = delivery.ocppTransactionId;
    if (ocppTransactionId === null) {
      throw new Error(`交易 ${delivery.transactionId} 尚无 OCPP transactionId`);
    }
    if (delivery.messageType === "meter_value") {
      return {
        connectorId: readNumber(delivery.payload, "connectorId"),
        transactionId: ocppTransactionId,
        meterValue: [createMeterValue(
          readNumber(delivery.payload, "meterWh"),
          delivery.occurredAt,
          "Sample.Periodic",
          {
            powerW: readNumber(delivery.payload, "powerW"),
            currentA: readNumber(delivery.payload, "currentA"),
            voltageV: readNumber(delivery.payload, "voltageV"),
          },
        )],
      } satisfies Ocpp16RequestOf<"MeterValues">;
    }

    const reason = readOptionalString(delivery.payload, "reason");
    const idTag = readOptionalString(delivery.payload, "idTag");
    return {
      transactionId: ocppTransactionId,
      meterStop: readNumber(delivery.payload, "meterStopWh"),
      timestamp: toOcppDate(delivery.occurredAt),
      ...(reason === null ? {} : { reason }),
      ...(idTag === null ? {} : { idTag }),
      transactionData: [createMeterValue(
        readNumber(delivery.payload, "meterStopWh"),
        delivery.occurredAt,
        "Transaction.End",
      )],
    } as Ocpp16RequestOf<"StopTransaction">;
  }

  private async fail(
    delivery: ChargingPointActorTransactionDeliveryRecord,
    errorCode: string,
    errorMessage: string,
  ): Promise<boolean> {
    const updated = await this.context.transactionStore.recordFailure({
      id: delivery.id,
      failedAt: this.context.clock(),
      ...this.retryConfiguration(),
      errorCode,
      errorMessage,
    });
    emitTransactionDeliveryChanged(this.context, updated, "in_flight");
    if (
      updated.status === "failed" &&
      updated.messageType === "start" &&
      updated.ocppTransactionId === -1
    ) {
      this.context.ocppTransactionIds.set(updated.transactionId, -1);
    }
    return updated.status === "failed";
  }

  private retryConfiguration(): {
    maxAttempts: number;
    retryIntervalSec: number;
  } {
    return {
      maxAttempts:
        this.context.configurationFacts.readPositiveIntegerConfig(
          "TransactionMessageAttempts",
        ) ?? 3,
      retryIntervalSec:
        this.context.configurationFacts.readNonNegativeIntegerConfig(
          "TransactionMessageRetryInterval",
        ) ?? 60,
    };
  }

  private async scheduleRetry(): Promise<void> {
    const head = (await this.context.transactionStore.listPending())[0];
    if (
      head?.status !== "retry_wait" ||
      head.nextAttemptAt === null ||
      !this.canSend()
    ) {
      return;
    }
    const delayMs = Math.max(0, head.nextAttemptAt.getTime() - this.context.clock().getTime());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.wake();
    }, delayMs);
    unrefTimer(this.retryTimer);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new Error(`交易交付 payload.${key} 必须是字符串`);
  }
  return value;
}

function readOptionalString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  if (value === undefined || value === null) {
    return null;
  }
  return readString(payload, key);
}

function readNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`交易交付 payload.${key} 必须是有限数字`);
  }
  return value;
}

function readOptionalNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];
  if (value === undefined || value === null) {
    return null;
  }
  return readNumber(payload, key);
}

function unrefTimer(timerId: ReturnType<typeof setTimeout>): void {
  if (typeof timerId === "object" && timerId !== null && "unref" in timerId) {
    (timerId as { unref(): void }).unref();
  }
}
