import type { Ocpp16RequestOf } from "../../../validator/Ocpp16";
import { cloneDate } from "../../../../shared/utils";
import { mapChargingPointStatus, mapConnectorStatus, mapErrorCode } from "../mappings";
import {
  requireConnectorSelection,
  requireRegisteredChargingPoint,
} from "../connectorSelection";
import { ProtocolRuntimeError } from "../errors";
import {
  emitChargingPointStatusSnapshot,
  emitConnectorStatusSnapshot,
} from "../events";
import { getUnexpectedResponseFields, toRequestErrorInfo } from "../requestErrors";
import type { Ocpp16RuntimeContext } from "../state";
import { traceOcpp16RuntimeOperation } from "../runtimeLogs";
import type {
  Ocpp16ConnectorStatus,
  Ocpp16ReportConnectorStatusInput,
  Ocpp16StatusNotificationResult,
} from "../types";
import { toOcppDate } from "../payloadBuilders";

type StatusNotificationInput = {
  connectorId: number;
  status: Ocpp16ConnectorStatus;
  at: Date;
};

export async function reportConnectorStatus(
  context: Ocpp16RuntimeContext,
  input: Ocpp16ReportConnectorStatusInput,
): Promise<Ocpp16StatusNotificationResult> {
  requireRegisteredChargingPoint(
    context,
    "BootNotification 未 Accepted，不能上报状态",
  );

  if (input.connectorId === 0) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      "connectorId=0 不能用于枪口状态上报",
    );
  }

  const at = context.clock();
  const selection = requireConnectorSelection(context, input.connectorId);
  const evse = context.chargingPoint.getEvse(selection.evseId);
  if (evse === undefined) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_CONNECTOR_NOT_FOUND",
      `EVSE ${selection.evseId} 不存在`,
    );
  }

  const result = await sendStatusNotification(context, {
    connectorId: selection.ocppConnectorId,
    status: mapConnectorStatus({ evse, connector: selection.connector }),
    at,
  });
  emitConnectorStatusSnapshot(context, {
    evseId: selection.evseId,
    connectorId: selection.connectorId,
    occurredAt: at,
  });

  return result;
}

export async function reportChargingPointStatus(
  context: Ocpp16RuntimeContext,
): Promise<Ocpp16StatusNotificationResult> {
  requireRegisteredChargingPoint(
    context,
    "BootNotification 未 Accepted，不能上报状态",
  );

  const at = context.clock();

  const result = await sendStatusNotification(context, {
    connectorId: 0,
    status: mapChargingPointStatus(context.chargingPoint.status),
    at,
  });
  emitChargingPointStatusSnapshot(context, { occurredAt: at });

  return result;
}

export async function sendStatusNotification(
  context: Ocpp16RuntimeContext,
  input: StatusNotificationInput,
): Promise<Ocpp16StatusNotificationResult> {
  return traceOcpp16RuntimeOperation(
    context,
    {
      category: "action",
      name: "StatusNotification",
      input,
    },
    () => sendStatusNotificationCore(context, input),
  );
}

async function sendStatusNotificationCore(
  context: Ocpp16RuntimeContext,
  input: StatusNotificationInput,
): Promise<Ocpp16StatusNotificationResult> {
  const sentAt = context.clock();
  const errorMapping = mapErrorCode(
    input.connectorId === 0
      ? context.chargingPoint.faultCode
      : requireConnectorSelection(context, input.connectorId).connector.faultCode,
  );

  try {
    const result = await context.session.request("StatusNotification", {
      connectorId: input.connectorId,
      errorCode: errorMapping.errorCode,
      status: input.status,
      timestamp: toOcppDate(input.at),
      vendorErrorCode: errorMapping.vendorErrorCode,
    } satisfies Ocpp16RequestOf<"StatusNotification">);

    if (result.kind === "error") {
      return recordStatusNotificationFailure({
        input,
        sentAt,
        failedAt: context.clock(),
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    return recordStatusNotificationSuccess(
      context,
      input,
      sentAt,
      result.payload,
    );
  } catch (cause) {
    return recordStatusNotificationFailure({
      input,
      sentAt,
      failedAt: context.clock(),
      ...toRequestErrorInfo(cause),
    });
  }
}

function recordStatusNotificationSuccess(
  context: Ocpp16RuntimeContext,
  input: StatusNotificationInput,
  sentAt: Date,
  payload: unknown,
): Extract<Ocpp16StatusNotificationResult, { outcome: "Accepted" }> {
  const receivedAt = context.clock();
  const unexpectedResponseFields = getUnexpectedResponseFields(payload);

  return {
    outcome: "Accepted",
    connectorId: input.connectorId,
    connectorStatus: input.status,
    sentAt: cloneDate(sentAt),
    receivedAt,
    unexpectedResponseFields,
    consecutiveFailures: 0,
    platformCommunicationStatus: "online",
    shouldReconnect: false,
  };
}

function recordStatusNotificationFailure(input: {
  input: StatusNotificationInput;
  sentAt: Date;
  failedAt: Date;
  errorCode: string;
  errorMessage: string;
}): Extract<Ocpp16StatusNotificationResult, { outcome: "Failed" }> {
  return {
    outcome: "Failed",
    connectorId: input.input.connectorId,
    connectorStatus: input.input.status,
    sentAt: cloneDate(input.sentAt),
    failedAt: cloneDate(input.failedAt),
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    consecutiveFailures: 1,
    platformCommunicationStatus: "unknown",
    shouldReconnect: false,
  };
}
