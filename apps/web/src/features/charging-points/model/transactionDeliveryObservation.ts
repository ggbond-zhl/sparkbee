import type {
  TransactionDeliveryChangedEvent,
  TransactionDeliveryItem,
  TransactionDeliveryMessageType,
  TransactionDeliveryStatus,
} from "@spark-bee/contracts";

export type TransactionDeliveryStatusFilter = TransactionDeliveryStatus | "all";
export type TransactionDeliveryMessageTypeFilter =
  | TransactionDeliveryMessageType
  | "all";

export function mergeTransactionDeliveryItems(
  historyItems: TransactionDeliveryItem[],
  liveEvents: TransactionDeliveryChangedEvent[],
  filters: {
    status: TransactionDeliveryStatusFilter;
    messageType: TransactionDeliveryMessageTypeFilter;
  } = { status: "all", messageType: "all" },
  capacity = Number.MAX_SAFE_INTEGER,
): TransactionDeliveryItem[] {
  const itemsByMessageId = new Map(
    historyItems.map((item) => [item.messageId, item]),
  );
  for (const event of [...liveEvents].reverse()) {
    const current = itemsByMessageId.get(event.resource.messageId);
    itemsByMessageId.set(event.resource.messageId, {
      id: current?.id ?? event.resource.messageId,
      messageId: event.resource.messageId,
      transactionId: event.resource.transactionId,
      ocppTransactionId: current?.ocppTransactionId ?? null,
      deliverySequence: event.resource.deliverySequence,
      messageType: event.messageType,
      status: event.currentStatus,
      attemptCount: event.attemptCount,
      nextAttemptAt: event.nextAttemptAt,
      occurredAt: current?.occurredAt ?? event.occurredAt,
      lastError: event.lastError,
    });
  }

  return [...itemsByMessageId.values()]
    .filter((item) =>
      (filters.status === "all" || item.status === filters.status) &&
      (filters.messageType === "all" || item.messageType === filters.messageType)
    )
    .sort((left, right) => compareSequence(right.deliverySequence, left.deliverySequence))
    .slice(0, capacity);
}

function compareSequence(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
}
