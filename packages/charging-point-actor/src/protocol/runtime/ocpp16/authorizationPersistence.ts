import {
  AuthorizationGrant,
  LocalAuthorizationList,
} from "../../../model";

import type { Ocpp16RuntimeContext } from "./state";

export async function restorePersistedAuthorization(
  context: Ocpp16RuntimeContext,
): Promise<void> {
  const state = await context.authorizationStore.load();
  if (state.localList !== null) {
    context.localAuthorizationList = new LocalAuthorizationList({
      chargingPointId: context.chargingPoint.id,
      version: state.localList.version,
      source: state.localList.source,
      updatedAt: state.localList.updatedAt,
      entries: state.localList.entries,
    });
  }

  context.authorizationCache.clear();
  for (const [key, grant] of context.authorizationGrants) {
    if (grant.source === "cache" || grant.isCacheEntry) {
      context.authorizationGrants.delete(key);
    }
  }
  for (const entry of state.cacheEntries) {
    const key = authorizationCacheKey(entry.credentialId, entry.evseId);
    const grant = new AuthorizationGrant({
      credentialId: entry.credentialId,
      status: entry.status,
      validUntil: entry.validUntil,
      allowedEvseIds: [entry.evseId],
      groupCredentialId: entry.groupCredentialId,
      source: "cache",
      isCacheEntry: true,
      lastEvaluatedAt: entry.lastEvaluatedAt,
    });
    context.authorizationCache.set(key, grant);
    context.authorizationGrants.set(key, grant);
  }
}

function authorizationCacheKey(credentialId: string, evseId: number): string {
  return `${credentialId}\u0000${evseId}`;
}
