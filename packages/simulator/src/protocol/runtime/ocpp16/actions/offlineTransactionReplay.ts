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
  getOfflineTransactionRecord,
  listPendingOfflineTransactions,
  markOfflineMeterValueReplayed,
  markOfflineStopReplayed,
  recordOcppTransactionBinding,
  recordOfflineTransactionStopDelivery,
} from "../Ocpp16TransactionDelivery";
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
      const replayStartResult = await replayOfflineStartTransaction(
        context,
        record,
      );
      if (replayStartResult === null) {
        return;
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
          const latestRecord = getOfflineTransactionRecord(context, record.localTransactionId) ?? record;
          const replayed = await replayOfflineStopTransaction(
            context,
            latestRecord,
            ocppTransactionId,
          );
          if (!replayed) {
            return;
          }
          continue;
        }

        await sendStatusNotification(context, {
          connectorId: record.ocppConnectorId,
          status: mapConnectorFlowStatus("charging"),
          at: startTransactionResult.receivedAt,
        });
        startMeterValueLoop(context, record.localTransactionId);
        continue;
      }

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
          return;
        }

        markOfflineMeterValueReplayed(context, record.localTransactionId, index);
      }
      if (record.stop !== null && !record.stop.replayed) {
        const replayed = await replayOfflineStopTransaction(
          context,
          record,
          ocppTransactionId,
        );
        if (!replayed) {
          return;
        }
        continue;
      }

      await sendStatusNotification(context, {
        connectorId: record.ocppConnectorId,
        status: mapConnectorFlowStatus("charging"),
        at: record.startedAt,
      });
      startMeterValueLoop(context, record.localTransactionId);
    }
  } finally {
    context.offlineTransactionReplayInProgress = false;
  }
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
  const delivery = recordOfflineTransactionStopDelivery(context, {
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
