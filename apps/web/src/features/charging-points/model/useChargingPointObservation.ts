import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  RuntimeOperationResponse,
  TransactionDeliveryChangedEvent,
} from "@spark-bee/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ALL_RUNTIME_LOG_TYPE_FILTER,
  buildObservationTypeFilterOptions,
  filterObservationEntries,
  getObservationTimeFilterCutoffMs,
  type ObservationTimeFilter,
} from "./chargingPointObservationFilters";
import {
  protocolEventsInfiniteQueryOptions,
  protocolMessagesInfiniteQueryOptions,
  transactionDeliveriesInfiniteQueryOptions,
} from "./chargingPointQueries";
import {
  mergeChargingPointRuntimeEventFeedHistory,
  type ChargingPointEventStreamMessage,
  type ChargingPointRuntimeEventFeedState,
  type ChargingPointRuntimeEventState,
} from "./chargingPointRuntimeEvents";
import type { ChargingPointObservationWorkbench } from "./chargingPointWorkbench";
import {
  mergeTransactionDeliveryItems,
  type TransactionDeliveryMessageTypeFilter,
  type TransactionDeliveryStatusFilter,
} from "./transactionDeliveryObservation";
import { useChargingPointRuntimeEvents } from "./useChargingPointRuntimeEvents";

interface UseChargingPointObservationOptions {
  enabled: boolean;
  onRuntimeStatus(runtimeStatus: RuntimeOperationResponse): void;
  onSnapshot(): void;
}

interface UseChargingPointObservationResult {
  observation: ChargingPointObservationWorkbench;
  eventFeedState: ChargingPointRuntimeEventFeedState;
  runtimeEventState: ChargingPointRuntimeEventState;
}

export function useChargingPointObservation(
  chargingPointId: string,
  options: UseChargingPointObservationOptions,
): UseChargingPointObservationResult {
  const [messageTimeFilter, setMessageTimeFilter] =
    useState<ObservationTimeFilter>("all");
  const [eventTimeFilter, setEventTimeFilter] =
    useState<ObservationTimeFilter>("all");
  const [messageTypeFilter, setMessageTypeFilter] = useState(
    ALL_RUNTIME_LOG_TYPE_FILTER,
  );
  const [eventTypeFilter, setEventTypeFilter] = useState(
    ALL_RUNTIME_LOG_TYPE_FILTER,
  );
  const [messageDirectionFilter, setMessageDirectionFilter] = useState<
    "all" | "sent" | "received"
  >("all");
  const [transactionDeliveryStatusFilter, setTransactionDeliveryStatusFilter] =
    useState<TransactionDeliveryStatusFilter>("all");
  const [transactionDeliveryMessageTypeFilter, setTransactionDeliveryMessageTypeFilter] =
    useState<TransactionDeliveryMessageTypeFilter>("all");
  const [liveTransactionDeliveryEvents, setLiveTransactionDeliveryEvents] =
    useState<TransactionDeliveryChangedEvent[]>([]);
  const routeRuntimeEvent = useCallback((message: ChargingPointEventStreamMessage) => {
    if (message.event !== "transaction-delivery.changed") {
      return;
    }

    setLiveTransactionDeliveryEvents((current) => [
      message.data,
      ...current.filter((event) =>
        event.resource.messageId !== message.data.resource.messageId
      ),
    ]);
  }, []);

  useEffect(() => {
    setLiveTransactionDeliveryEvents([]);
  }, [chargingPointId]);

  const { eventFeedState, runtimeEventState } = useChargingPointRuntimeEvents(
    chargingPointId,
    { ...options, onEvent: routeRuntimeEvent },
  );
  const messageFrom = useMemo(
    () => toObservationFrom(messageTimeFilter),
    [messageTimeFilter],
  );
  const eventFrom = useMemo(
    () => toObservationFrom(eventTimeFilter),
    [eventTimeFilter],
  );
  const messageHistoryQuery = useInfiniteQuery({
    ...protocolMessagesInfiniteQueryOptions(chargingPointId, {
      ...(messageFrom === undefined ? {} : { from: messageFrom }),
      ...(messageTypeFilter === ALL_RUNTIME_LOG_TYPE_FILTER
        ? {}
        : { action: messageTypeFilter }),
      ...(messageDirectionFilter === "all"
        ? {}
        : { direction: messageDirectionFilter }),
    }),
    enabled: options.enabled,
  });
  const eventHistoryQuery = useInfiniteQuery({
    ...protocolEventsInfiniteQueryOptions(chargingPointId, {
      ...(eventFrom === undefined ? {} : { from: eventFrom }),
      ...(eventTypeFilter === ALL_RUNTIME_LOG_TYPE_FILTER
        ? {}
        : { eventType: eventTypeFilter as never }),
    }),
    enabled: options.enabled,
  });
  const transactionDeliveryHistoryQuery = useInfiniteQuery({
    ...transactionDeliveriesInfiniteQueryOptions(chargingPointId, {
      ...(transactionDeliveryStatusFilter === "all"
        ? {}
        : { status: transactionDeliveryStatusFilter }),
      ...(transactionDeliveryMessageTypeFilter === "all"
        ? {}
        : { messageType: transactionDeliveryMessageTypeFilter }),
    }),
    enabled: options.enabled,
  });
  const observationFeedState = useMemo(
    () => mergeChargingPointRuntimeEventFeedHistory(
      eventFeedState,
      {
        events: eventHistoryQuery.data?.pages.flatMap((page) => page.items) ?? [],
        protocolMessages:
          messageHistoryQuery.data?.pages.flatMap((page) => page.items) ?? [],
      },
    ),
    [eventFeedState, eventHistoryQuery.data, messageHistoryQuery.data],
  );
  const messageHistory = {
    capacity: 200 * (messageHistoryQuery.data?.pages.length ?? 1),
    hasMore: messageHistoryQuery.hasNextPage,
    loadingMore: messageHistoryQuery.isFetchingNextPage,
    loadMore: () => void messageHistoryQuery.fetchNextPage(),
  };
  const eventHistory = {
    capacity: 200 * (eventHistoryQuery.data?.pages.length ?? 1),
    hasMore: eventHistoryQuery.hasNextPage,
    loadingMore: eventHistoryQuery.isFetchingNextPage,
    loadMore: () => void eventHistoryQuery.fetchNextPage(),
  };
  const filterNowMs = Date.now();
  const messageTypeOptions = useMemo(
    () => buildObservationTypeFilterOptions(
      observationFeedState.protocolMessages,
      (message) => message.action,
    ),
    [observationFeedState.protocolMessages],
  );
  const eventTypeOptions = useMemo(
    () => buildObservationTypeFilterOptions(
      observationFeedState.events,
      (event) => event.eventType,
    ),
    [observationFeedState.events],
  );
  const protocolMessageItems = useMemo(
    () => filterObservationEntries(
      observationFeedState.protocolMessages.filter((message) =>
        messageDirectionFilter === "all" ||
        message.direction === messageDirectionFilter
      ),
      {
        getType: (message) => message.action,
        limit: messageHistory.capacity,
        nowMs: filterNowMs,
        timeFilter: messageTimeFilter,
        typeFilter: messageTypeFilter,
      },
    ),
    [
      filterNowMs,
      messageDirectionFilter,
      messageHistory.capacity,
      messageTimeFilter,
      messageTypeFilter,
      observationFeedState.protocolMessages,
    ],
  );
  const eventItems = useMemo(
    () => filterObservationEntries(observationFeedState.events, {
      getType: (event) => event.eventType,
      limit: eventHistory.capacity,
      nowMs: filterNowMs,
      timeFilter: eventTimeFilter,
      typeFilter: eventTypeFilter,
    }),
    [
      eventHistory.capacity,
      eventTimeFilter,
      eventTypeFilter,
      filterNowMs,
      observationFeedState.events,
    ],
  );
  const transactionDeliveryHistoryItems = useMemo(
    () =>
      transactionDeliveryHistoryQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [transactionDeliveryHistoryQuery.data],
  );
  const transactionDeliveryCapacity =
    200 * (transactionDeliveryHistoryQuery.data?.pages.length ?? 1);
  const transactionDeliveryItems = useMemo(
    () => mergeTransactionDeliveryItems(
      transactionDeliveryHistoryItems,
      liveTransactionDeliveryEvents,
      {
        status: transactionDeliveryStatusFilter,
        messageType: transactionDeliveryMessageTypeFilter,
      },
      transactionDeliveryCapacity,
    ),
    [
      liveTransactionDeliveryEvents,
      transactionDeliveryCapacity,
      transactionDeliveryHistoryItems,
      transactionDeliveryMessageTypeFilter,
      transactionDeliveryStatusFilter,
    ],
  );

  return {
    runtimeEventState,
    eventFeedState,
    observation: {
      protocolMessages: {
        items: protocolMessageItems,
        totalItems: observationFeedState.protocolMessages.length,
        timeFilter: messageTimeFilter,
        typeFilter: messageTypeFilter,
        typeOptions: messageTypeOptions,
        directionFilter: messageDirectionFilter,
        setTimeFilter: setMessageTimeFilter,
        setTypeFilter: setMessageTypeFilter,
        setDirectionFilter: setMessageDirectionFilter,
        history: messageHistory,
      },
      events: {
        items: eventItems,
        totalItems: observationFeedState.events.length,
        timeFilter: eventTimeFilter,
        typeFilter: eventTypeFilter,
        typeOptions: eventTypeOptions,
        setTimeFilter: setEventTimeFilter,
        setTypeFilter: setEventTypeFilter,
        history: eventHistory,
      },
      transactionDeliveries: {
        items: transactionDeliveryItems,
        statusFilter: transactionDeliveryStatusFilter,
        messageTypeFilter: transactionDeliveryMessageTypeFilter,
        setStatusFilter: setTransactionDeliveryStatusFilter,
        setMessageTypeFilter: setTransactionDeliveryMessageTypeFilter,
        loading: transactionDeliveryHistoryQuery.isLoading,
        error: transactionDeliveryHistoryQuery.isError,
        history: {
          capacity: transactionDeliveryCapacity,
          hasMore: transactionDeliveryHistoryQuery.hasNextPage,
          loadingMore: transactionDeliveryHistoryQuery.isFetchingNextPage,
          loadMore: () => void transactionDeliveryHistoryQuery.fetchNextPage(),
        },
      },
    },
  };
}

function toObservationFrom(timeFilter: ObservationTimeFilter) {
  const cutoff = getObservationTimeFilterCutoffMs(timeFilter, Date.now());
  return cutoff === null ? undefined : new Date(cutoff).toISOString();
}
