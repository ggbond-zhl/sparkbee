import { describe, expect, test } from "vitest";

import { ProtocolError, type DecodeResult } from "../../../src/protocol/types.ts";
import { Ocpp16Codec } from "../../../src/protocol/codec/index.ts";
import { ChargingPointSession } from "../../../src/protocol/session/index.ts";
import type {
  ProtocolMessageEvent,
  SessionActorLogEntry,
} from "../../../src/protocol/session/types.ts";
import {
  createValidator,
  ConfigurableCodec,
  createTransportError,
  flushMicrotasks,
  MemoryTransport,
} from "./testDoubles.ts";

describe("ChargingPointSession", () => {
  test("emits sessionError for transport runtime errors without changing state", () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    const session = new ChargingPointSession({
      transport,
      codec,
      validator: createValidator(),
    });
    const actorLogs: SessionActorLogEntry[] = [];

    session.on("sessionError", (actorLog) => {
      actorLogs.push(actorLog);
    });

    expect(() => {
      transport.emitError(
        createTransportError("INTERNAL_ERROR", "runtime socket error"),
      );
    }).not.toThrow();

    expect(session.state).toBe("offline");
    expect(actorLogs).toHaveLength(1);
    expect(actorLogs[0]).toMatchObject({
      source: "transport",
      error: {
        code: "TRANSPORT_RUNTIME_ERROR",
        message: "transport 运行时异常",
      },
    });
  });

  test("emits sessionError when inbound decoding returns a protocol failure", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    codec.decodeImplementation = (): DecodeResult => ({
      success: false,
      error: new ProtocolError("DECODE_ERROR", "frame malformed"),
    });
    const session = new ChargingPointSession({
      transport,
      codec,
      validator: createValidator(),
    });
    const actorLogs: SessionActorLogEntry[] = [];

    session.on("sessionError", (actorLog) => {
      actorLogs.push(actorLog);
    });

    await session.connect();
    transport.emitMessage('[2,"msg-1","Heartbeat",{}]');

    expect(session.state).toBe("online");
    expect(actorLogs).toHaveLength(1);
    expect(actorLogs[0]).toMatchObject({
      source: "decode",
      raw: '[2,"msg-1","Heartbeat",{}]',
      error: {
        code: "DECODE_ERROR",
        message: "入站消息解码失败",
      },
    });
  });

  test("emits sessionError when inbound decoding throws unexpectedly", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    codec.decodeImplementation = () => {
      throw new Error("decode exploded");
    };
    const session = new ChargingPointSession({
      transport,
      codec,
      validator: createValidator(),
    });
    const actorLogs: SessionActorLogEntry[] = [];

    session.on("sessionError", (actorLog) => {
      actorLogs.push(actorLog);
    });

    await session.connect();
    transport.emitMessage('[2,"msg-1","Heartbeat",{}]');

    expect(actorLogs).toHaveLength(1);
    expect(actorLogs[0]).toMatchObject({
      source: "decode",
      raw: '[2,"msg-1","Heartbeat",{}]',
      error: {
        code: "DECODE_ERROR",
        message: "入站消息解码发生内部异常",
      },
    });
  });

  test("emits decoded inbound requests as protocol messages", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    codec.decodeImplementation = (): DecodeResult => ({
      success: true,
      message: {
        kind: "request",
        messageId: "msg-1",
        action: "Heartbeat",
        payload: {},
      },
    });
    const session = new ChargingPointSession({
      transport,
      codec,
      validator: createValidator(),
      protocolVersion: "OCPP16J",
    });
    const protocolMessages: ProtocolMessageEvent[] = [];

    session.on("protocolMessage", (event) => {
      protocolMessages.push(event);
    });

    await session.connect();
    transport.emitMessage('[2,"msg-1","Heartbeat",{}]');

    expect(protocolMessages).toEqual([
      {
        protocol: "OCPP16J",
        direction: "inbound",
        messageKind: "request",
        messageId: "msg-1",
        action: "Heartbeat",
        payload: {},
      },
    ]);
  });

  test("emits outbound requests as protocol messages after send succeeds", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    const session = new ChargingPointSession({
      transport,
      codec,
      validator: createValidator(),
      protocolVersion: "OCPP16J",
    });
    const protocolMessages: ProtocolMessageEvent[] = [];

    session.on("protocolMessage", (event) => {
      protocolMessages.push(event);
    });

    await session.connect();
    const outboundRequest = session.request("Heartbeat", { ping: true });
    await flushMicrotasks();

    const sentRequest = JSON.parse(transport.sentMessages[0] as string) as {
      messageId: string;
    };

    expect(protocolMessages).toEqual([
      {
        protocol: "OCPP16J",
        direction: "outbound",
        messageKind: "request",
        messageId: sentRequest.messageId,
        action: "Heartbeat",
        payload: { ping: true },
      },
    ]);

    codec.decodeImplementation = () => ({
      success: true,
      message: {
        kind: "response",
        messageId: sentRequest.messageId,
        payload: { currentTime: "2026-01-01T00:00:00.000Z" },
      },
    });
    transport.emitMessage('[3,"ignored",{}]');

    await expect(outboundRequest).resolves.toEqual({
      kind: "response",
      payload: { currentTime: "2026-01-01T00:00:00.000Z" },
    });
  });

  test("emits inbound requests with normalized inbound metadata", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    codec.decodeImplementation = (): DecodeResult => ({
      success: true,
      message: {
        kind: "request",
        messageId: "msg-1",
        action: "Heartbeat",
        payload: {},
      },
    });
    const session = new ChargingPointSession({
      transport,
      codec,
      validator: createValidator(),
    });
    const inboundRequestPromise = new Promise<
      Parameters<
        Parameters<typeof session.on<"inboundRequest">>[1]
      >[0]
    >((resolve) => {
      session.on("inboundRequest", resolve);
    });

    await session.connect();
    transport.emitMessage('[2,"msg-1","Heartbeat",{}]');

    const inboundRequest = await inboundRequestPromise;

    expect(inboundRequest.action).toBe("Heartbeat");
    expect(inboundRequest.messageId).toBe("msg-1");
    expect("requestId" in inboundRequest).toBe(false);
    expect(session.state).toBe("online");
  });

  test("delegates connect state through isConnected() and disconnect()", async () => {
    const transport = new MemoryTransport();
    const session = new ChargingPointSession({
      transport,
      codec: new ConfigurableCodec(),
      validator: createValidator(),
    });

    expect(session.isConnected()).toBe(false);

    await session.connect();
    expect(session.isConnected()).toBe(true);

    await session.disconnect();
    expect(session.isConnected()).toBe(false);
    expect(session.state).toBe("offline");
  });

  test("routes inbound responses back to request() callers", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    let responseMessageId = "";
    codec.decodeImplementation = () => ({
      success: true,
      message: {
        kind: "response",
        messageId: responseMessageId,
        payload: { accepted: true },
      },
    });
    const session = new ChargingPointSession({
      transport,
      codec,
      validator: createValidator(),
    });

    await session.connect();

    const outboundRequest = session.request("Heartbeat", { ping: true });
    const sentRequest = JSON.parse(transport.sentMessages[0] as string) as {
      messageId: string;
    };
    responseMessageId = sentRequest.messageId;

    transport.emitMessage('[3,"ignored",{}]');

    await expect(outboundRequest).resolves.toEqual({
      kind: "response",
      payload: { accepted: true },
    });
  });

  test("emits inbound replies with the matched outbound action", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    let responseMessageId = "";
    codec.decodeImplementation = () => ({
      success: true,
      message: {
        kind: "response",
        messageId: responseMessageId,
        payload: { accepted: true },
      },
    });
    const session = new ChargingPointSession({
      transport,
      codec,
      validator: createValidator(),
      protocolVersion: "OCPP16J",
    });
    const protocolMessages: ProtocolMessageEvent[] = [];

    session.on("protocolMessage", (event) => {
      protocolMessages.push(event);
    });

    await session.connect();

    const outboundRequest = session.request("Heartbeat", { ping: true });
    const sentRequest = JSON.parse(transport.sentMessages[0] as string) as {
      messageId: string;
    };
    responseMessageId = sentRequest.messageId;

    transport.emitMessage('[3,"ignored",{}]');

    await expect(outboundRequest).resolves.toEqual({
      kind: "response",
      payload: { accepted: true },
    });

    expect(protocolMessages).toContainEqual({
      protocol: "OCPP16J",
      direction: "inbound",
      messageKind: "response",
      messageId: sentRequest.messageId,
      action: "Heartbeat",
      payload: { accepted: true },
    });
  });

  test("emits outbound responses to inbound requests with the inbound action", async () => {
    const transport = new MemoryTransport();
    const session = new ChargingPointSession({
      transport,
      codec: new Ocpp16Codec(),
      validator: createValidator(),
      protocolVersion: "OCPP16J",
    });
    const protocolMessages: ProtocolMessageEvent[] = [];
    const inboundRequestPromise = new Promise<
      Parameters<
        Parameters<typeof session.on<"inboundRequest">>[1]
      >[0]
    >((resolve) => {
      session.on("inboundRequest", resolve);
    });

    session.on("protocolMessage", (event) => {
      protocolMessages.push(event);
    });

    await session.connect();
    transport.emitMessage(
      '[2,"msg-remote-1","RemoteStartTransaction",{"idTag":"TAG001"}]',
    );

    const inboundRequest = await inboundRequestPromise;
    await inboundRequest.respond({ status: "Accepted" });

    expect(transport.sentMessages).toContain(
      '[3,"msg-remote-1",{"status":"Accepted"}]',
    );
    expect(protocolMessages).toContainEqual({
      protocol: "OCPP16J",
      direction: "outbound",
      messageKind: "response",
      messageId: "msg-remote-1",
      action: "RemoteStartTransaction",
      payload: { status: "Accepted" },
    });
  });

  test("emits outbound errors to inbound requests with the inbound action", async () => {
    const transport = new MemoryTransport();
    const session = new ChargingPointSession({
      transport,
      codec: new Ocpp16Codec(),
      validator: createValidator(),
      protocolVersion: "OCPP16J",
    });
    const protocolMessages: ProtocolMessageEvent[] = [];
    const inboundRequestPromise = new Promise<
      Parameters<
        Parameters<typeof session.on<"inboundRequest">>[1]
      >[0]
    >((resolve) => {
      session.on("inboundRequest", resolve);
    });

    session.on("protocolMessage", (event) => {
      protocolMessages.push(event);
    });

    await session.connect();
    transport.emitMessage(
      '[2,"msg-remote-2","RemoteStartTransaction",{"idTag":"TAG001"}]',
    );

    const inboundRequest = await inboundRequestPromise;
    await inboundRequest.reject("NotSupported", "RemoteStartTransaction 暂不支持", {
      reason: "test",
    });

    expect(transport.sentMessages).toContain(
      '[4,"msg-remote-2","NotSupported","RemoteStartTransaction 暂不支持",{"reason":"test"}]',
    );
    expect(protocolMessages).toContainEqual({
      protocol: "OCPP16J",
      direction: "outbound",
      messageKind: "error",
      messageId: "msg-remote-2",
      action: "RemoteStartTransaction",
      errorCode: "NotSupported",
      errorMessage: "RemoteStartTransaction 暂不支持",
      errorDetails: { reason: "test" },
    });
  });

  test("removes offline listeners before transport disconnect events fire", async () => {
    const transport = new MemoryTransport();
    const session = new ChargingPointSession({
      transport,
      codec: new ConfigurableCodec(),
      validator: createValidator(),
    });
    const offlineReasons: string[] = [];
    const offlineListener = (reason: Parameters<
      Parameters<typeof session.on<"offline">>[1]
    >[0]) => {
      offlineReasons.push(reason);
    };

    session.on("offline", offlineListener);
    session.off("offline", offlineListener);

    await session.connect();
    transport.emitDisconnected({ intentional: false });

    expect(offlineReasons).toEqual([]);
    expect(session.state).toBe("offline");
  });
});
