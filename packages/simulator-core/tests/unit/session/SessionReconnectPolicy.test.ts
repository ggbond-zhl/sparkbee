import { describe, expect, test } from "vitest";

import { SessionReconnectPolicy } from "../../../src/protocol/session/internal/SessionReconnectPolicy.ts";

describe("SessionReconnectPolicy", () => {
  test("calculates exponential backoff without jitter", () => {
    const policy = new SessionReconnectPolicy(
      {
        initialDelayMs: 1_000,
        maxDelayMs: 5_000,
        jitter: false,
      },
      () => 0.5,
    );

    expect(policy.getDelayMs(1)).toBe(1_000);
    expect(policy.getDelayMs(2)).toBe(2_000);
    expect(policy.getDelayMs(4)).toBe(5_000);
  });

  test("applies jitter using the injected random source", () => {
    const policy = new SessionReconnectPolicy(
      {
        initialDelayMs: 1_000,
        maxDelayMs: 60_000,
        jitter: true,
      },
      () => 0.25,
    );

    expect(policy.getDelayMs(3)).toBe(1_000);
  });

  test("uses an infinite retry budget by default", () => {
    const policy = new SessionReconnectPolicy(undefined, () => 0.5);

    expect(policy.getMaxRetries()).toBe(Number.POSITIVE_INFINITY);
  });
});
