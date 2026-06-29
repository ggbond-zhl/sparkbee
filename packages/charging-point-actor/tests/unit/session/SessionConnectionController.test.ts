import { afterEach, describe, expect, vi, test } from "vitest";

import { SessionConnectionController } from "../../../src/protocol/session/internal/SessionConnectionController.ts";
import {
  createDeferredPromise,
  createTransportError,
  flushMicrotasks,
  MemoryTransport,
} from "./testDoubles.ts";

describe("SessionConnectionController", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("connects successfully and emits online", async () => {
    const transport = new MemoryTransport();
    const emitOnline = vi.fn(() => {});
    const controller = new SessionConnectionController({
      transport,
      reconnectOptions: undefined,
      resetMessagingState: () => {},
      emitOnline,
      emitOffline: () => {},
      emitReconnecting: () => {},
    });

    await controller.connect();

    expect(controller.state).toBe("online");
    expect(emitOnline).toHaveBeenCalledTimes(1);
  });

  test("disconnects an in-flight connect and emits intentional offline", async () => {
    const transport = new MemoryTransport();
    const connectOperation = createDeferredPromise<void>();
    transport.connectImplementation = () => connectOperation.promise;
    const offlineReasons: string[] = [];
    const controller = new SessionConnectionController({
      transport,
      reconnectOptions: undefined,
      resetMessagingState: () => {},
      emitOnline: () => {},
      emitOffline: (reason) => {
        offlineReasons.push(reason);
      },
      emitReconnecting: () => {},
    });

    const connectPromise = controller.connect();
    const disconnectPromise = controller.disconnect();

    await expect(connectPromise).rejects.toMatchObject({
      code: "CONNECT_ABORTED",
    });
    await expect(disconnectPromise).resolves.toBeUndefined();
    expect(controller.state).toBe("offline");
    expect(offlineReasons).toEqual(["intentional"]);
  });

  test("starts reconnecting after an unexpected disconnect and recovers", async () => {
    vi.useFakeTimers();
    const transport = new MemoryTransport();
    const initialError = createTransportError(
      "CONNECT_FAILED",
      "socket failed",
      new Error("ECONNREFUSED"),
    );
    transport.connectImplementation = async () => {
      if (transport.connectCalls === 1) {
        throw initialError;
      }
    };
    const reconnectAttempts: number[] = [];
    const reconnectErrors: unknown[] = [];
    const onlineEvents: string[] = [];
    const controller = new SessionConnectionController({
      transport,
      reconnectOptions: {
        initialDelayMs: 1_000,
        maxRetries: 2,
        jitter: false,
      },
      resetMessagingState: () => {},
      emitOnline: () => {
        onlineEvents.push("online");
      },
      emitOffline: () => {},
      emitReconnecting: (attempt, error) => {
        reconnectAttempts.push(attempt);
        reconnectErrors.push(error);
      },
      random: () => 0.5,
    });

    await expect(controller.connect()).rejects.toMatchObject({
      code: "CONNECT_FAILED",
    });
    expect(controller.state).toBe("reconnecting");
    expect(reconnectAttempts).toEqual([1]);
    expect(reconnectErrors).toEqual([
      expect.objectContaining({
        code: "CONNECT_FAILED",
        message: "建立底层链路失败",
        cause: initialError,
      }),
    ]);

    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();

    expect(controller.state).toBe("online");
    expect(onlineEvents).toEqual(["online"]);
    expect(transport.connectCalls).toBe(2);
  });

  test("emits offline when reconnect attempts are exhausted", async () => {
    vi.useFakeTimers();
    const transport = new MemoryTransport();
    const offlineReasons: string[] = [];
    transport.connectImplementation = async () => {};
    const controller = new SessionConnectionController({
      transport,
      reconnectOptions: {
        initialDelayMs: 1_000,
        maxRetries: 1,
        jitter: false,
      },
      resetMessagingState: () => {},
      emitOnline: () => {},
      emitOffline: (reason) => {
        offlineReasons.push(reason);
      },
      emitReconnecting: () => {},
      random: () => 0.5,
    });

    await controller.connect();
    transport.connectImplementation = async () => {
      throw new Error("reconnect failed");
    };

    controller.handleTransportDisconnected({ intentional: false });

    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();

    expect(controller.state).toBe("offline");
    expect(offlineReasons).toEqual(["reconnect_exhausted"]);
  });

  test("interrupts reconnecting sessions with an intentional disconnect", async () => {
    vi.useFakeTimers();
    const transport = new MemoryTransport();
    const resetMessagingState = vi.fn(() => {});
    const offlineReasons: string[] = [];
    const controller = new SessionConnectionController({
      transport,
      reconnectOptions: {
        initialDelayMs: 1_000,
        maxRetries: 2,
        jitter: false,
      },
      resetMessagingState,
      emitOnline: () => {},
      emitOffline: (reason) => {
        offlineReasons.push(reason);
      },
      emitReconnecting: () => {},
      random: () => 0.5,
    });

    await controller.connect();
    controller.handleTransportDisconnected({ intentional: false });

    await expect(controller.disconnect()).resolves.toBeUndefined();

    expect(resetMessagingState).toHaveBeenCalledTimes(1);
    expect(controller.state).toBe("offline");
    expect(offlineReasons).toEqual(["intentional"]);
  });
});
