import { afterEach, describe, expect, vi, test } from "vitest";

import { SessionLifecycleMachine } from "../../../src/protocol/session/internal/SessionLifecycleMachine.ts";
import { SessionError } from "../../../src/protocol/session/types.ts";
import { flushMicrotasks } from "./testDoubles.ts";

describe("SessionLifecycleMachine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("tracks initial connect progress and completion", async () => {
    const lifecycle = new SessionLifecycleMachine();
    const operation = lifecycle.beginInitialConnect();

    expect(lifecycle.currentPhase).toBe("connecting");
    expect(lifecycle.state).toBe("offline");
    expect(lifecycle.connectPromise).toBe(operation.promise);

    expect(lifecycle.completeInitialConnect(operation)).toBe(true);
    await expect(operation.promise).resolves.toBeUndefined();
    expect(lifecycle.currentPhase).toBe("connected");
    expect(lifecycle.state).toBe("online");
  });

  test("fails and aborts initial connects with stable session errors", async () => {
    const lifecycle = new SessionLifecycleMachine();
    const failedOperation = lifecycle.beginInitialConnect();
    const failedError = new SessionError("CONNECT_FAILED", "connect failed");

    expect(lifecycle.failInitialConnect(failedOperation, failedError)).toBe(true);
    await expect(failedOperation.promise).rejects.toEqual(failedError);
    expect(lifecycle.currentPhase).toBe("idle");

    const abortedOperation = lifecycle.beginInitialConnect();
    lifecycle.abortInitialConnect(
      new SessionError("CONNECT_ABORTED", "connect aborted"),
    );

    await expect(abortedOperation.promise).rejects.toMatchObject({
      code: "CONNECT_ABORTED",
    });
    expect(lifecycle.connectPromise).toBeUndefined();
  });

  test("tracks disconnect completion and failure", async () => {
    const lifecycle = new SessionLifecycleMachine();
    const disconnectOperation = lifecycle.beginDisconnect();

    expect(lifecycle.currentPhase).toBe("disconnecting");
    expect(lifecycle.disconnectPromise).toBe(disconnectOperation.promise);
    expect(lifecycle.completeDisconnect(disconnectOperation)).toBe(true);
    await expect(disconnectOperation.promise).resolves.toBeUndefined();

    const failedOperation = lifecycle.beginDisconnect();
    const error = new SessionError("DISCONNECT_FAILED", "disconnect failed");

    expect(lifecycle.failDisconnect(failedOperation, error)).toBe(true);
    await expect(failedOperation.promise).rejects.toEqual(error);
    expect(lifecycle.currentPhase).toBe("idle");
  });

  test("tracks reconnect completion, exhaustion, and aborts", async () => {
    const lifecycle = new SessionLifecycleMachine();
    const completedReconnect = lifecycle.beginReconnect();

    expect(lifecycle.currentPhase).toBe("reconnecting");
    expect(lifecycle.state).toBe("reconnecting");
    expect(lifecycle.completeReconnect(completedReconnect)).toBe(true);
    await expect(completedReconnect.promise).resolves.toBeUndefined();
    expect(lifecycle.currentPhase).toBe("connected");

    const exhaustedReconnect = lifecycle.beginReconnect();
    const exhaustedError = new SessionError(
      "RECONNECT_EXHAUSTED",
      "reconnect exhausted",
    );

    expect(lifecycle.exhaustReconnect(exhaustedReconnect, exhaustedError)).toBe(
      true,
    );
    await expect(exhaustedReconnect.promise).rejects.toEqual(exhaustedError);

    const abortedReconnect = lifecycle.beginReconnect();
    lifecycle.abortReconnect();

    await expect(abortedReconnect.promise).rejects.toMatchObject({
      code: "CONNECT_ABORTED",
    });
    lifecycle.moveToIdle();
    expect(lifecycle.currentPhase).toBe("idle");
  });

  test("schedules and clears reconnect timers", async () => {
    vi.useFakeTimers();
    const lifecycle = new SessionLifecycleMachine();
    const callbacks: string[] = [];

    lifecycle.scheduleReconnect(1_000, () => {
      callbacks.push("first");
    });
    lifecycle.scheduleReconnect(1_000, () => {
      callbacks.push("second");
    });

    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();

    expect(callbacks).toEqual(["second"]);

    lifecycle.scheduleReconnect(1_000, () => {
      callbacks.push("third");
    });
    lifecycle.clearReconnectTimer();
    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();

    expect(callbacks).toEqual(["second"]);
  });
});
