import { describe, expect, test } from "vitest";

import type { ProtocolMessage } from "../../../src/protocol/types.ts";
import { ProtocolMessageSender } from "../../../src/protocol/session/internal/ProtocolMessageSender.ts";
import { SessionError } from "../../../src/protocol/session/types.ts";
import { MemoryTransport, ConfigurableCodec } from "./testDoubles.ts";

describe("ProtocolMessageSender", () => {
  test("wraps codec encode failures in SessionError", () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    codec.encodeImplementation = () => {
      throw new Error("encode exploded");
    };
    const sender = new ProtocolMessageSender(codec, transport);

    expect(() =>
      sender.encode(
        {
          kind: "request",
          messageId: "msg-1",
          action: "Heartbeat",
          payload: {},
        },
        "自定义编码错误",
      ),
    ).toThrow(
      new SessionError("ENCODE_ERROR", "自定义编码错误", new Error("encode exploded")),
    );
  });

  test("wraps transport send failures in SessionError", async () => {
    const transport = new MemoryTransport();
    transport.sendImplementation = async () => {
      throw new Error("send exploded");
    };
    const sender = new ProtocolMessageSender(new ConfigurableCodec(), transport);

    await expect(sender.sendRaw("payload", "自定义发送错误")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "自定义发送错误",
    });
  });

  test("notifies after a protocol message is sent successfully", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    const sentMessages: ProtocolMessage[] = [];
    const sender = new ProtocolMessageSender(codec, transport, {
      onSent: (message) => {
        sentMessages.push(message);
      },
    });
    const message: ProtocolMessage = {
      kind: "request",
      messageId: "msg-1",
      action: "Heartbeat",
      payload: {},
    };

    await sender.send(message);

    expect(sentMessages).toEqual([message]);
  });

  test("does not notify when sending a protocol message fails", async () => {
    const transport = new MemoryTransport();
    transport.sendImplementation = async () => {
      throw new Error("send exploded");
    };
    const sentMessages: ProtocolMessage[] = [];
    const sender = new ProtocolMessageSender(new ConfigurableCodec(), transport, {
      onSent: (message) => {
        sentMessages.push(message);
      },
    });

    await expect(
      sender.send({
        kind: "request",
        messageId: "msg-1",
        action: "Heartbeat",
        payload: {},
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });

    expect(sentMessages).toEqual([]);
  });

  test("encodes and sends protocol messages with custom error messages", async () => {
    const transport = new MemoryTransport();
    const codec = new ConfigurableCodec();
    const sender = new ProtocolMessageSender(codec, transport);
    const message: ProtocolMessage = {
      kind: "response",
      messageId: "msg-1",
      payload: { accepted: true },
    };

    await sender.send(message, {
      encodeErrorMessage: "编码失败",
      sendErrorMessage: "发送失败",
    });

    expect(transport.sentMessages).toHaveLength(1);
    expect(JSON.parse(transport.sentMessages[0] as string)).toEqual(message);
  });
});
