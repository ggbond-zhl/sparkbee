import { afterEach, describe, expect, vi, test } from "vitest";

import { PendingOutboundRequestRegistry } from "../../../src/protocol/session/internal/PendingOutboundRequestRegistry.ts";
import { SessionError } from "../../../src/protocol/session/types.ts";
import { flushMicrotasks } from "./testDoubles.ts";

describe("PendingOutboundRequestRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("rejects pending requests when they time out", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn(() => {});
    const registry = new PendingOutboundRequestRegistry({ onTimeout });
    const pendingRequest = registry.register("msg-1", "Heartbeat", 1_000);

    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();

    expect(onTimeout).toHaveBeenCalledWith("msg-1", "Heartbeat");
    await expect(pendingRequest).rejects.toMatchObject({
      code: "OUTBOUND_REQUEST_TIMEOUT",
      message: "等待 Heartbeat 响应超时",
    });
  });

  test("claims pending requests and resolves them once", async () => {
    const registry = new PendingOutboundRequestRegistry();
    const pendingRequest = registry.register("msg-1", "Heartbeat", 1_000);
    const handle = registry.claim("msg-1");

    expect(handle).toBeDefined();
    handle?.resolve({ kind: "response", payload: { accepted: true } });

    await expect(pendingRequest).resolves.toEqual({
      kind: "response",
      payload: { accepted: true },
    });
    expect(registry.claim("msg-1")).toBeUndefined();
  });

  test("rejects all pending requests when the connection drops", async () => {
    const onDisconnected = vi.fn(() => {});
    const registry = new PendingOutboundRequestRegistry({ onDisconnected });
    const pendingRequest = registry.register("msg-1", "Heartbeat", 1_000);

    registry.rejectAllDisconnected();

    expect(onDisconnected).toHaveBeenCalledWith("msg-1", "Heartbeat");
    await expect(pendingRequest).rejects.toEqual(
      new SessionError(
        "OUTBOUND_REQUEST_DISCONNECTED",
        "连接已断开，未收到响应",
      ),
    );
  });
});
