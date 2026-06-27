import { describe, expect, test } from "vitest";

import * as transport from "../../../src/protocol/transport/index.ts";
import type {
  ITransport,
  ITransportEvents,
  TransportErrorCode,
  TransportEvents,
  WebSocketTransportOptions,
} from "../../../src/protocol/transport/index.ts";

function assertTransportTypes(
  instance: ITransport,
  events: TransportEvents,
  legacyEvents: ITransportEvents,
  errorCode: TransportErrorCode,
  options: WebSocketTransportOptions,
): void {
  expect(instance).toBeDefined();
  expect(events).toBe(legacyEvents);
  expect(errorCode).toBe("CONNECT_FAILED");
  expect(options.url).toBe("ws://localhost:3000");
}

describe("transport public API", () => {
  test("re-exports the stable transport surface from the transport barrel", () => {
    expect(transport.WebSocketTransport).toBeDefined();
    expect(transport.TransportError).toBeDefined();
  });

  test("exposes runtime APIs and typed transport contracts", () => {
    const eventMap: TransportEvents = {
      connected: () => {},
      connecting: () => {},
      disconnected: () => {},
      message: () => {},
      error: () => {},
    };
    const legacyEventMap: ITransportEvents = eventMap;
    const errorCode: TransportErrorCode = "CONNECT_FAILED";
    const options: WebSocketTransportOptions = {
      url: "ws://localhost:3000",
    };
    const instance = new transport.WebSocketTransport(options);

    assertTransportTypes(
      instance,
      eventMap,
      legacyEventMap,
      errorCode,
      options,
    );

    expect(new transport.TransportError(errorCode, "connect failed")).toMatchObject({
      name: "TransportError",
      code: "CONNECT_FAILED",
    });
  });

  test("does not leak internal transport helpers from the public barrel", () => {
    expect("TransportLifecycleMachine" in transport).toBe(false);
    expect("normalizeRawMessage" in transport).toBe(false);
  });
});
