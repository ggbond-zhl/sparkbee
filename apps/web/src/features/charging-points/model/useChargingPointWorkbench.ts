import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ActiveTransactionSamplesResponse,
  ChargingPointDetailResponse,
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  authorizeAndStartConnectorTransaction,
  plugConnector,
  startChargingPoint,
  stopConnectorTransaction,
  stopChargingPoint,
  unplugConnector,
} from "@/features/charging-points/api/chargingPoints";
import type { RuntimeStatusQueryState } from "@/features/charging-points/model/chargingPointDetailHeader";
import {
  ALL_RUNTIME_LOG_TYPE_FILTER,
  getObservationTimeFilterCutoffMs,
  type ObservationTimeFilter,
} from "@/features/charging-points/model/chargingPointObservationFilters";
import {
  activeTransactionSamplesQueryKey,
  activeTransactionSamplesQueryOptions,
  chargingPointDetailQueryKey,
  chargingPointDetailQueryOptions,
  chargingPointRuntimeStatusQueryKey,
  chargingPointRuntimeStatusQueryOptions,
  protocolEventsInfiniteQueryOptions,
  protocolMessagesInfiniteQueryOptions,
} from "@/features/charging-points/model/chargingPointQueries";
import { mergeChargingPointRuntimeEventFeedHistory } from "@/features/charging-points/model/chargingPointRuntimeEvents";
import {
  createReadyChargingPointWorkbench,
  type ChargingPointWorkbench,
} from "@/features/charging-points/model/chargingPointWorkbench";
import { useChargingPointRuntimeEvents } from "@/features/charging-points/model/useChargingPointRuntimeEvents";

export type { ChargingPointWorkbench } from "@/features/charging-points/model/chargingPointWorkbench";

export function useChargingPointWorkbench(
  chargingPointId: string,
): ChargingPointWorkbench {
  const [editOpen, setEditOpen] = useState(false);
  const [connectorEditTarget, setConnectorEditTarget] =
    useState<ConnectorResponse | null>(null);
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
  const queryClient = useQueryClient();
  const detailQuery = useQuery(chargingPointDetailQueryOptions(chargingPointId));
  const activeTransactionSamplesQuery = useQuery(
    activeTransactionSamplesQueryOptions(chargingPointId),
  );
  const detailQueryKey = chargingPointDetailQueryKey(chargingPointId);
  const runtimeStatusQuery = useQuery(
    chargingPointRuntimeStatusQueryOptions(chargingPointId),
  );
  const runtimeStatusQueryState = toRuntimeStatusQueryState(runtimeStatusQuery);
  const syncRuntimeStatus = useCallback((runtimeStatus: RuntimeOperationResponse) => {
    queryClient.setQueryData<RuntimeOperationResponse>(
      chargingPointRuntimeStatusQueryKey(chargingPointId),
      runtimeStatus,
    );
  }, [chargingPointId, queryClient]);
  const syncActiveTransactionSamples = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: activeTransactionSamplesQueryKey(chargingPointId),
    });
  }, [chargingPointId, queryClient]);
  const { eventFeedState, runtimeEventState } = useChargingPointRuntimeEvents(
    chargingPointId,
    {
      enabled: detailQuery.isSuccess,
      onRuntimeStatus: syncRuntimeStatus,
      onSnapshot: syncActiveTransactionSamples,
    },
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
    enabled: detailQuery.isSuccess,
  });
  const eventHistoryQuery = useInfiniteQuery({
    ...protocolEventsInfiniteQueryOptions(chargingPointId, {
      ...(eventFrom === undefined ? {} : { from: eventFrom }),
      ...(eventTypeFilter === ALL_RUNTIME_LOG_TYPE_FILTER
        ? {}
        : { eventType: eventTypeFilter as never }),
    }),
    enabled: detailQuery.isSuccess,
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
  const startMutation = useMutation({
    mutationFn: () => startChargingPoint(chargingPointId),
    onSuccess: syncRuntimeStatus,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "桩实例启动失败");
    },
  });
  const stopMutation = useMutation({
    mutationFn: () => stopChargingPoint(chargingPointId),
    onSuccess: syncRuntimeStatus,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "桩实例停止失败");
    },
  });
  const plugMutation = useMutation({
    mutationFn: (connectorId: string) => plugConnector(chargingPointId, connectorId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "插枪失败");
    },
  });
  const unplugMutation = useMutation({
    mutationFn: (connectorId: string) => unplugConnector(chargingPointId, connectorId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "拔枪失败");
    },
  });
  const startTransactionMutation = useMutation({
    mutationFn: ({ connectorId, idTag }: { connectorId: string; idTag: string }) =>
      authorizeAndStartConnectorTransaction(chargingPointId, connectorId, { idTag }),
    onSuccess: (result) => {
      if (result.status === "accepted") {
        toast.success("充电已启动");
        void queryClient.invalidateQueries({
          queryKey: activeTransactionSamplesQueryKey(chargingPointId),
        });
        return;
      }

      toast.error(result.reason);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "启动充电失败");
    },
  });
  const stopTransactionMutation = useMutation({
    mutationFn: ({
      connectorId,
      transactionId,
    }: {
      connectorId: string;
      transactionId: string;
    }) => stopConnectorTransaction(chargingPointId, connectorId, { transactionId }),
    onSuccess: (result) => {
      if (result.status === "accepted") {
        toast.success("充电已停止");
        queryClient.setQueryData<ActiveTransactionSamplesResponse>(
          activeTransactionSamplesQueryKey(chargingPointId),
          (current) => ({
            items: current?.items.filter(
              (item) => item.transactionId !== result.transactionId,
            ) ?? [],
          }),
        );
        return;
      }

      toast.error(result.errorMessage);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "停止充电失败");
    },
  });
  if (detailQuery.isLoading || activeTransactionSamplesQuery.isLoading) {
    return { status: "loading" };
  }

  if (
    detailQuery.isError ||
    detailQuery.data === undefined ||
    activeTransactionSamplesQuery.isError ||
    activeTransactionSamplesQuery.data === undefined
  ) {
    return { status: "error" };
  }

  return createReadyChargingPointWorkbench({
    detail: detailQuery.data,
    runtimeStatus: runtimeStatusQuery.data,
    runtimeStatusQueryState,
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
    activeTransactionSamples: activeTransactionSamplesQuery.data,
    pending: {
      runtime: startMutation.isPending || stopMutation.isPending,
      connectors:
        plugMutation.isPending ||
        unplugMutation.isPending ||
        startTransactionMutation.isPending ||
        stopTransactionMutation.isPending,
    },
    actions: {
      startRuntime: () => startMutation.mutate(),
      stopRuntime: () => stopMutation.mutate(),
      plug: (connectorId) => plugMutation.mutate(connectorId),
      unplug: (connectorId) => unplugMutation.mutate(connectorId),
      startTransaction: (connectorId, idTag) =>
        startTransactionMutation.mutate({ connectorId, idTag }),
      stopTransaction: (connectorId, transactionId) =>
        stopTransactionMutation.mutate({ connectorId, transactionId }),
    },
    chargingPointEditor: {
      open: editOpen,
      openEditor: () => setEditOpen(true),
      setOpen: setEditOpen,
      save: async (updatedItem) => {
        queryClient.setQueryData(detailQueryKey, updatedItem);
        await queryClient.invalidateQueries({ queryKey: detailQueryKey });
      },
    },
    connectorEditor: {
      target: connectorEditTarget,
      open: setConnectorEditTarget,
      setOpen: (open) => {
        if (!open) {
          setConnectorEditTarget(null);
        }
      },
      save: async (savedConnector) => {
        queryClient.setQueryData<ChargingPointDetailResponse>(
          detailQueryKey,
          (current) => {
            if (current === undefined) {
              return current;
            }

            return {
              ...current,
              connectors: current.connectors.map((connector) =>
                connector.id === savedConnector.id ? savedConnector : connector,
              ),
            };
          },
        );
        await queryClient.invalidateQueries({ queryKey: detailQueryKey });
      },
    },
  });
}

function toObservationFrom(timeFilter: ObservationTimeFilter) {
  const cutoff = getObservationTimeFilterCutoffMs(timeFilter, Date.now());
  return cutoff === null ? undefined : new Date(cutoff).toISOString();
}

function toRuntimeStatusQueryState(query: {
  isError: boolean;
  isLoading: boolean;
}): RuntimeStatusQueryState {
  if (query.isLoading) {
    return "loading";
  }

  return query.isError ? "error" : "success";
}
