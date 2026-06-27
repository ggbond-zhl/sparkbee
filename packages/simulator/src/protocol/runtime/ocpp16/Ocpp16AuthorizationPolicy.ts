import {
  AuthorizationGrant,
  type AuthorizationSource,
  type AuthorizationStatus,
} from "../../../model";
import type {
  Ocpp16AuthorizationStatus,
  Ocpp16AuthorizeResult,
  Ocpp16StartTransactionCallResult,
} from "./types";
import type { Ocpp16RuntimeContext } from "./state";

export type OfflineAuthorizationDecision =
  | {
      status: "accepted";
      authorizationStatus: "Accepted";
      source: AuthorizationSource;
      expiryDate: Date | null;
      parentIdTag: string | null;
    }
  | {
      status: "rejected";
      reason: string;
      source?: AuthorizationSource;
      authorizationStatus?: Ocpp16AuthorizationStatus;
    };

const authorizationPolicies = new WeakMap<
  Ocpp16RuntimeContext,
  Ocpp16AuthorizationPolicy
>();

export function getOcpp16AuthorizationPolicy(
  context: Ocpp16RuntimeContext,
): Ocpp16AuthorizationPolicy {
  let policy = authorizationPolicies.get(context);
  if (policy === undefined) {
    policy = new Ocpp16AuthorizationPolicy(context);
    authorizationPolicies.set(context, policy);
  }

  return policy;
}

export class Ocpp16AuthorizationPolicy {
  constructor(private readonly context: Ocpp16RuntimeContext) {}

  normalizeAuthorizeResponseStatus(
    status: Ocpp16AuthorizationStatus,
    expiryDate: Date | null,
    at: Date,
  ): Ocpp16AuthorizationStatus {
    return normalizeAuthorizationStatus(status, expiryDate, at);
  }

  absorbAuthorizeResult(input: {
    evseId: number;
    result: Ocpp16AuthorizeResult;
  }): void {
    recordAuthorizationGrantFromAuthorizeResult(this.context, input);
  }

  absorbStartTransactionResult(input: {
    evseId: number;
    result: Ocpp16StartTransactionCallResult;
  }): void {
    recordAuthorizationGrantFromStartTransactionResult(this.context, input);
  }

  authorizeAcceptedTransactionStart(input: {
    evseId: number;
    idTag: string;
    at: Date;
  }): { status: "accepted" } | {
    status: "rejected";
    reason: string;
    authorizationStatus?: Ocpp16AuthorizationStatus;
  } {
    return validateAcceptedAuthorization(this.context, input);
  }

  authorizeOffline(input: {
    evseId: number;
    idTag: string;
    at: Date;
  }): OfflineAuthorizationDecision {
    const decision = validateOfflineAuthorization(this.context, input);
    if (decision.status === "accepted") {
      recordAuthorizationGrantFromOfflineDecision(this.context, {
        ...input,
        decision,
        evaluatedAt: input.at,
      });
    }

    return decision;
  }

  preAuthorizeFromLocalStore(input: {
    evseId: number;
    idTag: string;
    at: Date;
  }): OfflineAuthorizationDecision | null {
    const decision = validateStoredAuthorization(this.context, input);
    if (decision?.status === "accepted") {
      recordAuthorizationGrantFromOfflineDecision(this.context, {
        ...input,
        decision,
        evaluatedAt: input.at,
      });
    }

    return decision;
  }

  authorizeOfflineTransactionStart(input: {
    evseId: number;
    idTag: string;
    at: Date;
  }): OfflineAuthorizationDecision {
    return this.authorizeOffline(input);
  }

  beginAuthorizeAttempt(input: { evseId: number; idTag: string }): number {
    return nextAuthorizationAttemptSequence(this.context, input);
  }

  absorbCurrentAuthorizeResult(input: {
    evseId: number;
    idTag: string;
    attemptSequence: number;
    result: Ocpp16AuthorizeResult;
  }): boolean {
    if (
      input.result.outcome === "Failed" ||
      !isCurrentAuthorizationAttempt(this.context, input)
    ) {
      return false;
    }

    recordAuthorizationGrantFromAuthorizeResult(this.context, {
      evseId: input.evseId,
      result: input.result,
    });
    return true;
  }

  clearCache(): void {
    clearAuthorizationCache(this.context);
  }
}

function normalizeAuthorizationStatus(
  status: Ocpp16AuthorizationStatus,
  expiryDate: Date | null,
  at: Date,
): Ocpp16AuthorizationStatus {
  if (status === "Accepted" && expiryDate !== null && expiryDate < at) {
    return "Expired";
  }

  return status;
}

function recordAuthorizationGrantFromAuthorizeResult(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    result: Ocpp16AuthorizeResult;
  },
): void {
  if (input.result.outcome === "Failed") {
    return;
  }

  recordAuthorizationGrant(context, {
    evseId: input.evseId,
    idTag: input.result.idTag,
    authorizationStatus: input.result.authorizationStatus,
    expiryDate: input.result.expiryDate,
    parentIdTag: input.result.parentIdTag,
    source: input.result.source,
    evaluatedAt: input.result.receivedAt,
  });
}

function recordAuthorizationGrantFromStartTransactionResult(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    result: Ocpp16StartTransactionCallResult;
  },
): void {
  if (input.result.outcome === "Failed") {
    return;
  }

  recordAuthorizationGrant(context, {
    evseId: input.evseId,
    idTag: input.result.idTag,
    authorizationStatus: input.result.authorizationStatus,
    expiryDate: input.result.expiryDate,
    parentIdTag: input.result.parentIdTag,
    source: "online",
    evaluatedAt: input.result.receivedAt,
  });
}

function validateAcceptedAuthorization(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    idTag: string;
    at: Date;
  },
): { status: "accepted" } | {
  status: "rejected";
  reason: string;
  authorizationStatus?: Ocpp16AuthorizationStatus;
} {
  const grant = context.authorizationGrants.get(
    authorizationGrantKey(input.idTag, input.evseId),
  );
  if (grant === undefined) {
    return {
      status: "rejected",
      reason: "未找到有效授权",
    };
  }

  if (!grant.allowsEvse(input.evseId)) {
    return {
      status: "rejected",
      reason: "授权不适用于该 EVSE",
      authorizationStatus: "Invalid",
    };
  }

  if (grant.status !== "accepted") {
    return {
      status: "rejected",
      reason: "授权未通过",
      authorizationStatus: mapDomainAuthorizationStatus(grant.status),
    };
  }

  if (!grant.isAcceptedAt(input.at)) {
    return {
      status: "rejected",
      reason: "授权已过期",
      authorizationStatus: "Expired",
    };
  }

  return { status: "accepted" };
}

function validateOfflineAuthorization(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    idTag: string;
    at: Date;
  },
): OfflineAuthorizationDecision {
  if (!context.configurationFacts.isLocalAuthorizeOfflineEnabled()) {
    return {
      status: "rejected",
      reason: "离线授权未启用",
    };
  }

  const storedAuthorization = validateStoredAuthorization(context, input);
  if (storedAuthorization !== null) {
    return storedAuthorization;
  }

  if (context.configurationFacts.isOfflineTxForUnknownIdAllowed()) {
    return {
      status: "accepted",
      authorizationStatus: "Accepted",
      source: "default-policy",
      expiryDate: null,
      parentIdTag: null,
    };
  }

  return {
    status: "rejected",
    reason: "未找到有效授权",
  };
}

function recordAuthorizationGrantFromOfflineDecision(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    idTag: string;
    decision: Extract<OfflineAuthorizationDecision, { status: "accepted" }>;
    evaluatedAt: Date;
  },
): void {
  recordAuthorizationGrant(context, {
    evseId: input.evseId,
    idTag: input.idTag,
    authorizationStatus: input.decision.authorizationStatus,
    expiryDate: input.decision.expiryDate,
    parentIdTag: input.decision.parentIdTag,
    source: input.decision.source,
    evaluatedAt: input.evaluatedAt,
  });
}

function nextAuthorizationAttemptSequence(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; idTag: string },
): number {
  const key = authorizationGrantKey(input.idTag, input.evseId);
  const nextSequence = (context.authorizationAttemptSequences.get(key) ?? 0) + 1;
  context.authorizationAttemptSequences.set(key, nextSequence);
  return nextSequence;
}

function isCurrentAuthorizationAttempt(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; idTag: string; attemptSequence: number },
): boolean {
  return context.authorizationAttemptSequences.get(
    authorizationGrantKey(input.idTag, input.evseId),
  ) === input.attemptSequence;
}

function clearAuthorizationCache(context: Ocpp16RuntimeContext): void {
  context.authorizationCache.clear();
  for (const [key, grant] of context.authorizationGrants) {
    if (grant.source === "cache" || grant.isCacheEntry) {
      context.authorizationGrants.delete(key);
    }
  }
}

function validateStoredAuthorization(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    idTag: string;
    at: Date;
  },
): OfflineAuthorizationDecision | null {
  if (context.configurationFacts.isLocalAuthListEnabled()) {
    const localEntry = context.localAuthorizationList.getEntry(input.idTag);
    if (localEntry !== undefined) {
      return evaluateStoredAuthorization({
        status: localEntry.status,
        validUntil: localEntry.validUntil,
        groupCredentialId: localEntry.groupCredentialId,
        source: "local-list",
        at: input.at,
      });
    }
  }

  if (context.configurationFacts.isAuthorizationCacheEnabled()) {
    const cachedGrant = findCachedAuthorizationGrant(context, input);
    if (cachedGrant !== undefined) {
      return evaluateStoredAuthorization({
        status: cachedGrant.status,
        validUntil: cachedGrant.validUntil,
        groupCredentialId: cachedGrant.groupCredentialId,
        source: "cache",
        at: input.at,
      });
    }
  }

  return null;
}

function recordAuthorizationGrant(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    idTag: string;
    authorizationStatus: Ocpp16AuthorizationStatus;
    expiryDate: Date | null;
    parentIdTag: string | null;
    source: AuthorizationSource;
    evaluatedAt: Date;
  },
): void {
  const key = authorizationGrantKey(input.idTag, input.evseId);
  const grant = createAuthorizationGrant(input);
  context.authorizationGrants.set(key, grant);

  if (shouldWriteAuthorizationCache(context, input)) {
    context.authorizationCache.set(
      key,
      createAuthorizationGrant({
        ...input,
        source: "cache",
      }),
    );
  }
}

function createAuthorizationGrant(input: {
  evseId: number;
  idTag: string;
  authorizationStatus: Ocpp16AuthorizationStatus;
  expiryDate: Date | null;
  parentIdTag: string | null;
  source: AuthorizationSource;
  evaluatedAt: Date;
}): AuthorizationGrant {
  return new AuthorizationGrant({
    credentialId: input.idTag,
    status: mapOcppAuthorizationStatus(input.authorizationStatus),
    validUntil: input.expiryDate,
    allowedEvseIds: [input.evseId],
    groupCredentialId: input.parentIdTag,
    source: input.source,
    isCacheEntry: input.source === "cache",
    lastEvaluatedAt: input.evaluatedAt,
  });
}

function shouldWriteAuthorizationCache(
  context: Ocpp16RuntimeContext,
  input: {
    idTag: string;
    source: AuthorizationSource;
  },
): boolean {
  return input.source === "online" &&
    context.configurationFacts.isAuthorizationCacheEnabled() &&
    !context.localAuthorizationList.hasCredential(input.idTag);
}

function authorizationGrantKey(idTag: string, evseId: number): string {
  return `${idTag}\u0000${evseId}`;
}

function mapOcppAuthorizationStatus(
  status: Ocpp16AuthorizationStatus,
): AuthorizationStatus {
  switch (status) {
    case "Accepted":
      return "accepted";
    case "Blocked":
      return "blocked";
    case "Expired":
      return "expired";
    case "ConcurrentTx":
      return "concurrent-transaction";
    case "Invalid":
    default:
      return "invalid";
  }
}

function mapDomainAuthorizationStatus(
  status: AuthorizationStatus,
): Ocpp16AuthorizationStatus {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "blocked":
      return "Blocked";
    case "expired":
      return "Expired";
    case "concurrent-transaction":
      return "ConcurrentTx";
    case "invalid":
    default:
      return "Invalid";
  }
}

function findCachedAuthorizationGrant(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    idTag: string;
  },
): AuthorizationGrant | undefined {
  const key = authorizationGrantKey(input.idTag, input.evseId);
  const cachedGrant = context.authorizationCache.get(key);
  if (cachedGrant !== undefined) {
    return cachedGrant;
  }

  const grant = context.authorizationGrants.get(key);
  if (grant === undefined) {
    return undefined;
  }

  if (grant.source === "cache" || grant.isCacheEntry) {
    return grant;
  }

  return undefined;
}

function evaluateStoredAuthorization(input: {
  status: AuthorizationStatus;
  validUntil: Date | null;
  groupCredentialId: string | null;
  source: AuthorizationSource;
  at: Date;
}): OfflineAuthorizationDecision {
  const authorizationStatus = mapDomainAuthorizationStatus(input.status);
  if (input.status !== "accepted") {
    return {
      status: "rejected",
      reason: mapOfflineRejectionReason(authorizationStatus),
      source: input.source,
      authorizationStatus,
    };
  }

  if (input.validUntil !== null && input.validUntil < input.at) {
    return {
      status: "rejected",
      reason: "授权已过期",
      source: input.source,
      authorizationStatus: "Expired",
    };
  }

  return {
    status: "accepted",
    authorizationStatus: "Accepted",
    source: input.source,
    expiryDate: input.validUntil,
    parentIdTag: input.groupCredentialId,
  };
}

function mapOfflineRejectionReason(
  authorizationStatus: Ocpp16AuthorizationStatus,
): string {
  switch (authorizationStatus) {
    case "Blocked":
      return "卡被禁用";
    case "Expired":
      return "授权已过期";
    case "ConcurrentTx":
      return "已有并发交易";
    case "Invalid":
    default:
      return "无效卡";
  }
}
