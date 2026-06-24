import { describe, expect, test } from "vitest";

import { AuthorizationGrant } from "../../../../src/model/index.ts";

describe("AuthorizationGrant", () => {
  test("accepts validity windows and evse allow lists", () => {
    const grant = new AuthorizationGrant({
      credentialId: "cred-1",
      status: "accepted",
      validUntil: new Date("2026-01-01T01:00:00.000Z"),
      allowedEvseIds: [1, 2],
      source: "online",
      lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(grant.isAcceptedAt(new Date("2026-01-01T00:30:00.000Z"))).toBe(true);
    expect(grant.isAcceptedAt(new Date("2026-01-01T02:00:00.000Z"))).toBe(false);
    expect(grant.allowsEvse(1)).toBe(true);
    expect(grant.allowsEvse(3)).toBe(false);
  });

  test("returns defensive copies for dates and allow lists", () => {
    const validUntil = new Date("2026-01-01T01:00:00.000Z");
    const lastEvaluatedAt = new Date("2026-01-01T00:00:00.000Z");
    const grant = new AuthorizationGrant({
      credentialId: "cred-1",
      status: "accepted",
      validUntil,
      allowedEvseIds: [1, 2],
      source: "online",
      lastEvaluatedAt,
    });

    validUntil.setUTCFullYear(2030);
    lastEvaluatedAt.setUTCFullYear(2030);
    const allowedEvseIds = grant.listAllowedEvseIds();
    allowedEvseIds.push(3);
    grant.validUntil?.setUTCFullYear(2030);
    grant.lastEvaluatedAt.setUTCFullYear(2030);

    expect(grant.validUntil?.toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(grant.lastEvaluatedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(grant.listAllowedEvseIds()).toEqual([1, 2]);
  });

  test("rejects non-accepted status regardless of time window", () => {
    const grant = new AuthorizationGrant({
      credentialId: "cred-1",
      status: "blocked",
      source: "online",
      lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(grant.isAcceptedAt(new Date("2026-01-01T00:30:00.000Z"))).toBe(false);
    expect(grant.allowsEvse(99)).toBe(true);
  });

  test("uses transaction wording for concurrent authorization rejection", () => {
    const grant = new AuthorizationGrant({
      credentialId: "cred-1",
      status: "concurrent-transaction",
      source: "online",
      lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(grant.status).toBe("concurrent-transaction");
    expect(grant.isAcceptedAt(new Date("2026-01-01T00:30:00.000Z"))).toBe(false);
  });
});
