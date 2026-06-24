import {
  cloneArray,
  cloneDate,
  cloneNullableDate,
} from "../shared/collections";
import { assertValidDate } from "../shared/invariants";
import type { AuthorizationStatus } from "./AuthorizationGrant";

export interface LocalAuthorizationEntryOptions {
  credentialId: string;
  status: AuthorizationStatus;
  validUntil?: Date | null;
  groupCredentialId?: string | null;
}

export interface LocalAuthorizationEntry {
  credentialId: string;
  status: AuthorizationStatus;
  validUntil: Date | null;
  groupCredentialId: string | null;
}

export type LocalAuthorizationEntryInput =
  | string
  | LocalAuthorizationEntryOptions;

export interface LocalAuthorizationListOptions {
  chargingPointId: string;
  version: number;
  updatedAt: Date;
  source: string;
  entries?: Iterable<LocalAuthorizationEntryInput>;
}

export class LocalAuthorizationList {
  readonly chargingPointId: string;
  private _version: number;
  private _updatedAt: Date;
  private _source: string;
  private readonly entries: Map<string, LocalAuthorizationEntry>;

  constructor(options: LocalAuthorizationListOptions) {
    assertValidDate(options.updatedAt, "updatedAt");

    this.chargingPointId = options.chargingPointId;
    this._version = options.version;
    this._updatedAt = cloneDate(options.updatedAt, "updatedAt");
    this._source = options.source;
    this.entries = new Map();
    for (const entry of options.entries ?? []) {
      const normalized = normalizeEntry(entry);
      this.entries.delete(normalized.credentialId);
      this.entries.set(normalized.credentialId, normalized);
    }
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return cloneDate(this._updatedAt, "updatedAt");
  }

  get source(): string {
    return this._source;
  }

  listEntries(): string[] {
    return cloneArray(this.entries.keys());
  }

  listAuthorizationEntries(): LocalAuthorizationEntry[] {
    return [...this.entries.values()].map(cloneEntry);
  }

  hasCredential(credentialId: string): boolean {
    return this.entries.has(credentialId);
  }

  getEntry(credentialId: string): LocalAuthorizationEntry | undefined {
    const entry = this.entries.get(credentialId);
    return entry === undefined ? undefined : cloneEntry(entry);
  }

  replaceEntries(
    version: number,
    updatedAt: Date,
    source: string,
    entries: Iterable<LocalAuthorizationEntryInput>,
  ): LocalAuthorizationList {
    return new LocalAuthorizationList({
      chargingPointId: this.chargingPointId,
      version,
      updatedAt,
      source,
      entries,
    });
  }

}

function normalizeEntry(
  entry: LocalAuthorizationEntryInput,
): LocalAuthorizationEntry {
  if (typeof entry === "string") {
    return {
      credentialId: entry,
      status: "accepted",
      validUntil: null,
      groupCredentialId: null,
    };
  }

  return {
    credentialId: entry.credentialId,
    status: entry.status,
    validUntil: cloneNullableDate(entry.validUntil ?? null, "validUntil"),
    groupCredentialId: entry.groupCredentialId ?? null,
  };
}

function cloneEntry(entry: LocalAuthorizationEntry): LocalAuthorizationEntry {
  return {
    credentialId: entry.credentialId,
    status: entry.status,
    validUntil: cloneNullableDate(entry.validUntil, "validUntil"),
    groupCredentialId: entry.groupCredentialId,
  };
}
