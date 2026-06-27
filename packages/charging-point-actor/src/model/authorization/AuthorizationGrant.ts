import {
  cloneArray,
  cloneDate,
  cloneNullableDate,
  cloneSet,
} from "../shared/collections";
import { assertValidDate } from "../shared/invariants";

export type AuthorizationStatus =
  | "accepted"
  | "blocked"
  | "expired"
  | "invalid"
  | "concurrent-transaction";

export type AuthorizationSource =
  | "online"
  | "local-list"
  | "cache"
  | "default-policy";

export interface AuthorizationGrantOptions {
  credentialId: string;
  status: AuthorizationStatus;
  validUntil?: Date | null;
  allowedEvseIds?: Iterable<number>;
  groupCredentialId?: string | null;
  message?: string | null;
  source: AuthorizationSource;
  isCacheEntry?: boolean;
  lastEvaluatedAt: Date;
}

export class AuthorizationGrant {
  readonly credentialId: string;
  readonly status: AuthorizationStatus;
  private readonly _validUntil: Date | null;
  private readonly allowedEvseIds: Set<number>;
  readonly groupCredentialId: string | null;
  readonly message: string | null;
  readonly source: AuthorizationSource;
  readonly isCacheEntry: boolean;
  private readonly _lastEvaluatedAt: Date;

  constructor(options: AuthorizationGrantOptions) {
    assertValidDate(options.lastEvaluatedAt, "lastEvaluatedAt");

    this.credentialId = options.credentialId;
    this.status = options.status;
    this._validUntil = cloneNullableDate(options.validUntil ?? null, "validUntil");
    this.allowedEvseIds = cloneSet(options.allowedEvseIds);
    this.groupCredentialId = options.groupCredentialId ?? null;
    this.message = options.message ?? null;
    this.source = options.source;
    this.isCacheEntry = options.isCacheEntry ?? false;
    this._lastEvaluatedAt = cloneDate(options.lastEvaluatedAt, "lastEvaluatedAt");
  }

  get validUntil(): Date | null {
    return cloneNullableDate(this._validUntil, "validUntil");
  }

  get lastEvaluatedAt(): Date {
    return cloneDate(this._lastEvaluatedAt, "lastEvaluatedAt");
  }

  isAcceptedAt(at: Date): boolean {
    if (this.status !== "accepted") {
      return false;
    }

    return this.validUntil === null || this.validUntil >= at;
  }

  allowsEvse(evseId: number): boolean {
    if (this.allowedEvseIds.size === 0) {
      return true;
    }

    return this.allowedEvseIds.has(evseId);
  }

  listAllowedEvseIds(): number[] {
    return cloneArray(this.allowedEvseIds);
  }

}
