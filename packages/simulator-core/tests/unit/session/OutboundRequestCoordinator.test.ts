import { describe, expect, test } from "vitest";

import type { ErrorMessage, ResponseMessage } from "../../../src/protocol/types.ts";
import { OutboundRequestCoordinator } from "../../../src/protocol/session/internal/OutboundRequestCoordinator.ts";
import { ProtocolMessageSender } from "../../../src/protocol/session/internal/ProtocolMessageSender.ts";
import { createValidator, ConfigurableCodec, flushMicrotasks, MemoryTransport } from "./testDoubles.ts";

function createCoordinator(options?: {
  outboundRequestPolicy?: "parallel" | "serial";
  validator?: ReturnType<typeof createValidator>;
  transport?: MemoryTransport;
  isConnected?: () => boolean;
}) {
  const transport = options?.transport ?? new MemoryTransport();
  const codec = new ConfigurableCodec();
  const sender = new ProtocolMessageSender(codec, transport);

  return {
    transport,
    coordinator: new OutboundRequestCoordinator({
      validator: options?.validator ?? createValidator(),
      messageSender: sender,
      outboundRequestTimeoutMs: 5_000,
      outboundRequestPolicy: options?.outboundRequestPolicy ?? "parallel",
      isConnected: options?.isConnected ?? (() => true),
      emitInboundProtocolMessage: () => {},
    }),
  };
}

function parseSentRequest(message: string) {
  return JSON.parse(message) as {
    messageId: string;
    action: string;
    payload: unknown;
    meta?: unknown;
  };
}

describe("OutboundRequestCoordinator", () => {
  test("handles frozen inbound responses without mutating them", async () => {
    const { coordinator, transport } = createCoordinator();
    const outboundRequest = coordinator.request("Heartbeat", { ping: true });
    const message = parseSentRequest(transport.sentMessages[0] as string);
    expect(message.meta).toEqual({
      direction: "outbound",
    });
    const inboundResponse = Object.freeze({
      kind: "response",
      messageId: message.messageId,
      payload: { accepted: true },
    }) as ResponseMessage;

    expect(() => coordinator.handleInboundReply(inboundResponse)).not.toThrow();
    await expect(outboundRequest).resolves.toEqual({
      kind: "response",
      payload: { accepted: true },
    });
  });

  test("queues serial outbound requests until the in-flight request settles", async () => {
    const { coordinator, transport } = createCoordinator({
      outboundRequestPolicy: "serial",
    });

    const firstRequest = coordinator.request("Heartbeat", { order: 1 });
    const secondRequest = coordinator.request("Heartbeat", { order: 2 });

    expect(transport.sentMessages).toHaveLength(1);

    const firstMessage = parseSentRequest(transport.sentMessages[0] as string);
    coordinator.handleInboundReply({
      kind: "response",
      messageId: firstMessage.messageId,
      payload: { accepted: 1 },
    });
    await expect(firstRequest).resolves.toEqual({
      kind: "response",
      payload: { accepted: 1 },
    });

    await flushMicrotasks();

    expect(transport.sentMessages).toHaveLength(2);

    const secondMessage = parseSentRequest(transport.sentMessages[1] as string);
    coordinator.handleInboundReply({
      kind: "response",
      messageId: secondMessage.messageId,
      payload: { accepted: 2 },
    });

    await expect(secondRequest).resolves.toEqual({
      kind: "response",
      payload: { accepted: 2 },
    });
  });

  test("rejects requests when sending the prepared payload fails", async () => {
    const transport = new MemoryTransport();
    transport.sendImplementation = async () => {
      throw new Error("send exploded");
    };
    const { coordinator } = createCoordinator({ transport });

    await expect(
      coordinator.request("Heartbeat", { ping: true }),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "发送出站请求失败",
    });
  });

  test("returns a FormationViolation result when the inbound response payload is invalid", async () => {
    const validator = createValidator((action, payload, direction) => {
      if (action === "Heartbeat" && direction === "response") {
        return {
          success: false,
          issues: [
            {
              path: ["payload"],
              message: "response invalid",
              code: "invalid_type",
            },
          ],
        };
      }

      return { success: true };
    });
    const { coordinator, transport } = createCoordinator({ validator });
    const outboundRequest = coordinator.request("Heartbeat", { ping: true });
    const message = parseSentRequest(transport.sentMessages[0] as string);

    coordinator.handleInboundReply({
      kind: "response",
      messageId: message.messageId,
      payload: { accepted: true },
    });

    await expect(outboundRequest).resolves.toEqual({
      kind: "error",
      errorCode: "FormationViolation",
      errorMessage: "response invalid",
      errorDetails: [
        {
          path: ["payload"],
          message: "response invalid",
          code: "invalid_type",
        },
      ],
    });
  });

  test("ignores replies that do not match any pending outbound request", () => {
    const { coordinator } = createCoordinator();
    const orphanReply: ErrorMessage = {
      kind: "error",
      messageId: "missing",
      errorCode: "InternalError",
      errorMessage: "missing",
      errorDetails: {},
    };

    expect(() => coordinator.handleInboundReply(orphanReply)).not.toThrow();
  });

  test("rejects queued and in-flight outbound requests when disconnected", async () => {
    const { coordinator } = createCoordinator({
      outboundRequestPolicy: "serial",
    });

    const inFlightRequest = coordinator.request("Heartbeat", { order: 1 });
    const queuedRequest = coordinator.request("Heartbeat", { order: 2 });

    coordinator.handleDisconnected();

    await expect(inFlightRequest).rejects.toMatchObject({
      code: "OUTBOUND_REQUEST_DISCONNECTED",
    });
    await expect(queuedRequest).rejects.toMatchObject({
      code: "OUTBOUND_REQUEST_ABORTED",
    });
  });
});
