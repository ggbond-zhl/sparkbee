import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChargingPointDetailResponse,
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";
import { useCallback, useState } from "react";
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
  chargingPointDetailQueryKey,
  chargingPointDetailQueryOptions,
  chargingPointRuntimeStatusQueryKey,
  chargingPointRuntimeStatusQueryOptions,
} from "@/features/charging-points/model/chargingPointQueries";
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
  const queryClient = useQueryClient();
  const detailQuery = useQuery(chargingPointDetailQueryOptions(chargingPointId));
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
  const { eventFeedState, runtimeEventState } = useChargingPointRuntimeEvents(
    chargingPointId,
    {
      enabled: detailQuery.isSuccess,
      onRuntimeStatus: syncRuntimeStatus,
    },
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
        return;
      }

      toast.error(result.errorMessage);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "停止充电失败");
    },
  });
  if (detailQuery.isLoading) {
    return { status: "loading" };
  }

  if (detailQuery.isError || detailQuery.data === undefined) {
    return { status: "error" };
  }

  return createReadyChargingPointWorkbench({
    detail: detailQuery.data,
    runtimeStatus: runtimeStatusQuery.data,
    runtimeStatusQueryState,
    runtimeEventState,
    eventFeedState,
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

function toRuntimeStatusQueryState(query: {
  isError: boolean;
  isLoading: boolean;
}): RuntimeStatusQueryState {
  if (query.isLoading) {
    return "loading";
  }

  return query.isError ? "error" : "success";
}
