import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  TransportError,
  WebSocketTransport,
} from "../../../src/index.ts";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly URL: string;
  readonly protocol = "";
  readonly extensions = "";
  readonly bufferedAmount = 0;
  binaryType: "arraybuffer" | "nodebuffer" = "nodebuffer";
  readyState:
    | typeof FakeWebSocket.CONNECTING
    | typeof FakeWebSocket.OPEN
    | typeof FakeWebSocket.CLOSING
    | typeof FakeWebSocket.CLOSED = FakeWebSocket.CONNECTING;
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  sendCalls: Array<string | ArrayBufferLike | ArrayBufferView> = [];
  sendError?: unknown;
  terminated = false;

  constructor(url: string | URL) {
    this.url = String(url);
    this.URL = this.url;
    FakeWebSocket.instances.push(this);
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  send(data: string | ArrayBufferLike | ArrayBufferView): void {
    if (this.sendError !== undefined) {
      throw this.sendError;
    }

    this.sendCalls.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = FakeWebSocket.CLOSING;
  }

  terminate(): void {
    this.terminated = true;
    this.readyState = FakeWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.call(this as unknown as WebSocket, new Event("open"));
  }

  emitMessage(data: unknown): void {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent("message", { data }),
    );
  }

  emitClose(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.call(
      this as unknown as WebSocket,
      new CloseEvent("close", { code, reason }),
    );
  }

  emitError(): void {
    this.onerror?.call(this as unknown as WebSocket, new Event("error"));
  }
}

const OriginalWebSocket = globalThis.WebSocket;

function getSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[0];
  if (socket === undefined) {
    throw new Error("Expected a fake WebSocket instance");
  }

  return socket;
}

describe("WebSocketTransport", () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket;
    FakeWebSocket.reset();
  });

  test("reuses the in-flight connect promise while the socket is connecting", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    const firstConnect = transport.connect();
    const secondConnect = transport.connect();
    const socket = getSocket();

    expect(secondConnect).toBe(firstConnect);
    expect(FakeWebSocket.instances).toHaveLength(1);

    socket.open();

    await expect(firstConnect).resolves.toBeUndefined();
    expect(transport.isConnected()).toBe(true);
  });

  test("sets inbound binary frames to ArrayBuffer mode when connecting", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    const connectPromise = transport.connect();
    const socket = getSocket();

    expect(socket.binaryType).toBe("arraybuffer");

    socket.open();

    await expect(connectPromise).resolves.toBeUndefined();
  });

  test("rejects connect and resolves disconnect when disconnect is requested during connect", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    const connectPromise = transport.connect();
    const disconnectPromise = transport.disconnect();
    const socket = getSocket();

    await expect(connectPromise).rejects.toMatchObject({
      name: "TransportError",
      code: "INTERNAL_ERROR",
    } satisfies Partial<TransportError>);

    expect(socket.closeCalls).toEqual([{ code: 1000, reason: undefined }]);

    socket.emitClose(1000);

    await expect(disconnectPromise).resolves.toBeUndefined();
    expect(transport.isConnected()).toBe(false);
  });

  test("does not emit connected when open arrives after disconnect interrupts connect", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });
    let connectedEvents = 0;

    transport.on("connected", () => {
      connectedEvents += 1;
    });

    const connectPromise = transport.connect();
    const disconnectPromise = transport.disconnect();
    const socket = getSocket();

    await expect(connectPromise).rejects.toMatchObject({
      name: "TransportError",
      code: "INTERNAL_ERROR",
    } satisfies Partial<TransportError>);

    socket.open();

    expect(connectedEvents).toBe(0);
    expect(transport.isConnected()).toBe(false);

    socket.emitClose(1000);

    await expect(disconnectPromise).resolves.toBeUndefined();
    expect(transport.isConnected()).toBe(false);
  });

  test("reuses the in-flight disconnect promise while the socket is disconnecting", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    const firstDisconnect = transport.disconnect();
    const secondDisconnect = transport.disconnect();

    expect(secondDisconnect).toBe(firstDisconnect);
    expect(socket.closeCalls).toEqual([{ code: 1000, reason: undefined }]);

    socket.emitClose(1000);

    await expect(firstDisconnect).resolves.toBeUndefined();
    expect(transport.isConnected()).toBe(false);
  });

  test("rejects connect on timeout, cleans up the socket, and terminates it", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1,
    });

    const connectPromise = transport.connect();
    const socket = getSocket();

    await expect(connectPromise).rejects.toMatchObject({
      name: "TransportError",
      code: "CONNECT_TIMEOUT",
    } satisfies Partial<TransportError>);

    expect(socket.terminated).toBe(true);
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(transport.isConnected()).toBe(false);
  });

  test("rejects connect immediately when the socket errors before opening", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    const connectPromise = transport.connect();
    const socket = getSocket();

    socket.emitError();

    await expect(connectPromise).rejects.toMatchObject({
      name: "TransportError",
      code: "CONNECT_FAILED",
    } satisfies Partial<TransportError>);

    expect(socket.terminated).toBe(true);
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(transport.isConnected()).toBe(false);
  });

  test("emits an unexpected disconnect event when the connected socket closes", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });
    const disconnectedEvents: Array<{
      intentional: boolean;
      code?: number;
      reason?: string;
      cause?: unknown;
    }> = [];

    transport.on("disconnected", (event) => {
      disconnectedEvents.push(event);
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    socket.emitClose(1006, "network lost");

    expect(disconnectedEvents).toHaveLength(1);
    expect(disconnectedEvents[0]).toMatchObject({
      intentional: false,
      code: 1006,
      reason: "network lost",
    });
    expect(disconnectedEvents[0]?.cause).toBeInstanceOf(TransportError);
    expect((disconnectedEvents[0]?.cause as TransportError).code).toBe(
      "DISCONNECTED_UNEXPECTEDLY",
    );
  });

  test("does not throw when an invalid message arrives without an error listener", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    expect(() => {
      socket.emitMessage({ unsupported: true });
    }).not.toThrow();
  });

  test("emits transport errors to registered error listeners", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });
    const errors: TransportError[] = [];

    transport.on("error", (error) => {
      errors.push(error);
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    socket.emitMessage({ unsupported: true });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TransportError);
    expect(errors[0]?.code).toBe("INTERNAL_ERROR");
  });

  test("emits runtime transport errors without changing connection state when the socket stays open", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });
    const errors: TransportError[] = [];

    transport.on("error", (error) => {
      errors.push(error);
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    socket.emitError();
    await Promise.resolve();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TransportError);
    expect(errors[0]?.code).toBe("INTERNAL_ERROR");
    expect(transport.isConnected()).toBe(true);
  });

  test("emits disconnected when the socket errors after it has already left OPEN without a close event", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });
    const disconnectedEvents: Array<{
      intentional: boolean;
      code?: number;
      reason?: string;
      cause?: unknown;
    }> = [];

    transport.on("disconnected", (event) => {
      disconnectedEvents.push(event);
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    socket.readyState = FakeWebSocket.CLOSING;
    socket.emitError();
    await Promise.resolve();

    expect(disconnectedEvents).toHaveLength(1);
    expect(disconnectedEvents[0]).toMatchObject({
      intentional: false,
    });
    expect(disconnectedEvents[0]?.cause).toBeInstanceOf(TransportError);
    expect((disconnectedEvents[0]?.cause as TransportError).code).toBe(
      "DISCONNECTED_UNEXPECTEDLY",
    );
    expect(transport.isConnected()).toBe(false);
  });

  test("does not emit duplicate disconnects when error is followed by close", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });
    const disconnectedEvents: Array<{
      intentional: boolean;
      code?: number;
      reason?: string;
      cause?: unknown;
    }> = [];
    const errors: TransportError[] = [];

    transport.on("disconnected", (event) => {
      disconnectedEvents.push(event);
    });
    transport.on("error", (error) => {
      errors.push(error);
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    socket.emitError();
    socket.emitClose(1006, "network lost");
    await Promise.resolve();

    expect(disconnectedEvents).toHaveLength(1);
    expect(disconnectedEvents[0]).toMatchObject({
      intentional: false,
      code: 1006,
      reason: "network lost",
    });
    expect(errors).toHaveLength(0);
    expect(transport.isConnected()).toBe(false);
  });

  test("copies ArrayBuffer payloads before emitting them", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });
    const messages: Uint8Array[] = [];

    transport.on("message", (message) => {
      if (message instanceof Uint8Array) {
        messages.push(message);
      }
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    const source = new Uint8Array([1, 2, 3]).buffer;
    socket.emitMessage(source);
    new Uint8Array(source)[0] = 99;

    expect(messages).toHaveLength(1);
    expect(Array.from(messages[0]!)).toEqual([1, 2, 3]);
  });

  test("throws SEND_FAILED when send is called before the socket is connected", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    await expect(transport.send("ping")).rejects.toMatchObject({
      name: "TransportError",
      code: "SEND_FAILED",
    } satisfies Partial<TransportError>);
  });

  test("wraps underlying socket send errors in SEND_FAILED transport errors", async () => {
    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    const connectPromise = transport.connect();
    const socket = getSocket();
    socket.open();
    await connectPromise;

    const sendError = new Error("send exploded");
    socket.sendError = sendError;

    await expect(transport.send("ping")).rejects.toMatchObject({
      name: "TransportError",
      code: "SEND_FAILED",
      cause: sendError,
    } satisfies Partial<TransportError>);
  });

  test("rejects connect with CONNECT_FAILED when socket construction throws", async () => {
    class ThrowingWebSocket {
      constructor() {
        throw new Error("constructor exploded");
      }
    }

    globalThis.WebSocket = ThrowingWebSocket as unknown as typeof WebSocket;

    const transport = new WebSocketTransport({
      url: "ws://localhost:3000",
      connectTimeoutMs: 1_000,
    });

    await expect(transport.connect()).rejects.toMatchObject({
      name: "TransportError",
      code: "CONNECT_FAILED",
    } satisfies Partial<TransportError>);
    expect(transport.isConnected()).toBe(false);
  });
});
