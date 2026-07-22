import { useInfiniteQuery } from "@tanstack/react-query";
import type { RuntimeOperationResponse } from "@spark-bee/contracts";
import { useMemo, useState } from "react";

import {
  ALL_RUNTIME_LOG_TYPE_FILTER,
  getObservationTimeFilterCutoffMs,
  type ObservationTimeFilter,
} from "./chargingPointObservationFilters";
import {
  protocolEventsInfiniteQueryOptions,
  protocolMessagesInfiniteQueryOptions,
} from "./chargingPointQueries";
import {
  mergeChargingPointRuntimeEventFeedHistory,
  type ChargingPointRuntimeEventFeedState,
  type ChargingPointRuntimeEventState,
} from "./chargingPointRuntimeEvents";
import type { ChargingPointObservationWorkbench } from "./chargingPointWorkbench";
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
  const { eventFeedState, runtimeEventState } = useChargingPointRuntimeEvents(
    chargingPointId,
    options,
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

  return {
    runtimeEventState,
    eventFeedState,
    observation: {
      ...observationFeedState,
      messageTimeFilter,
      eventTimeFilter,
      messageTypeFilter,
      eventTypeFilter,
      messageDirectionFilter,
      setMessageTimeFilter,
      setEventTimeFilter,
      setMessageTypeFilter,
      setEventTypeFilter,
      setMessageDirectionFilter,
      messageHistory: {
        capacity: 200 * (messageHistoryQuery.data?.pages.length ?? 1),
        hasMore: messageHistoryQuery.hasNextPage,
        loadingMore: messageHistoryQuery.isFetchingNextPage,
        loadMore: () => void messageHistoryQuery.fetchNextPage(),
      },
      eventHistory: {
        capacity: 200 * (eventHistoryQuery.data?.pages.length ?? 1),
        hasMore: eventHistoryQuery.hasNextPage,
        loadingMore: eventHistoryQuery.isFetchingNextPage,
        loadMore: () => void eventHistoryQuery.fetchNextPage(),
      },
    },
  };
}

function toObservationFrom(timeFilter: ObservationTimeFilter) {
  const cutoff = getObservationTimeFilterCutoffMs(timeFilter, Date.now());
  return cutoff === null ? undefined : new Date(cutoff).toISOString();
}
