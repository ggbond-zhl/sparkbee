import { describe, expect, test } from "vitest";
import type {
  TransactionDeliveryChangedEvent,
  TransactionDeliveryItem,
} from "@spark-bee/contracts";

import { mergeTransactionDeliveryItems } from "../../src/features/charging-points/model/useTransactionDeliveries";

describe("交易交付列表", () => {
  test("按 messageId 合并 SSE 状态并保持单桩序号倒序", () => {
    const history = [{
      id: "00000000-0000-4000-8000-000000000001",
      messageId: "00000000-0000-4000-8000-000000000011",
      transactionId: "transaction-1",
      ocppTransactionId: null,
      deliverySequence: "10",
      messageType: "start",
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: null,
      occurredAt: "2026-07-20T00:00:00.000Z",
      lastError: null,
    }] satisfies TransactionDeliveryItem[];
    const liveEvents = [
      createEvent({
        messageId: "00000000-0000-4000-8000-000000000012",
        deliverySequence: "11",
        status: "pending",
        attemptCount: 0,
      }),
      createEvent({
        messageId: "00000000-0000-4000-8000-000000000011",
        deliverySequence: "10",
        status: "retry_wait",
        attemptCount: 1,
      }),
    ];

    const merged = mergeTransactionDeliveryItems(history, liveEvents);

    expect(merged.map((item) => item.deliverySequence)).toEqual(["11", "10"]);
    expect(merged[1]).toMatchObject({
      id: history[0].id,
      status: "retry_wait",
      attemptCount: 1,
      nextAttemptAt: "2026-07-20T00:01:00.000Z",
      lastError: { code: "InternalError", message: "发送失败" },
    });
    expect(mergeTransactionDeliveryItems(history, liveEvents, {
      status: "retry_wait",
      messageType: "start",
    })).toHaveLength(1);
  });
});

function createEvent(input: {
  messageId: string;
  deliverySequence: string;
  status: "pending" | "retry_wait";
  attemptCount: number;
}): TransactionDeliveryChangedEvent {
  return {
    id: `event-${input.deliverySequence}`,
    sequence: Number(input.deliverySequence),
    chargingPointId: "00000000-0000-4000-8000-000000000099",
    protocol: "OCPP16J",
    occurredAt: "2026-07-20T00:00:10.000Z",
    type: "transaction-delivery.changed",
    resource: {
      scope: "transactionDelivery",
      transactionId: "transaction-1",
      messageId: input.messageId,
      deliverySequence: input.deliverySequence,
    },
    messageType: "start",
    previousStatus: input.status === "pending" ? null : "in_flight",
    currentStatus: input.status,
    attemptCount: input.attemptCount,
    nextAttemptAt: input.status === "retry_wait"
      ? "2026-07-20T00:01:00.000Z"
      : null,
    lastError: input.status === "retry_wait"
      ? { code: "InternalError", message: "发送失败" }
      : null,
  };
}
