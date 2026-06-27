import { describe, expect, test } from "vitest";

import { TransportLifecycleMachine } from "../../../src/protocol/transport/websocket/TransportLifecycleMachine.ts";
import { TransportError } from "../../../src/protocol/transport/index.ts";

describe("TransportLifecycleMachine", () => {
  test("reuses the in-flight connect promise while the lifecycle is connecting", async () => {
    const lifecycle = new TransportLifecycleMachine();
    const firstOperation = lifecycle.startConnect();
    const secondOperation = lifecycle.startConnect();

    expect(secondOperation).toBe(firstOperation);
    expect(lifecycle.currentState).toBe("connecting");
    expect(lifecycle.connectPromise).toBe(firstOperation.promise);
    expect(lifecycle.completeConnect()).toBe(true);
    await expect(firstOperation.promise).resolves.toBeUndefined();
    expect(lifecycle.currentState).toBe("connected");
  });

  test("reuses the in-flight disconnect promise while the lifecycle is disconnecting", async () => {
    const lifecycle = new TransportLifecycleMachine();

    lifecycle.startConnect();
    expect(lifecycle.completeConnect()).toBe(true);

    const firstOperation = lifecycle.startDisconnect();
    const secondOperation = lifecycle.startDisconnect();

    expect(secondOperation).toBe(firstOperation);
    expect(lifecycle.currentState).toBe("disconnecting");
    expect(lifecycle.disconnectPromise).toBe(firstOperation.promise);
    expect(lifecycle.completeDisconnect()).toBe(true);
    await expect(firstOperation.promise).resolves.toBeUndefined();
    expect(lifecycle.currentState).toBe("disconnected");
  });

  test("rejects connect and resolves disconnect when disconnect interrupts connect", async () => {
    const lifecycle = new TransportLifecycleMachine();
    const connectOperation = lifecycle.startConnect();
    const connectAbortError = new TransportError(
      "INTERNAL_ERROR",
      "connect interrupted by disconnect",
    );

    const disconnectOperation =
      lifecycle.interruptConnectWithDisconnect(connectAbortError);

    await expect(connectOperation.promise).rejects.toEqual(connectAbortError);
    expect(lifecycle.currentState).toBe("disconnecting");
    expect(lifecycle.connectPromise).toBeUndefined();
    expect(lifecycle.completeConnect()).toBe(false);
    expect(lifecycle.completeDisconnect()).toBe(true);
    await expect(disconnectOperation.promise).resolves.toBeUndefined();
    expect(lifecycle.currentState).toBe("disconnected");
  });

  test("fails connect and disconnect operations with stable transport errors", async () => {
    const lifecycle = new TransportLifecycleMachine();
    const connectOperation = lifecycle.startConnect();
    const connectError = new TransportError(
      "CONNECT_FAILED",
      "connect failed",
    );

    expect(lifecycle.failConnect(connectError)).toBe(true);
    await expect(connectOperation.promise).rejects.toEqual(connectError);
    expect(lifecycle.currentState).toBe("disconnected");

    lifecycle.startConnect();
    expect(lifecycle.completeConnect()).toBe(true);

    const disconnectOperation = lifecycle.startDisconnect();
    const disconnectError = new TransportError(
      "INTERNAL_ERROR",
      "disconnect failed",
    );

    expect(lifecycle.failDisconnect(disconnectError)).toBe(true);
    await expect(disconnectOperation.promise).rejects.toEqual(disconnectError);
    expect(lifecycle.currentState).toBe("disconnected");
  });
});
