import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProtocolConfigurationItem,
  ProtocolConfigurationListResponse,
} from "@spark-bee/contracts";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ProtocolConfigurationApiError,
  subscribeChargingPointEvents,
  updateProtocolConfiguration,
} from "@/features/charging-points/api/chargingPoints";
import {
  protocolConfigurationQueryKey,
  protocolConfigurationQueryOptions,
} from "@/features/charging-points/model/chargingPointQueries";
import type { ChargingPointEventStreamMessage } from "@/features/charging-points/model/chargingPointRuntimeEvents";
import {
  filterProtocolConfigurationItems,
  type ProtocolConfigurationFilter,
} from "@/features/charging-points/model/protocolConfiguration";

const EMPTY_CONFIGURATION_ITEMS: ProtocolConfigurationItem[] = [];

interface ProtocolConfigurationEditorState {
  item: ProtocolConfigurationItem;
  draftValue: string;
}

export interface ReadyProtocolConfigurationWorkbench {
  status: "ready";
  protocol: string;
  items: ProtocolConfigurationItem[];
  filteredItems: ProtocolConfigurationItem[];
  keyword: string;
  filter: ProtocolConfigurationFilter;
  setKeyword(value: string): void;
  setFilter(value: ProtocolConfigurationFilter): void;
  editor: {
    item: ProtocolConfigurationItem | null;
    draftValue: string;
    pending: boolean;
    open(item: ProtocolConfigurationItem): void;
    setDraftValue(value: string): void;
    setOpen(open: boolean): void;
    save(): void;
    restoreDefault(): void;
  };
}

export type ProtocolConfigurationWorkbench =
  | { status: "loading" }
  | { status: "error" }
  | ReadyProtocolConfigurationWorkbench;

export function useProtocolConfigurationWorkbench(
  chargingPointId: string,
): ProtocolConfigurationWorkbench {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<ProtocolConfigurationFilter>("all");
  const [editorState, setEditorState] =
    useState<ProtocolConfigurationEditorState | null>(null);
  const configurationQuery = useQuery(
    protocolConfigurationQueryOptions(chargingPointId),
  );
  const items = configurationQuery.data?.items ?? EMPTY_CONFIGURATION_ITEMS;
  const filteredItems = useMemo(
    () => filterProtocolConfigurationItems(items, keyword, filter),
    [filter, items, keyword],
  );
  const mutation = useMutation({
    mutationFn: ({ item, value }: { item: ProtocolConfigurationItem; value: string }) =>
      updateProtocolConfiguration(chargingPointId, item.key, {
        value,
        expectedVersion: item.version,
      }),
    onSuccess: (result) => {
      replaceCachedItem(queryClient, chargingPointId, result.item);
      setEditorState(null);
      toast.success("协议配置已保存");
    },
    onError: async (error) => {
      if (error instanceof ProtocolConfigurationApiError && error.status === 409) {
        await queryClient.invalidateQueries({
          queryKey: protocolConfigurationQueryKey(chargingPointId),
        });
        setEditorState(null);
        toast.error("配置已被更新，已刷新最新值");
        return;
      }
      toast.error(error instanceof Error ? error.message : "协议配置保存失败");
    },
  });

  useEffect(() => {
    setEditorState(null);
    return subscribeChargingPointEvents(chargingPointId, {
      onEvent: (message) => {
        if (message.event !== "configuration.changed") return;
        patchCachedItem(queryClient, chargingPointId, message.data);
      },
    });
  }, [chargingPointId, queryClient]);

  if (configurationQuery.isLoading) {
    return { status: "loading" };
  }
  if (configurationQuery.isError || configurationQuery.data === undefined) {
    return { status: "error" };
  }

  return {
    status: "ready",
    protocol: configurationQuery.data.protocol,
    items,
    filteredItems,
    keyword,
    filter,
    setKeyword,
    setFilter,
    editor: {
      item: editorState?.item ?? null,
      draftValue: editorState?.draftValue ?? "",
      pending: mutation.isPending,
      open: (item) => {
        setEditorState({ item, draftValue: item.value });
        mutation.reset();
      },
      setDraftValue: (draftValue) => {
        setEditorState((current) =>
          current === null ? current : { ...current, draftValue }
        );
      },
      setOpen: (open) => {
        if (!open && !mutation.isPending) {
          setEditorState(null);
        }
      },
      save: () => {
        if (editorState !== null) {
          mutation.mutate({
            item: editorState.item,
            value: editorState.draftValue,
          });
        }
      },
      restoreDefault: () => {
        if (editorState !== null) {
          mutation.mutate({
            item: editorState.item,
            value: editorState.item.defaultValue,
          });
        }
      },
    },
  };
}

function replaceCachedItem(
  queryClient: ReturnType<typeof useQueryClient>,
  chargingPointId: string,
  nextItem: ProtocolConfigurationItem,
) {
  queryClient.setQueryData<ProtocolConfigurationListResponse>(
    protocolConfigurationQueryKey(chargingPointId),
    (current) => current === undefined
      ? current
      : {
          ...current,
          items: current.items.map((item) =>
            item.key === nextItem.key ? nextItem : item
          ),
        },
  );
}

function patchCachedItem(
  queryClient: ReturnType<typeof useQueryClient>,
  chargingPointId: string,
  event: Extract<
    ChargingPointEventStreamMessage,
    { event: "configuration.changed" }
  >["data"],
) {
  queryClient.setQueryData<ProtocolConfigurationListResponse>(
    protocolConfigurationQueryKey(chargingPointId),
    (current) => current === undefined
      ? current
      : {
          ...current,
          items: current.items.map((item) =>
            item.key === event.resource.key
              ? {
                  ...item,
                  value: event.value,
                  version: event.version,
                  pendingRestart: event.pendingRestart,
                  lastModifiedBy: event.lastModifiedBy,
                  updatedAt: event.occurredAt,
                }
              : item
          ),
        },
  );
}
