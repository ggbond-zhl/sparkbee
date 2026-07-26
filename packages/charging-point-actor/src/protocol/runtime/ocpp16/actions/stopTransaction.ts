import { cloneDate } from "../../../../shared/utils";

import { ProtocolRuntimeError } from "../errors";
import {
  captureConnectorAvailabilitySnapshot,
  emitConnectorAvailabilitySnapshot,
  emitTransactionStatus,
} from "../events";
import { mapStopReason } from "../mappings";
import { resolveTransaction } from "../resourceAccess";
import type { Ocpp16RuntimeContext } from "../state";
import {
  endTransactionDelivery,
  toOcppMeterReadingWh,
} from "../transactionDeliveryState";
import { emitTransactionDeliveryChanged } from "../transactionDeliveryEvents";
import type {
  Ocpp16StopTransactionInput,
  Ocpp16StopTransactionResult,
} from "../types";
import {
  captureConnectorStatusTransition,
  emitConnectorStatusTransition,
} from "./connectorStatusTransition";
import { stopMeterValueLoop } from "./meterValues";

export async function stopTransaction(
  context: Ocpp16RuntimeContext,
  input: Ocpp16StopTransactionInput,
): Promise<Ocpp16StopTransactionResult> {
  const at = input.stoppedAt ?? context.clock();
  const chargingTransaction = resolveTransaction(context, input);
  if (chargingTransaction.state === "ended") {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      `充电交易 ${chargingTransaction.id} 已结束，不能重复停止`,
    );
  }
  const target = chargingTransaction.target;
  if (target.scope !== "connector") {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      `交易 ${chargingTransaction.id} 未关联枪口`,
    );
  }
  const connectorRef = {
    evseId: target.evseId,
    connectorId: target.connectorId,
  };
  const evse = context.chargingPoint.getEvse(connectorRef.evseId);
  const connector = evse?.getConnector(connectorRef.connectorId);
  const hasRequestedAvailability =
    (evse !== undefined && evse.requestedAvailability !== null) ||
    (connector !== undefined && connector.requestedAvailability !== null);
  const availabilitySnapshot = captureConnectorAvailabilitySnapshot(
    context,
    connectorRef,
  );
  const connectorTransition = captureConnectorStatusTransition(
    context,
    connectorRef,
  );
  const meterStopWh = toOcppMeterReadingWh(
    input.meterStopWh ?? chargingTransaction.latestMeterWh,
  );
  const deliveryRecord = await context.transactionStore.end({
    transactionId: chargingTransaction.id,
    stoppedAt: at,
    meterStopWh,
    messageId: context.messageIdGenerator(),
    payload: {
      evseId: connectorRef.evseId,
      connectorId: connectorRef.connectorId,
      meterStopWh,
      reason: mapStopReason(input.reason) ?? null,
      idTag: input.idTag ?? null,
      authorizationIdTag: chargingTransaction.credentialId,
    },
  });
  emitTransactionDeliveryChanged(context, deliveryRecord, null);
  stopMeterValueLoop(context, chargingTransaction.id);
  const delivery = endTransactionDelivery(context, {
    transaction: chargingTransaction,
    connectorRef,
    reason: input.reason,
    stoppedAt: at,
    meterStopWh,
    idTag: input.idTag,
  });
  emitTransactionStatus(context, {
    evseId: connectorRef.evseId,
    connectorId: connectorRef.connectorId,
    transactionId: delivery.endedTransaction.id,
    previousStatus: delivery.previousTransactionStatus,
    currentStatus: "ended",
    reason: input.reason,
    occurredAt: at,
  });
  if (hasRequestedAvailability) {
    emitConnectorAvailabilitySnapshot(context, {
      ...connectorRef,
      previousAvailability: availabilitySnapshot.availability,
      occurredAt: at,
    });
  }
  emitConnectorStatusTransition(context, connectorTransition, at);

  return {
    outcome: "Accepted",
    transactionId: delivery.endedTransaction.id,
    ocppTransactionId:
      context.ocppTransactionIds.get(delivery.endedTransaction.id) ?? null,
    meterStop: delivery.meterStop,
    stoppedAt: cloneDate(delivery.stoppedAt),
    sentAt: cloneDate(delivery.stoppedAt),
    receivedAt: cloneDate(delivery.stoppedAt),
    idTagInfoStatus: null,
    responseIssue: null,
    unexpectedResponseFields: [],
    consecutiveFailures: 0,
    platformCommunicationStatus: context.session.isConnected()
      ? "online"
      : "offline",
    shouldReconnect: false,
    statusNotificationResults: [],
  };
}
