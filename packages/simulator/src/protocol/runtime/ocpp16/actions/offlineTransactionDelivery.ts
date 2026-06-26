import { SessionError } from "../../../session/types";
import type { Transaction, TransactionStopReason } from "../../../../model";
import { cloneDate } from "../../../../shared/utils";
import type {
  MeterValueElectricalMeasurements,
} from "../payloadBuilders";
import { emitTransactionMeterValue } from "../events";
import { resolveOcppTransactionId } from "../resourceAccess";
import type { Ocpp16RuntimeContext } from "../state";
import type { Ocpp16MeterValuesResult } from "../types";
import type { OfflineTransactionRecord } from "../OfflineTransactionOutbox";

export type TransactionDeliveryBinding =
  | { status: "bound"; ocppTransactionId: number }
  | { status: "offline"; ocppTransactionId: null };

export function recordOfflineTransactionStart(
  context: Ocpp16RuntimeContext,
  input: Parameters<
    Ocpp16RuntimeContext["offlineTransactionOutbox"]["recordStarted"]
  >[0],
): void {
  context.offlineTransactionOutbox.recordStarted(input);
}

export function resolveTransactionDeliveryBinding(
  context: Ocpp16RuntimeContext,
  transaction: Transaction,
): TransactionDeliveryBinding {
  try {
    return {
      status: "bound",
      ocppTransactionId: resolveOcppTransactionId(context, transaction),
    };
  } catch (cause) {
    if (context.offlineTransactionOutbox.get(transaction.id) === undefined) {
      throw cause;
    }

    return {
      status: "offline",
      ocppTransactionId: null,
    };
  }
}

export function shouldQueueTransactionDelivery(
  context: Ocpp16RuntimeContext,
  transactionId: string,
): boolean {
  return (
    !context.session.isConnected() ||
    context.offlineTransactionReplayInProgress ||
    listPendingOfflineTransactions(context).some((record) =>
      record.localTransactionId === transactionId
    )
  );
}

export function recordMeterValueForOfflineDelivery(
  context: Ocpp16RuntimeContext,
  input: {
    transaction: Transaction;
    ocppConnectorId: number | null;
    ocppTransactionId: number | null;
    meterWh: number;
    sampledAt: Date;
    measurements: MeterValueElectricalMeasurements;
  },
): Extract<Ocpp16MeterValuesResult, { outcome: "Accepted" }> {
  if (input.ocppTransactionId !== null && input.ocppConnectorId !== null) {
    ensureBoundTransactionOutboxRecord(context, {
      transaction: input.transaction,
      connectorId: input.ocppConnectorId,
      ocppTransactionId: input.ocppTransactionId,
    });
  }

  context.offlineTransactionOutbox.recordMeterValue(input.transaction.id, {
    meterWh: input.meterWh,
    sampledAt: input.sampledAt,
    measurements: input.measurements,
  });

  const result = recordOfflineMeterValuesSuccess({
    transactionId: input.transaction.id,
    connectorId: input.ocppConnectorId ??
      resolveTransactionConnectorId(input.transaction),
    ocppTransactionId: input.ocppTransactionId,
    meterWh: input.meterWh,
    sampledAt: input.sampledAt,
  });
  emitAcceptedOfflineMeterValue(context, input.transaction, result);

  return result;
}

export function recordOfflineTransactionStop(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
  record: {
    meterStopWh: number;
    stoppedAt: Date;
    reason: TransactionStopReason;
    idTag: string | null;
  },
): void {
  context.offlineTransactionOutbox.recordStopped(localTransactionId, record);
}

export function bindOfflineTransactionStart(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
  input: { ocppTransactionId: number },
): void {
  context.offlineTransactionOutbox.bindStart(localTransactionId, input);
  recordOcppTransactionBinding(context, localTransactionId, input);
}

export function recordOcppTransactionBinding(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
  input: { ocppTransactionId: number },
): void {
  context.ocppTransactionIds.set(localTransactionId, input.ocppTransactionId);
}

export function listPendingOfflineTransactions(
  context: Ocpp16RuntimeContext,
): OfflineTransactionRecord[] {
  return context.offlineTransactionOutbox.listPending();
}

export function getOfflineTransactionRecord(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
): OfflineTransactionRecord | undefined {
  return context.offlineTransactionOutbox.get(localTransactionId);
}

export function markOfflineMeterValueReplayed(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
  index: number,
): void {
  context.offlineTransactionOutbox.markMeterValueReplayed(
    localTransactionId,
    index,
  );
}

export function markOfflineStopReplayed(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
): void {
  context.offlineTransactionOutbox.markStopReplayed(localTransactionId);
}
export function isOfflineDeliveryError(cause: unknown): boolean {
  return (
    cause instanceof SessionError &&
    (
      cause.code === "OUTBOUND_REQUEST_REJECTED" ||
      cause.code === "OUTBOUND_REQUEST_ABORTED" ||
      cause.code === "OUTBOUND_REQUEST_DISCONNECTED"
    )
  );
}

function ensureBoundTransactionOutboxRecord(
  context: Ocpp16RuntimeContext,
  input: {
    transaction: Transaction;
    connectorId: number;
    ocppTransactionId: number;
  },
): void {
  if (context.offlineTransactionOutbox.get(input.transaction.id) !== undefined) {
    return;
  }

  const target = input.transaction.target;
  if (target.scope !== "connector") {
    return;
  }

  context.offlineTransactionOutbox.recordBoundStarted({
    localTransactionId: input.transaction.id,
    evseId: target.evseId,
    connectorId: target.connectorId,
    ocppConnectorId: input.connectorId,
    idTag: input.transaction.credentialId,
    meterStartWh: input.transaction.startMeterWh,
    startedAt: input.transaction.startedAt,
    ocppTransactionId: input.ocppTransactionId,
  });
}

function recordOfflineMeterValuesSuccess(input: {
  transactionId: string;
  connectorId: number;
  ocppTransactionId: number | null;
  meterWh: number;
  sampledAt: Date;
}): Extract<Ocpp16MeterValuesResult, { outcome: "Accepted" }> {
  return {
    outcome: "Accepted",
    transactionId: input.transactionId,
    connectorId: input.connectorId,
    ocppTransactionId: input.ocppTransactionId,
    meterWh: input.meterWh,
    sampledAt: cloneDate(input.sampledAt),
    sentAt: cloneDate(input.sampledAt),
    receivedAt: cloneDate(input.sampledAt),
    unexpectedResponseFields: [],
    consecutiveFailures: 0,
    platformCommunicationStatus: "offline",
    shouldReconnect: false,
  };
}

function emitAcceptedOfflineMeterValue(
  context: Ocpp16RuntimeContext,
  transaction: Transaction,
  result: Extract<Ocpp16MeterValuesResult, { outcome: "Accepted" }>,
): void {
  const target = transaction.target;
  if (target.scope !== "connector") {
    return;
  }

  emitTransactionMeterValue(context, {
    evseId: target.evseId,
    connectorId: target.connectorId,
    transactionId: result.transactionId,
    meterWh: result.meterWh,
    sampledAt: result.sampledAt,
    occurredAt: result.receivedAt,
  });
}

function resolveTransactionConnectorId(transaction: Transaction): number {
  const target = transaction.target;
  return target.scope === "connector" ? target.connectorId : 0;
}
