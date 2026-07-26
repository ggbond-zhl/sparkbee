import type { AuthorizationSource } from "../../../../model";
import { cloneDate, cloneNullableDate } from "../../../../shared/utils";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import {
  getOcpp16AuthorizationPolicy,
} from "../Ocpp16AuthorizationPolicy";
import { toOcppDate } from "../payloadBuilders";
import {
  requireLocallyStartableConnector,
  requireStartableConnector,
} from "../connectorSelection";
import {
  emitAuthorizationStatus,
  emitTransactionStatus,
} from "../events";
import { toRequestErrorInfo } from "../requestErrors";
import { parseOptionalDate } from "../responseParsers";
import type { Ocpp16RuntimeContext } from "../state";
import { recordPersistedTransactionStart } from "../transactionDeliveryState";
import { emitTransactionDeliveryChanged } from "../transactionDeliveryEvents";
import { startMeterValueLoop } from "./meterValues";
import type {
  Ocpp16StartTransactionCallResult,
  Ocpp16StartTransactionInput,
  Ocpp16StatusNotificationResult,
  Ocpp16TransactionStartResult,
} from "../types";

export async function startLocalTransaction(
  context: Ocpp16RuntimeContext,
  input: Ocpp16StartTransactionInput,
): Promise<Ocpp16TransactionStartResult> {
  return startTransaction(context, input, { requireAuthorization: true });
}

export async function startTransaction(
  context: Ocpp16RuntimeContext,
  input: Ocpp16StartTransactionInput,
  options: { requireAuthorization: boolean },
): Promise<Ocpp16TransactionStartResult> {
  const at = input.startedAt ?? context.clock();
  const statusNotificationResults: Ocpp16StatusNotificationResult[] = [];
  const isOnlineRegistered =
    context.session.isConnected() && context.registrationStatus === "Accepted";
  const shouldUseOfflineAuthorization =
    !isOnlineRegistered &&
    options.requireAuthorization &&
    context.configurationFacts.isLocalAuthorizeOfflineEnabled();
  const selection = isOnlineRegistered
    ? requireStartableConnector(context, input.connectorId)
    : shouldUseOfflineAuthorization
      ? requireLocallyStartableConnector(context, input.connectorId)
    : requireStartableConnector(context, input.connectorId);
  let offlineAuthorizationSource: AuthorizationSource | undefined;
  const authorizationPolicy = getOcpp16AuthorizationPolicy(context);

  if (options.requireAuthorization) {
    if (shouldUseOfflineAuthorization) {
      const authorization = authorizationPolicy.authorizeOfflineTransactionStart({
        evseId: selection.evseId,
        idTag: input.idTag,
        at,
      });
      if (authorization.status === "rejected") {
        emitTransactionStatus(context, {
          evseId: selection.evseId,
          connectorId: selection.connectorId,
          previousStatus: null,
          currentStatus: "rejected",
          reason: authorization.reason,
          occurredAt: at,
        });
        return {
          status: "Rejected",
          reason: authorization.reason,
          authorizationStatus: authorization.authorizationStatus,
          statusNotificationResults,
        };
      }

      offlineAuthorizationSource = authorization.source;
      emitAuthorizationStatus(context, {
        evseId: selection.evseId,
        connectorId: selection.connectorId,
        idTag: input.idTag,
        authorizationStatus: authorization.authorizationStatus,
        source: authorization.source,
        occurredAt: at,
      });
    } else {
      const authorization = authorizationPolicy.authorizeAcceptedTransactionStart({
        evseId: selection.evseId,
        idTag: input.idTag,
        at,
      });
      if (authorization.status === "rejected") {
        emitTransactionStatus(context, {
          evseId: selection.evseId,
          connectorId: selection.connectorId,
          previousStatus: null,
          currentStatus: "rejected",
          reason: authorization.reason,
          occurredAt: at,
        });
        return {
          status: "Rejected",
          reason: authorization.reason,
          authorizationStatus: authorization.authorizationStatus,
          statusNotificationResults,
        };
      }
    }
  }

  return startPersistedTransaction(context, {
    selection,
    input,
    at,
    authorizationSource: offlineAuthorizationSource,
  });
}
async function startPersistedTransaction(
  context: Ocpp16RuntimeContext,
  input: {
    selection: ReturnType<typeof requireLocallyStartableConnector>;
    input: Ocpp16StartTransactionInput;
    at: Date;
    authorizationSource: AuthorizationSource | undefined;
  },
): Promise<Ocpp16TransactionStartResult> {
  const transactionId = context.idGenerator();
  const deliveryRecord = await context.transactionStore.start({
    transaction: {
      transactionId,
      evseId: input.selection.evseId,
      connectorId: input.selection.connectorId,
      idTag: input.input.idTag,
      state: "active",
      chargingState: "charging",
      meterStartWh: input.input.meterStartWh,
      latestMeterWh: input.input.meterStartWh,
      startedAt: input.at,
    },
    messageId: context.messageIdGenerator(),
    payload: {
      evseId: input.selection.evseId,
      connectorId: input.selection.ocppConnectorId,
      idTag: input.input.idTag,
      meterStartWh: input.input.meterStartWh,
      ...(input.input.reservationId === undefined
        ? {}
        : { reservationId: input.input.reservationId }),
    },
  });
  emitTransactionDeliveryChanged(context, deliveryRecord, null);
  recordPersistedTransactionStart(context, {
    transactionId,
    selection: input.selection,
    startInput: input.input,
    startedAt: input.at,
  });
  startMeterValueLoop(context, transactionId);
  emitTransactionStatus(context, {
    evseId: input.selection.evseId,
    connectorId: input.selection.connectorId,
    transactionId,
    previousStatus: null,
    currentStatus: "active",
    occurredAt: input.at,
  });
  return {
    status: "Accepted",
    transactionId,
    authorizationSource: input.authorizationSource,
    statusNotificationResults: [],
  };
}

export async function sendStartTransaction(
  context: Ocpp16RuntimeContext,
  input: {
    connectorId: number;
    idTag: string;
    meterStartWh: number;
    reservationId?: number;
    at: Date;
  },
  options: { messageId?: string } = {},
): Promise<Ocpp16StartTransactionCallResult> {
  const sentAt = context.clock();

  try {
    const result = await context.session.request("StartTransaction", {
      connectorId: input.connectorId,
      idTag: input.idTag,
      meterStart: input.meterStartWh,
      reservationId: input.reservationId,
      timestamp: toOcppDate(input.at),
    } satisfies Ocpp16RequestOf<"StartTransaction">, options);

    if (result.kind === "error") {
      return recordStartTransactionFailure(context, {
        input,
        sentAt,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    return recordStartTransactionResponse(
      context,
      input,
      sentAt,
      result.payload as Ocpp16ResponseOf<"StartTransaction">,
    );
  } catch (cause) {
    return recordStartTransactionFailure(context, {
      input,
      sentAt,
      ...toRequestErrorInfo(cause),
    });
  }
}

function recordStartTransactionResponse(
  context: Ocpp16RuntimeContext,
  input: {
    connectorId: number;
    idTag: string;
  },
  sentAt: Date,
  payload: Ocpp16ResponseOf<"StartTransaction">,
): Extract<Ocpp16StartTransactionCallResult, { outcome: "Accepted" | "Rejected" }> {
  const receivedAt = context.clock();
  const idTagInfo = payload.idTagInfo;
  const expiryDate = parseOptionalDate(idTagInfo.expiryDate);
  const parentIdTag = idTagInfo.parentIdTag ?? null;

  const base = {
    connectorId: input.connectorId,
    idTag: input.idTag,
    ocppTransactionId: payload.transactionId,
    expiryDate: cloneNullableDate(expiryDate),
    parentIdTag,
    sentAt: cloneDate(sentAt),
    receivedAt,
    consecutiveFailures: 0 as const,
    platformCommunicationStatus: "online" as const,
    shouldReconnect: false as const,
  };

  if (idTagInfo.status === "Accepted") {
    return {
      ...base,
      outcome: "Accepted",
      authorizationStatus: "Accepted",
    };
  }

  return {
    ...base,
    outcome: "Rejected",
    authorizationStatus: idTagInfo.status,
  };
}

function recordStartTransactionFailure(
  context: Ocpp16RuntimeContext,
  input: {
    input: {
      connectorId: number;
      idTag: string;
    };
    sentAt: Date;
    errorCode: string;
    errorMessage: string;
  },
): Extract<Ocpp16StartTransactionCallResult, { outcome: "Failed" }> {
  const failedAt = context.clock();

  return {
    outcome: "Failed",
    connectorId: input.input.connectorId,
    idTag: input.input.idTag,
    sentAt: cloneDate(input.sentAt),
    failedAt,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    consecutiveFailures: 1,
    platformCommunicationStatus: "unknown",
    shouldReconnect: false,
  };
}
