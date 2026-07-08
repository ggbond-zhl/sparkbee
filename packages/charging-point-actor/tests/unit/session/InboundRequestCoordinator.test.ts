import { afterEach, describe, expect, vi, test } from "vitest";

import type { RequestMessage } from "../../../src/protocol/types.ts";
import { InboundRequestCoordinator } from "../../../src/protocol/session/internal/InboundRequestCoordinator.ts";
import { ProtocolMessageSender } from "../../../src/protocol/session/internal/ProtocolMessageSender.ts";
import type { InboundRequest, SessionLogEntry } from "../../../src/protocol/session/types.ts";
import {
  createValidator,
  ConfigurableCodec,
  flushMicrotasks,
  MemoryTransport,
} from "./testDoubles.ts";

function createMessageSender(transport: MemoryTransport): ProtocolMessageSender {
  return new ProtocolMessageSender(new ConfigurableCodec(), transport);
}

function createRequestMessage(): RequestMessage {
  return {
    kind: "request",
    messageId: "msg-1",
    action: "Heartbeat",
    payload: { ping: true },
  };
}

describe("InboundRequestCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("emits validated inbound requests and sends successful replies", async () => {
    const transport = new MemoryTransport();
    const emittedRequests: InboundRequest[] = [];
    const runtimeLogs: SessionLogEntry[] = [];
    const coordinator = new InboundRequestCoordinator({
      validator: createValidator(),
      inboundResponseTimeoutMs: 5_000,
      messageSender: createMessageSender(transport),
      emitInboundRequest: (request) => {
        emittedRequests.push(request);
      },
      emitSessionLog: (runtimeLog) => {
        runtimeLogs.push(runtimeLog);
      },
    });

    await coordinator.handleInboundRequest(createRequestMessage());
    expect(emittedRequests).toHaveLength(1);
    const inboundRequest = emittedRequests[0];
    if (inboundRequest === undefined) {
      throw new Error("Expected an emitted inbound request");
    }

    await inboundRequest.respond({ accepted: true });

    expect(runtimeLogs).toHaveLength(0);
    expect(JSON.parse(transport.sentMessages[0] as string)).toEqual({
      kind: "response",
      messageId: "msg-1",
      action: "Heartbeat",
      payload: { accepted: true },
      meta: {
        direction: "outbound",
      },
    });
  });

  test("sends an InternalError reply when the response payload fails validation", async () => {
    const transport = new MemoryTransport();
    const emittedRequests: InboundRequest[] = [];
    const coordinator = new InboundRequestCoordinator({
      validator: createValidator((action, payload, direction) => {
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
      }),
      inboundResponseTimeoutMs: 5_000,
      messageSender: createMessageSender(transport),
      emitInboundRequest: (request) => {
        emittedRequests.push(request);
      },
      emitSessionLog: () => {},
    });

    await coordinator.handleInboundRequest(createRequestMessage());
    const inboundRequest = emittedRequests[0];
    if (inboundRequest === undefined) {
      throw new Error("Expected an emitted inbound request");
    }

    await inboundRequest.respond({ accepted: true });

    expect(JSON.parse(transport.sentMessages[0] as string)).toEqual({
      kind: "error",
      messageId: "msg-1",
      action: "Heartbeat",
      errorCode: "InternalError",
      errorMessage: "response invalid",
      errorDetails: [
        {
          path: ["payload"],
          message: "response invalid",
          code: "invalid_type",
        },
      ],
      meta: {
        direction: "outbound",
      },
    });
  });

  test("reports runtimeLogs when invalid inbound requests cannot be auto-rejected", async () => {
    const transport = new MemoryTransport();
    transport.sendImplementation = async () => {
      throw new Error("send exploded");
    };
    const runtimeLogs: SessionLogEntry[] = [];
    const coordinator = new InboundRequestCoordinator({
      validator: createValidator(() => ({
        success: false,
        issues: [
          {
            path: ["payload"],
            message: "request invalid",
            code: "invalid_type",
          },
        ],
      })),
      inboundResponseTimeoutMs: 5_000,
      messageSender: createMessageSender(transport),
      emitInboundRequest: () => {
        throw new Error("should not emit request");
      },
      emitSessionLog: (runtimeLog) => {
        runtimeLogs.push(runtimeLog);
      },
    });

    await coordinator.handleInboundRequest(createRequestMessage());

    expect(runtimeLogs).toHaveLength(1);
    expect(runtimeLogs[0]).toMatchObject({
      source: "inbound_request",
      action: "Heartbeat",
      messageId: "msg-1",
      error: {
        code: "INBOUND_REQUEST_REPLY_FAILED",
      },
    });
    expect("requestId" in runtimeLogs[0]!).toBe(false);
  });

  test("reports runtimeLogs when timeout auto replies fail to send", async () => {
    vi.useFakeTimers();
    const transport = new MemoryTransport();
    transport.sendImplementation = async () => {
      throw new Error("send exploded");
    };
    const runtimeLogs: SessionLogEntry[] = [];
    const coordinator = new InboundRequestCoordinator({
      validator: createValidator(),
      inboundResponseTimeoutMs: 1_000,
      messageSender: createMessageSender(transport),
      emitInboundRequest: () => {},
      emitSessionLog: (runtimeLog) => {
        runtimeLogs.push(runtimeLog);
      },
    });

    await coordinator.handleInboundRequest(createRequestMessage());

    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    expect(runtimeLogs).toHaveLength(1);
    expect(runtimeLogs[0]).toMatchObject({
      source: "inbound_request",
      action: "Heartbeat",
      messageId: "msg-1",
      error: {
        code: "INBOUND_REQUEST_REPLY_FAILED",
      },
    });
    expect("requestId" in runtimeLogs[0]!).toBe(false);
  });
});
