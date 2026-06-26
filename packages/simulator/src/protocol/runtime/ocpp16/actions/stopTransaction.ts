import type { Ocpp16RequestOf } from "../../../validator/Ocpp16";
import { cloneDate } from "../../../../shared/utils";
import { ProtocolRuntimeError } from "../errors";
import { emitTransactionStatus } from "../events";
import { mapConnectorFlowStatus, mapStopReason } from "../mappings";
import { createMeterValue, createStopTransactionPayload } from "../payloadBuilders";
import { resolveTransaction } from "../resourceAccess";
import { toRequestErrorInfo } from "../requestErrors";
import { parseStopTransactionResponse } from "../responseParsers";
import type { Ocpp16RuntimeContext } from "../state";
import { stopMeterValueLoop } from "./meterValues";
import { sendStatusNotification } from "./statusNotification";
import type {
  Ocpp16StatusNotificationResult,
  Ocpp16StopTransactionInput,
  Ocpp16StopTransactionResult,
} from "../types";
import { applyRequestedAvailabilityWhenNoActiveTransaction } from "./connectorActions";
import {
  resolveTransactionDeliveryBinding,
} from "./offlineTransactionDelivery";
import {
  captureConnectorStatusTransition,
  emitConnectorStatusTransition,
  resolveConnectorOcppStatus,
} from "./connectorStatusTransition";
import {
  endTransactionDelivery,
  recordOfflineTransactionStopDelivery,
  requireTransactionConnectorRef,
} from "../Ocpp16TransactionDelivery";

type StopTransactionRequestState = {
  transactionId: string;
  ocppTransactionId: number;
  meterStop: number;
  timestamp: Date;
  reason: string | null;
  idTag: string | null;
  transactionData: Ocpp16RequestOf<"StopTransaction">["transactionData"];
};

export async function stopTransaction(
  context: Ocpp16RuntimeContext,
  input: Ocpp16StopTransactionInput,
): Promise<Ocpp16StopTransactionResult> {
  const at = input.stoppedAt ?? context.clock();
  const statusNotificationResults: Ocpp16StatusNotificationResult[] = [];
  const chargingTransaction = resolveTransaction(context, input);
  if (chargingTransaction.state === "ended") {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      `充电交易 ${chargingTransaction.id} 已结束，不能重复停止`,
    );
  }
  const connectorRef = requireTransactionConnectorRef(chargingTransaction);
  const deliveryBinding = resolveTransactionDeliveryBinding(
    context,
    chargingTransaction,
  );
  if (deliveryBinding.status === "offline") {
    return stopOfflineTransaction(context, {
      input,
      at,
      chargingTransaction,
      connectorRef,
    });
  }
  const ocppTransactionId = deliveryBinding.ocppTransactionId;
  const connectorTransition = captureConnectorStatusTransition(
    context,
    connectorRef,
  );
  stopMeterValueLoop(context, chargingTransaction.id);
  const delivery = endTransactionDelivery(context, {
    transaction: chargingTransaction,
    connectorRef,
    reason: input.reason,
    stoppedAt: at,
    meterStopWh: input.meterStopWh,
    idTag: input.idTag,
  });
  const transactionData = [
    createMeterValue(delivery.meterStop, at, "Transaction.End"),
  ];
  const requestState: StopTransactionRequestState = {
    transactionId: chargingTransaction.id,
    ocppTransactionId,
    meterStop: delivery.meterStop,
    timestamp: cloneDate(at),
    reason: mapStopReason(input.reason) ?? null,
    idTag: delivery.idTag,
    transactionData,
  };

  statusNotificationResults.push(await sendStatusNotification(context, {
    connectorId: connectorRef.connectorId,
    status: mapConnectorFlowStatus("finishing"),
    at,
  }));

  const stopResult = await sendStopTransaction(
    context,
    requestState,
    statusNotificationResults,
  );
  const availabilityApplication =
    await applyRequestedAvailabilityWhenNoActiveTransaction(context, connectorRef, at);
  if (availabilityApplication.statusNotificationResult !== null) {
    statusNotificationResults.push(
      availabilityApplication.statusNotificationResult,
    );
  } else {
    statusNotificationResults.push(await sendStatusNotification(context, {
      connectorId: connectorRef.connectorId,
      status: resolveConnectorOcppStatus(context, connectorRef),
      at,
    }));
  }
  emitTransactionStatus(context, {
    evseId: connectorRef.evseId,
    connectorId: connectorRef.connectorId,
    transactionId: chargingTransaction.id,
    previousStatus: delivery.previousTransactionStatus,
    currentStatus: "ended",
    reason: input.reason,
    ...(stopResult.outcome === "Failed"
      ? {
          error: {
            code: stopResult.errorCode,
            message: stopResult.errorMessage,
          },
        }
      : {}),
    occurredAt: stopResult.outcome === "Failed"
      ? stopResult.failedAt
      : stopResult.receivedAt,
  });
  emitConnectorStatusTransition(context, connectorTransition, at);

  return stopResult;
}

function stopOfflineTransaction(
  context: Ocpp16RuntimeContext,
  input: {
    input: Ocpp16StopTransactionInput;
    at: Date;
    chargingTransaction: ReturnType<typeof resolveTransaction>;
    connectorRef: { evseId: number; connectorId: number };
  },
): Extract<Ocpp16StopTransactionResult, { outcome: "Accepted" }> {
  const connectorTransition = captureConnectorStatusTransition(
    context,
    input.connectorRef,
  );
  stopMeterValueLoop(context, input.chargingTransaction.id);
  const delivery = recordOfflineTransactionStopDelivery(context, {
    transaction: input.chargingTransaction,
    connectorRef: input.connectorRef,
    reason: input.input.reason,
    stoppedAt: input.at,
    meterStopWh: input.input.meterStopWh,
    idTag: input.input.idTag,
  });
  emitTransactionStatus(context, {
    evseId: input.connectorRef.evseId,
    connectorId: input.connectorRef.connectorId,
    transactionId: delivery.endedTransaction.id,
    previousStatus: delivery.previousTransactionStatus,
    currentStatus: "ended",
    reason: input.input.reason,
    occurredAt: input.at,
  });
  emitConnectorStatusTransition(context, connectorTransition, input.at);

  return {
    outcome: "Accepted",
    transactionId: delivery.endedTransaction.id,
    ocppTransactionId: null,
    meterStop: delivery.meterStop,
    stoppedAt: cloneDate(delivery.stoppedAt),
    sentAt: cloneDate(delivery.stoppedAt),
    receivedAt: cloneDate(delivery.stoppedAt),
    idTagInfoStatus: null,
    responseIssue: null,
    unexpectedResponseFields: [],
    consecutiveFailures: 0,
    platformCommunicationStatus: "offline",
    shouldReconnect: false,
    statusNotificationResults: [],
  };
}

async function sendStopTransaction(
  context: Ocpp16RuntimeContext,
  requestState: StopTransactionRequestState,
  statusNotificationResults: Ocpp16StatusNotificationResult[],
): Promise<Ocpp16StopTransactionResult> {
  const sentAt = context.clock();

  try {
    const result = await context.session.request(
      "StopTransaction",
      createStopTransactionPayload(requestState),
    );

    if (result.kind === "error") {
      return recordStopTransactionFailure(context, {
        requestState,
        sentAt,
        statusNotificationResults,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    return recordStopTransactionSuccess(context, {
      requestState,
      sentAt,
      payload: result.payload,
      statusNotificationResults,
    });
  } catch (cause) {
    return recordStopTransactionFailure(context, {
      requestState,
      sentAt,
      statusNotificationResults,
      ...toRequestErrorInfo(cause),
    });
  }
}

function recordStopTransactionSuccess(
  context: Ocpp16RuntimeContext,
  input: {
    requestState: StopTransactionRequestState;
    sentAt: Date;
    payload: unknown;
    statusNotificationResults: Ocpp16StatusNotificationResult[];
  },
): Extract<Ocpp16StopTransactionResult, { outcome: "Accepted" }> {
  const receivedAt = context.clock();
  const response = parseStopTransactionResponse(input.payload);

  return {
    outcome: "Accepted",
    transactionId: input.requestState.transactionId,
    ocppTransactionId: input.requestState.ocppTransactionId,
    meterStop: input.requestState.meterStop,
    stoppedAt: cloneDate(input.requestState.timestamp),
    sentAt: cloneDate(input.sentAt),
    receivedAt,
    idTagInfoStatus: response.idTagInfoStatus,
    responseIssue: response.responseIssue,
    unexpectedResponseFields: response.unexpectedResponseFields,
    consecutiveFailures: 0,
    platformCommunicationStatus: "online",
    shouldReconnect: false,
    statusNotificationResults: input.statusNotificationResults,
  };
}

function recordStopTransactionFailure(
  context: Ocpp16RuntimeContext,
  input: {
    requestState: StopTransactionRequestState;
    sentAt: Date;
    errorCode: string;
    errorMessage: string;
    statusNotificationResults: Ocpp16StatusNotificationResult[];
  },
): Extract<Ocpp16StopTransactionResult, { outcome: "Failed" }> {
  const failedAt = context.clock();

  return {
    outcome: "Failed",
    transactionId: input.requestState.transactionId,
    ocppTransactionId: input.requestState.ocppTransactionId,
    meterStop: input.requestState.meterStop,
    stoppedAt: cloneDate(input.requestState.timestamp),
    sentAt: cloneDate(input.sentAt),
    failedAt,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    consecutiveFailures: 1,
    platformCommunicationStatus: "unknown",
    shouldReconnect: false,
    statusNotificationResults: input.statusNotificationResults,
  };
}
