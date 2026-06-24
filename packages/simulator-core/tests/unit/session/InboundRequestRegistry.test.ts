import { afterEach, describe, expect, vi, test } from "vitest";

import { InboundRequestRegistry } from "../../../src/protocol/session/internal/InboundRequestRegistry.ts";
import { SessionError } from "../../../src/protocol/session/types.ts";
import { flushMicrotasks } from "./testDoubles.ts";

describe("InboundRequestRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("allows only one successful reply per inbound request", async () => {
    const registry = new InboundRequestRegistry(1_000);
    const replies: unknown[] = [];
    const request = registry.create({
      action: "Heartbeat",
      payload: { ping: true },
      messageId: "msg-1",
      onRespond: async (payload) => {
        replies.push({ kind: "response", payload });
      },
      onReject: async (errorCode, errorMessage, details) => {
        replies.push({ kind: "error", errorCode, errorMessage, details });
      },
      onTimeout: () => {
        replies.push({ kind: "timeout" });
      },
    });

    await request.respond({ accepted: true });

    expect(replies).toEqual([{ kind: "response", payload: { accepted: true } }]);
    await expect(
      request.reject("InternalError", "should not be allowed"),
    ).rejects.toEqual(
      new SessionError("INTERNAL_ERROR", "入站请求已完成回复，不能重复回复"),
    );
  });

  test("invalidates pending requests when the session disconnects", async () => {
    const registry = new InboundRequestRegistry(1_000);
    const request = registry.create({
      action: "Heartbeat",
      payload: { ping: true },
      messageId: "msg-1",
      onRespond: async () => {},
      onReject: async () => {},
      onTimeout: () => {},
    });

    registry.invalidateAll();

    await expect(request.respond({ accepted: true })).rejects.toEqual(
      new SessionError("INTERNAL_ERROR", "入站请求已因连接断开失效"),
    );
  });

  test("rejects duplicate inbound message ids", () => {
    const registry = new InboundRequestRegistry(1_000);
    const registration = {
      action: "Heartbeat",
      payload: { ping: true },
      messageId: "msg-1",
      onRespond: async () => {},
      onReject: async () => {},
      onTimeout: () => {},
    };

    registry.create(registration);

    expect(() => registry.create(registration)).toThrow(
      new SessionError(
        "INTERNAL_ERROR",
        "入站请求 messageId 已存在，不能重复注册",
      ),
    );

    registry.invalidateAll();
  });

  test("invokes timeout handlers for unanswered inbound requests", async () => {
    vi.useFakeTimers();
    const timeouts: string[] = [];
    const registry = new InboundRequestRegistry(1_000);

    registry.create({
      action: "Heartbeat",
      payload: { ping: true },
      messageId: "msg-1",
      onRespond: async () => {},
      onReject: async () => {},
      onTimeout: () => {
        timeouts.push("msg-1");
      },
    });

    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();

    expect(timeouts).toEqual(["msg-1"]);
  });
});
