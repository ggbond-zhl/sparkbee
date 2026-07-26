import { and, asc, eq } from "drizzle-orm";
import type {
  ChargingPointActorAuthorizationStore,
  ChargingPointActorPersistedAuthorizationCacheEntry,
  ChargingPointActorPersistedAuthorizationState,
  ChargingPointActorPersistedLocalAuthorizationList,
  ChargingPointActorProtocol,
} from "../../lib/chargingPointActor";

import type { ServerDatabase } from "../../db";
import {
  authorizationCacheEntries,
  localAuthorizationEntries,
  localAuthorizationLists,
} from "../../db/schema";

export class AuthorizationRepository {
  constructor(private readonly db: ServerDatabase) {}

  forChargingPoint(
    chargingPointId: string,
    protocol: ChargingPointActorProtocol,
  ): ChargingPointActorAuthorizationStore {
    return {
      load: () => this.load(chargingPointId, protocol),
      replaceLocalList: (list) =>
        this.replaceLocalList(chargingPointId, protocol, list),
      upsertCacheEntry: (entry) =>
        this.upsertCacheEntry(chargingPointId, protocol, entry),
      clearCache: () => this.clearCache(chargingPointId, protocol),
    };
  }

  async load(
    chargingPointId: string,
    protocol: ChargingPointActorProtocol,
  ): Promise<ChargingPointActorPersistedAuthorizationState> {
    const listRows = await this.db
      .select({
        version: localAuthorizationLists.version,
        source: localAuthorizationLists.source,
        updatedAt: localAuthorizationLists.updatedAt,
        credentialId: localAuthorizationEntries.credentialId,
        status: localAuthorizationEntries.status,
        validUntil: localAuthorizationEntries.validUntil,
        groupCredentialId: localAuthorizationEntries.groupCredentialId,
      })
      .from(localAuthorizationLists)
      .leftJoin(
        localAuthorizationEntries,
        and(
          eq(
            localAuthorizationEntries.chargingPointId,
            localAuthorizationLists.chargingPointId,
          ),
          eq(localAuthorizationEntries.protocol, localAuthorizationLists.protocol),
        ),
      )
      .where(and(
        eq(localAuthorizationLists.chargingPointId, chargingPointId),
        eq(localAuthorizationLists.protocol, protocol),
      ))
      .orderBy(asc(localAuthorizationEntries.credentialId));
    const cacheRows = await this.db
      .select()
      .from(authorizationCacheEntries)
      .where(and(
        eq(authorizationCacheEntries.chargingPointId, chargingPointId),
        eq(authorizationCacheEntries.protocol, protocol),
      ))
      .orderBy(
        asc(authorizationCacheEntries.credentialId),
        asc(authorizationCacheEntries.evseId),
      );

    return {
      localList: listRows[0] === undefined
        ? null
        : {
            version: listRows[0].version,
            source: listRows[0].source,
            updatedAt: listRows[0].updatedAt,
            entries: listRows.flatMap((row) => row.credentialId === null
              ? []
              : [{
                  credentialId: row.credentialId,
                  status: row.status as ChargingPointActorPersistedLocalAuthorizationList["entries"][number]["status"],
                  validUntil: row.validUntil,
                  groupCredentialId: row.groupCredentialId,
                }]),
          },
      cacheEntries: cacheRows.map((row) => ({
        credentialId: row.credentialId,
        evseId: row.evseId,
        status: row.status as ChargingPointActorPersistedAuthorizationCacheEntry["status"],
        validUntil: row.validUntil,
        groupCredentialId: row.groupCredentialId,
        lastEvaluatedAt: row.lastEvaluatedAt,
      })),
    };
  }

  async replaceLocalList(
    chargingPointId: string,
    protocol: ChargingPointActorProtocol,
    list: ChargingPointActorPersistedLocalAuthorizationList,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction
        .insert(localAuthorizationLists)
        .values({
          chargingPointId,
          protocol,
          version: list.version,
          source: list.source,
          updatedAt: list.updatedAt,
        })
        .onConflictDoUpdate({
          target: [
            localAuthorizationLists.chargingPointId,
            localAuthorizationLists.protocol,
          ],
          set: {
            version: list.version,
            source: list.source,
            updatedAt: list.updatedAt,
          },
        });
      await transaction
        .delete(localAuthorizationEntries)
        .where(and(
          eq(localAuthorizationEntries.chargingPointId, chargingPointId),
          eq(localAuthorizationEntries.protocol, protocol),
        ));
      if (list.entries.length > 0) {
        await transaction.insert(localAuthorizationEntries).values(
          list.entries.map((entry) => ({
            chargingPointId,
            protocol,
            credentialId: entry.credentialId,
            status: entry.status,
            validUntil: entry.validUntil,
            groupCredentialId: entry.groupCredentialId,
          })),
        );
      }
    });
  }

  async upsertCacheEntry(
    chargingPointId: string,
    protocol: ChargingPointActorProtocol,
    entry: ChargingPointActorPersistedAuthorizationCacheEntry,
  ): Promise<void> {
    await this.db
      .insert(authorizationCacheEntries)
      .values({
        chargingPointId,
        protocol,
        credentialId: entry.credentialId,
        evseId: entry.evseId,
        status: entry.status,
        validUntil: entry.validUntil,
        groupCredentialId: entry.groupCredentialId,
        lastEvaluatedAt: entry.lastEvaluatedAt,
        updatedAt: entry.lastEvaluatedAt,
      })
      .onConflictDoUpdate({
        target: [
          authorizationCacheEntries.chargingPointId,
          authorizationCacheEntries.protocol,
          authorizationCacheEntries.credentialId,
          authorizationCacheEntries.evseId,
        ],
        set: {
          status: entry.status,
          validUntil: entry.validUntil,
          groupCredentialId: entry.groupCredentialId,
          lastEvaluatedAt: entry.lastEvaluatedAt,
          updatedAt: entry.lastEvaluatedAt,
        },
      });
  }

  async clearCache(
    chargingPointId: string,
    protocol: ChargingPointActorProtocol,
  ): Promise<void> {
    await this.db
      .delete(authorizationCacheEntries)
      .where(and(
        eq(authorizationCacheEntries.chargingPointId, chargingPointId),
        eq(authorizationCacheEntries.protocol, protocol),
      ));
  }
}
