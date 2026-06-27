import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { cloneDate, cloneNullableDate } from "../../../../shared/utils";
import { toRequestErrorInfo } from "../requestErrors";
import { parseOptionalDate } from "../responseParsers";
import {
  requireAuthorizableConnector,
  requireLocallyAuthorizableConnector,
} from "../connectorSelection";
import { emitAuthorizationStatus } from "../events";
import type { Ocpp16RuntimeContext } from "../state";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";
import type {
  Ocpp16AuthorizationStatus,
  Ocpp16AuthorizeInput,
  Ocpp16AuthorizeResult,
} from "../types";
import {
  getOcpp16AuthorizationPolicy,
  type OfflineAuthorizationDecision,
} from "../Ocpp16AuthorizationPolicy";

export async function authorize(
  context: Ocpp16RuntimeContext,
  input: Ocpp16AuthorizeInput,
): Promise<Ocpp16AuthorizeResult> {
  const isOnlineRegistered = isRegisteredSessionOnline(context);
  const selection = isOnlineRegistered
    ? requireAuthorizableConnector(context, input.connectorId)
    : requireLocallyAuthorizableConnector(context, input.connectorId);
  const authorizationPolicy = getOcpp16AuthorizationPolicy(context);
  const attemptSequence = authorizationPolicy.beginAuthorizeAttempt({
    evseId: selection.evseId,
    idTag: input.idTag,
  });

  if (!isOnlineRegistered) {
    const result = authorizeFromOfflineDecision(context, {
      evseId: selection.evseId,
      connectorId: selection.connectorId,
      idTag: input.idTag,
      at: context.clock(),
    });
    emitAuthorizationStatus(context, {
      evseId: selection.evseId,
      connectorId: selection.connectorId,
      idTag: input.idTag,
      authorizationStatus: result.authorizationStatus,
      source: result.source,
      occurredAt: result.receivedAt,
    });

    return result;
  }

  if (context.configurationFacts.isLocalPreAuthorizeEnabled()) {
    const at = context.clock();
    const decision = authorizationPolicy.preAuthorizeFromLocalStore({
      evseId: selection.evseId,
      idTag: input.idTag,
      at,
    });
    if (decision?.status === "accepted") {
      const result = createLocalAuthorizeResult(input.idTag, decision, {
        at,
        platformCommunicationStatus: "online",
      });
      emitAuthorizationStatus(context, {
        evseId: selection.evseId,
        connectorId: selection.connectorId,
        idTag: input.idTag,
        authorizationStatus: result.authorizationStatus,
        source: result.source,
        occurredAt: result.receivedAt,
      });
      void reconcileAuthorizeInBackground(context, {
        evseId: selection.evseId,
        connectorId: selection.connectorId,
        idTag: input.idTag,
        attemptSequence,
      });

      return result;
    }
  }

  const result = await sendAuthorize(context, input.idTag);
  authorizationPolicy.absorbAuthorizeResult({
    evseId: selection.evseId,
    result,
  });
  if (result.outcome !== "Failed") {
    emitAuthorizationStatus(context, {
      evseId: selection.evseId,
      connectorId: selection.connectorId,
      idTag: input.idTag,
      authorizationStatus: result.authorizationStatus,
      source: result.source,
      occurredAt: result.receivedAt,
    });
  }

  return result;
}

function isRegisteredSessionOnline(context: Ocpp16RuntimeContext): boolean {
  return context.session.isConnected() && context.registrationStatus === "Accepted";
}

function authorizeFromOfflineDecision(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    connectorId: number;
    idTag: string;
    at: Date;
  },
): Extract<Ocpp16AuthorizeResult, { outcome: "Accepted" | "Rejected" }> {
  const decision = getOcpp16AuthorizationPolicy(context).authorizeOffline(input);
  if (decision.status === "accepted") {
    return createLocalAuthorizeResult(input.idTag, decision, {
      at: input.at,
      platformCommunicationStatus: "offline",
    });
  }

  return {
    idTag: input.idTag,
    receivedAt: cloneDate(input.at),
    consecutiveFailures: 0 as const,
    platformCommunicationStatus: "offline" as const,
    shouldReconnect: false as const,
    outcome: "Rejected",
    authorizationStatus: toRejectedAuthorizationStatus(decision.authorizationStatus),
    expiryDate: null,
    parentIdTag: null,
    source: decision.source ?? "default-policy",
    reason: decision.reason,
  };
}

function toRejectedAuthorizationStatus(
  status: Ocpp16AuthorizationStatus | undefined,
): Exclude<Ocpp16AuthorizationStatus, "Accepted"> {
  return status === undefined || status === "Accepted" ? "Invalid" : status;
}

function createLocalAuthorizeResult(
  idTag: string,
  decision: Extract<OfflineAuthorizationDecision, { status: "accepted" }>,
  input: {
    at: Date;
    platformCommunicationStatus: "online" | "offline";
  },
): Extract<Ocpp16AuthorizeResult, { outcome: "Accepted" }> {
  return {
    outcome: "Accepted",
    idTag,
    authorizationStatus: "Accepted",
    expiryDate: cloneNullableDate(decision.expiryDate),
    parentIdTag: decision.parentIdTag,
    source: decision.source,
    receivedAt: cloneDate(input.at),
    consecutiveFailures: 0,
    platformCommunicationStatus: input.platformCommunicationStatus,
    shouldReconnect: false,
  };
}

async function reconcileAuthorizeInBackground(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    connectorId: number;
    idTag: string;
    attemptSequence: number;
  },
): Promise<void> {
  const result = await sendAuthorize(context, input.idTag);
  if (result.outcome === "Failed") {
    return;
  }

  if (!getOcpp16AuthorizationPolicy(context).absorbCurrentAuthorizeResult({
    evseId: input.evseId,
    idTag: input.idTag,
    attemptSequence: input.attemptSequence,
    result,
  })) {
    return;
  }
  emitAuthorizationStatus(context, {
    evseId: input.evseId,
    connectorId: input.connectorId,
    idTag: input.idTag,
    authorizationStatus: result.authorizationStatus,
    source: result.source,
    occurredAt: result.receivedAt,
  });

  if (result.outcome === "Rejected") {
    await stopActiveTransactionForRejectedAuthorization(context, {
      evseId: input.evseId,
      idTag: input.idTag,
      at: result.receivedAt,
    });
  }
}

async function stopActiveTransactionForRejectedAuthorization(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    idTag: string;
    at: Date;
  },
): Promise<void> {
  const transaction = [...context.transactions.values()].find((candidate) => {
    const target = candidate.target;
    return candidate.state !== "ended" &&
      candidate.credentialId === input.idTag &&
      target.scope === "connector" &&
      target.evseId === input.evseId;
  });
  if (transaction === undefined) {
    return;
  }

  try {
    await getOcpp16TransactionDelivery(context).stop({
      transactionId: transaction.id,
      reason: "deauthorized",
      stoppedAt: input.at,
    });
  } catch {
    // Background CSMS review must not surface as an unhandled rejection.
  }
}

export async function sendAuthorize(
  context: Ocpp16RuntimeContext,
  idTag: string,
): Promise<Ocpp16AuthorizeResult> {
  const sentAt = context.clock();

  try {
    const result = await context.session.request("Authorize", {
      idTag,
    } satisfies Ocpp16RequestOf<"Authorize">);

    if (result.kind === "error") {
      return recordAuthorizeFailure(context, {
        idTag,
        sentAt,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    return recordAuthorizeResponse(
      context,
      idTag,
      sentAt,
      result.payload as Ocpp16ResponseOf<"Authorize">,
    );
  } catch (cause) {
    return recordAuthorizeFailure(context, {
      idTag,
      sentAt,
      ...toRequestErrorInfo(cause),
    });
  }
}

function recordAuthorizeResponse(
  context: Ocpp16RuntimeContext,
  idTag: string,
  sentAt: Date,
  payload: Ocpp16ResponseOf<"Authorize">,
): Extract<Ocpp16AuthorizeResult, { outcome: "Accepted" | "Rejected" }> {
  const receivedAt = context.clock();
  const idTagInfo = payload.idTagInfo;
  const expiryDate = parseOptionalDate(idTagInfo.expiryDate);
  const parentIdTag = idTagInfo.parentIdTag ?? null;

  const base = {
    idTag,
    expiryDate: cloneNullableDate(expiryDate),
    parentIdTag,
    source: "online" as const,
    sentAt: cloneDate(sentAt),
    receivedAt,
    consecutiveFailures: 0 as const,
    platformCommunicationStatus: "online" as const,
    shouldReconnect: false as const,
  };

  const authorizationStatus = getOcpp16AuthorizationPolicy(context).normalizeAuthorizeResponseStatus(
    idTagInfo.status,
    expiryDate,
    receivedAt,
  );

  if (authorizationStatus === "Accepted") {
    return {
      ...base,
      outcome: "Accepted",
      authorizationStatus: "Accepted",
    };
  }

  return {
    ...base,
    outcome: "Rejected",
    authorizationStatus,
    ...(authorizationStatus === "Expired" ? { reason: "授权已过期" } : {}),
  };
}

function recordAuthorizeFailure(
  context: Ocpp16RuntimeContext,
  input: {
    idTag: string;
    sentAt: Date;
    errorCode: string;
    errorMessage: string;
  },
): Extract<Ocpp16AuthorizeResult, { outcome: "Failed" }> {
  const failedAt = context.clock();

  return {
    outcome: "Failed",
    idTag: input.idTag,
    sentAt: cloneDate(input.sentAt),
    failedAt,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    consecutiveFailures: 1,
    platformCommunicationStatus: "unknown",
    shouldReconnect: false,
  };
}
