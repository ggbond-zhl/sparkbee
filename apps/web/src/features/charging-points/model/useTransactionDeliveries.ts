import { useInfiniteQuery } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  TransactionDeliveryChangedEvent,
  TransactionDeliveryItem,
  TransactionDeliveryMessageType,
  TransactionDeliveryStatus,
} from "@spark-bee/contracts";

import { subscribeChargingPointEvents } from "@/features/charging-points/api/chargingPoints";
import { transactionDeliveriesInfiniteQueryOptions } from "@/features/charging-points/model/chargingPointQueries";

export type TransactionDeliveryStatusFilter = TransactionDeliveryStatus | "all";
export type TransactionDeliveryMessageTypeFilter =
  | TransactionDeliveryMessageType
  | "all";

export function useTransactionDeliveries(chargingPointId: string) {
  const [statusFilter, setStatusFilter] =
    useState<TransactionDeliveryStatusFilter>("all");
  const [messageTypeFilter, setMessageTypeFilter] =
    useState<TransactionDeliveryMessageTypeFilter>("all");
  const [liveEvents, setLiveEvents] = useState<TransactionDeliveryChangedEvent[]>([]);
  const historyQuery = useInfiniteQuery(
    transactionDeliveriesInfiniteQueryOptions(chargingPointId, {
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
      ...(messageTypeFilter === "all"
        ? {}
        : { messageType: messageTypeFilter }),
    }),
  );

  useEffect(() => {
    setLiveEvents([]);
    return subscribeChargingPointEvents(chargingPointId, {
      onEvent: (message) => {
        if (message.event !== "transaction-delivery.changed") return;
        setLiveEvents((current) => [
          message.data,
          ...current.filter((event) =>
            event.resource.messageId !== message.data.resource.messageId
          ),
        ]);
      },
    });
  }, [chargingPointId]);

  const historyItems = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [historyQuery.data],
  );
  const items = useMemo(
    () => mergeTransactionDeliveryItems(historyItems, liveEvents, {
      status: statusFilter,
      messageType: messageTypeFilter,
    }),
    [historyItems, liveEvents, messageTypeFilter, statusFilter],
  );

  return {
    items,
    statusFilter,
    messageTypeFilter,
    setStatusFilter,
    setMessageTypeFilter,
    loading: historyQuery.isLoading,
    error: historyQuery.isError,
    hasMore: historyQuery.hasNextPage,
    loadingMore: historyQuery.isFetchingNextPage,
    loadMore: () => void historyQuery.fetchNextPage(),
  };
}

export function mergeTransactionDeliveryItems(
  historyItems: TransactionDeliveryItem[],
  liveEvents: TransactionDeliveryChangedEvent[],
  filters: {
    status: TransactionDeliveryStatusFilter;
    messageType: TransactionDeliveryMessageTypeFilter;
  } = { status: "all", messageType: "all" },
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
    .sort((left, right) => compareSequence(right.deliverySequence, left.deliverySequence));
}

function compareSequence(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
}
