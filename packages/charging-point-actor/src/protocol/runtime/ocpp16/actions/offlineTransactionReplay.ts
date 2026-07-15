import { getOcpp16AuthorizationPolicy } from "../Ocpp16AuthorizationPolicy";
import { startMeterValueLoop } from "./meterValues";
import { sendStatusNotification } from "./statusNotification";
import { sendStartTransaction } from "./transactionStart";
import {
  emitAuthorizationStatus,
  emitTransactionStatus,
} from "../events";
import { mapConnectorFlowStatus, mapStopReason } from "../mappings";
import {
  bindOfflineTransactionStart,
  completeTransactionDelivery,
  getOfflineTransactionRecord,
  listPendingOfflineTransactions,
  markOfflineMeterValueReplayed,
  markOfflineStopReplayed,
  recordOcppTransactionBinding,
} from "../transactionDeliveryState";
import { createMeterValue, createStopTransactionPayload } from "../payloadBuilders";
import type { Ocpp16RuntimeContext } from "../state";
import type { Ocpp16StartTransactionCallResult } from "../types";
import type { OfflineTransactionRecord } from "../OfflineTransactionOutbox";
import {
  captureConnectorStatusTransition,
  emitConnectorStatusTransition,
  resolveConnectorOcppStatus,
} from "./connectorStatusTransition";

export async function replayOfflineTransactions(
  context: Ocpp16RuntimeContext,
): Promise<void> {
  if (!context.session.isConnected() || context.registrationStatus !== "Accepted") {
    return;
  }

  if (context.offlineTransactionReplayInProgress) {
    return;
  }

  context.offlineTransactionReplayInProgress = true;
  try {
    for (const record of listPendingOfflineTransactions(context)) {
      if (!await replayOfflineTransaction(context, record)) {
        return;
      }
    }
  } finally {
    context.offlineTransactionReplayInProgress = false;
  }
}

async function replayOfflineTransaction(
  context: Ocpp16RuntimeContext,
  record: OfflineTransactionRecord,
): Promise<boolean> {
  const replayStartResult = await replayOfflineStartTransaction(
    context,
    record,
  );
  if (replayStartResult === null) {
    return false;
  }

  const { ocppTransactionId, startTransactionResult } = replayStartResult;
  if (startTransactionResult !== null) {
    getOcpp16AuthorizationPolicy(context).absorbStartTransactionResult({
      evseId: record.evseId,
      result: startTransactionResult,
    });
    emitAuthorizationStatus(context, {
      evseId: record.evseId,
      connectorId: record.connectorId,
      idTag: record.idTag,
      authorizationStatus: startTransactionResult.authorizationStatus,
      occurredAt: startTransactionResult.receivedAt,
    });
  }

  if (
    startTransactionResult !== null &&
    startTransactionResult.outcome !== "Accepted"
  ) {
    if (context.configurationFacts.shouldStopTransactionOnInvalidId()) {
      recordDeauthorizedStop(context, record);
      const latestRecord = getOfflineTransactionRecord(
        context,
        record.localTransactionId,
      ) ?? record;
      return replayOfflineStopTransaction(
        context,
        latestRecord,
        ocppTransactionId,
      );
    }

    await resumeCharging(context, record, startTransactionResult.receivedAt);
    return true;
  }

  if (!await replayOfflineMeterValues(context, record, ocppTransactionId)) {
    return false;
  }
  if (record.stop !== null && !record.stop.replayed) {
    return replayOfflineStopTransaction(context, record, ocppTransactionId);
  }

  await resumeCharging(context, record, record.startedAt);
  return true;
}

async function replayOfflineMeterValues(
  context: Ocpp16RuntimeContext,
  record: OfflineTransactionRecord,
  ocppTransactionId: number,
): Promise<boolean> {
  for (const [index, meterValue] of record.meterValues.entries()) {
    if (meterValue.replayed) {
      continue;
    }

    const result = await context.session.request("MeterValues", {
      connectorId: record.ocppConnectorId,
      transactionId: ocppTransactionId,
      meterValue: [
        createMeterValue(
          meterValue.meterWh,
          meterValue.sampledAt,
          "Sample.Periodic",
          meterValue.measurements,
        ),
      ],
    });
    if (result.kind === "error") {
      return false;
    }

    markOfflineMeterValueReplayed(context, record.localTransactionId, index);
  }
  return true;
}

async function resumeCharging(
  context: Ocpp16RuntimeContext,
  record: OfflineTransactionRecord,
  at: Date,
): Promise<void> {
  await sendStatusNotification(context, {
    connectorId: record.ocppConnectorId,
    status: mapConnectorFlowStatus("charging"),
    at,
  });
  startMeterValueLoop(context, record.localTransactionId);
}

async function replayOfflineStartTransaction(
  context: Ocpp16RuntimeContext,
  record: OfflineTransactionRecord,
): Promise<{
  ocppTransactionId: number;
  startTransactionResult: Extract<
    Ocpp16StartTransactionCallResult,
    { outcome: "Accepted" | "Rejected" }
  > | null;
} | null> {
  if (record.startReplayed) {
    if (record.ocppTransactionId === null) {
      return null;
    }
    recordOcppTransactionBinding(context, record.localTransactionId, {
      ocppTransactionId: record.ocppTransactionId,
    });

    return {
      ocppTransactionId: record.ocppTransactionId,
      startTransactionResult: null,
    };
  }

  const startTransactionResult = await sendStartTransaction(context, {
    connectorId: record.ocppConnectorId,
    idTag: record.idTag,
    meterStartWh: record.meterStartWh,
    reservationId: record.reservationId,
    at: record.startedAt,
  });
  if (startTransactionResult.outcome === "Failed") {
    return null;
  }

  bindOfflineTransactionStart(context, record.localTransactionId, {
    ocppTransactionId: startTransactionResult.ocppTransactionId,
  });

  return {
    ocppTransactionId: startTransactionResult.ocppTransactionId,
    startTransactionResult,
  };
}

async function replayOfflineStopTransaction(
  context: Ocpp16RuntimeContext,
  record: OfflineTransactionRecord,
  ocppTransactionId: number,
): Promise<boolean> {
  if (record.stop === null || record.stop.replayed) {
    return true;
  }

  const stopResult = await context.session.request(
    "StopTransaction",
    createStopTransactionPayload({
      ocppTransactionId,
      meterStop: record.stop.meterStopWh,
      timestamp: record.stop.stoppedAt,
      reason: mapStopReason(record.stop.reason) ?? null,
      idTag: record.stop.idTag,
      transactionData: [
        createMeterValue(
          record.stop.meterStopWh,
          record.stop.stoppedAt,
          "Transaction.End",
        ),
      ],
    }),
  );
  if (stopResult.kind === "error") {
    return false;
  }

  markOfflineStopReplayed(context, record.localTransactionId);
  await sendStatusNotification(context, {
    connectorId: record.ocppConnectorId,
    status: getCurrentConnectorStatus(context, record),
    at: record.stop.stoppedAt,
  });
  return true;
}

function recordDeauthorizedStop(
  context: Ocpp16RuntimeContext,
  record: OfflineTransactionRecord,
): void {
  const transaction = context.transactions.get(record.localTransactionId);
  if (transaction === undefined || transaction.state === "ended") {
    return;
  }

  const at = context.clock();
  const connectorTransition = captureConnectorStatusTransition(context, {
    evseId: record.evseId,
    connectorId: record.connectorId,
  });
  const delivery = completeTransactionDelivery(context, {
    queueOffline: true,
    transaction,
    connectorRef: record,
    reason: "deauthorized",
    stoppedAt: at,
    idTag: transaction.credentialId,
  });
  emitTransactionStatus(context, {
    evseId: record.evseId,
    connectorId: record.connectorId,
    transactionId: record.localTransactionId,
    previousStatus: delivery.previousTransactionStatus,
    currentStatus: "ended",
    reason: "deauthorized",
    occurredAt: at,
  });
  emitConnectorStatusTransition(context, connectorTransition, at);
}

function getCurrentConnectorStatus(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; connectorId: number },
) {
  return resolveConnectorOcppStatus(context, input, {
    fallback: mapConnectorFlowStatus("available"),
  });
}
