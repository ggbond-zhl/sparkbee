import { describe, expect, test } from "vitest";

import { LocalAuthorizationList } from "../../../../src/model/index.ts";

describe("LocalAuthorizationList", () => {
  test("tracks entries and replaces full lists immutably", () => {
    const state = new LocalAuthorizationList({
      chargingPointId: "cp-1",
      version: 1,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      source: "ocpp16",
      entries: ["cred-1", "cred-2"],
    });

    const replaced = state.replaceEntries(
      2,
      new Date("2026-01-01T01:00:00.000Z"),
      "ocpp201",
      ["cred-3"],
    );

    expect(state.listEntries()).toEqual(["cred-1", "cred-2"]);
    expect(state.hasCredential("cred-1")).toBe(true);
    expect(replaced.version).toBe(2);
    expect(replaced.source).toBe("ocpp201");
    expect(replaced.listEntries()).toEqual(["cred-3"]);
  });

  test("returns defensive copies for dates and entries", () => {
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    const state = new LocalAuthorizationList({
      chargingPointId: "cp-1",
      version: 1,
      updatedAt,
      source: "ocpp16",
      entries: ["cred-1"],
    });

    updatedAt.setUTCFullYear(2030);
    const listed = state.listEntries();
    listed.push("cred-2");
    state.updatedAt.setUTCFullYear(2030);

    expect(state.updatedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(state.listEntries()).toEqual(["cred-1"]);
  });

  test("tracks local authorization entry details defensively", () => {
    const validUntil = new Date("2026-06-01T00:00:00.000Z");
    const state = new LocalAuthorizationList({
      chargingPointId: "cp-1",
      version: 1,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      source: "ocpp16",
      entries: [
        {
          credentialId: "cred-1",
          status: "blocked",
          validUntil,
          groupCredentialId: "group-1",
        },
      ],
    });

    validUntil.setUTCFullYear(2030);
    const entry = state.getEntry("cred-1");
    entry?.validUntil?.setUTCFullYear(2030);

    expect(state.getEntry("cred-1")).toEqual({
      credentialId: "cred-1",
      status: "blocked",
      validUntil: new Date("2026-06-01T00:00:00.000Z"),
      groupCredentialId: "group-1",
    });
    expect(state.listAuthorizationEntries()).toEqual([
      {
        credentialId: "cred-1",
        status: "blocked",
        validUntil: new Date("2026-06-01T00:00:00.000Z"),
        groupCredentialId: "group-1",
      },
    ]);
  });
});
