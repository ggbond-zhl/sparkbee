import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import type {
  ListProtocolEventsQuery,
  ListProtocolMessagesQuery,
} from "@spark-bee/contracts";

import {
  getChargingPoint,
  getActiveTransactionSamples,
  getChargingPointRuntimeSnapshot,
  getChargingPointRuntimeStatus,
  listChargingPoints,
  listProtocolEvents,
  listProtocolMessages,
  listProtocolConfiguration,
  type ListChargingPointsInput,
} from "@/features/charging-points/api/chargingPoints";

export function chargingPointListQueryKey(input: ListChargingPointsInput) {
  return [
    "charging-points",
    {
      keyword: input.keyword ?? "",
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 20,
    },
  ] as const;
}

export function chargingPointListQueryOptions(input: ListChargingPointsInput) {
  return queryOptions({
    queryKey: chargingPointListQueryKey(input),
    queryFn: () => listChargingPoints(input),
    placeholderData: keepPreviousData,
  });
}

export function chargingPointInfiniteListQueryOptions(
  input: Omit<ListChargingPointsInput, "page">,
) {
  return infiniteQueryOptions({
    queryKey: [
      "charging-points",
      "infinite",
      {
        keyword: input.keyword ?? "",
        pageSize: input.pageSize ?? 20,
      },
    ] as const,
    queryFn: ({ pageParam }) =>
      listChargingPoints({ ...input, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total
        ? lastPage.page + 1
        : undefined,
  });
}

export function chargingPointDetailQueryKey(id: string) {
  return ["charging-points", id] as const;
}

export function chargingPointDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: chargingPointDetailQueryKey(id),
    queryFn: () => getChargingPoint(id),
  });
}

export function protocolConfigurationQueryKey(id: string) {
  return ["charging-points", id, "configuration"] as const;
}

export function protocolConfigurationQueryOptions(id: string) {
  return queryOptions({
    queryKey: protocolConfigurationQueryKey(id),
    queryFn: () => listProtocolConfiguration(id),
  });
}

export function chargingPointRuntimeStatusQueryKey(id: string) {
  return ["charging-points", id, "runtime-status"] as const;
}

export function chargingPointRuntimeStatusQueryOptions(id: string) {
  return queryOptions({
    queryKey: chargingPointRuntimeStatusQueryKey(id),
    queryFn: () => getChargingPointRuntimeStatus(id),
  });
}

export function chargingPointRuntimeSnapshotQueryKey(id: string) {
  return ["charging-points", id, "runtime-snapshot"] as const;
}

export function chargingPointRuntimeSnapshotQueryOptions(id: string) {
  return queryOptions({
    queryKey: chargingPointRuntimeSnapshotQueryKey(id),
    queryFn: () => getChargingPointRuntimeSnapshot(id),
  });
}

export function activeTransactionSamplesQueryKey(id: string) {
  return ["charging-points", id, "active-transaction-samples"] as const;
}

export function activeTransactionSamplesQueryOptions(id: string) {
  return queryOptions({
    queryKey: activeTransactionSamplesQueryKey(id),
    queryFn: () => getActiveTransactionSamples(id),
  });
}

type ProtocolMessageHistoryFilters = Omit<
  ListProtocolMessagesQuery,
  "before" | "limit"
>;
type ProtocolEventHistoryFilters = Omit<
  ListProtocolEventsQuery,
  "before" | "limit"
>;

export function protocolMessagesInfiniteQueryOptions(
  id: string,
  filters: ProtocolMessageHistoryFilters = {},
) {
  return infiniteQueryOptions({
    queryKey: ["charging-points", id, "protocol-messages", filters] as const,
    queryFn: ({ pageParam }) => listProtocolMessages(id, {
      ...filters,
      limit: 200,
      ...(pageParam === null ? {} : { before: pageParam }),
    }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.previousCursor ?? undefined,
  });
}

export function protocolEventsInfiniteQueryOptions(
  id: string,
  filters: ProtocolEventHistoryFilters = {},
) {
  return infiniteQueryOptions({
    queryKey: ["charging-points", id, "protocol-events", filters] as const,
    queryFn: ({ pageParam }) => listProtocolEvents(id, {
      ...filters,
      limit: 200,
      ...(pageParam === null ? {} : { before: pageParam }),
    }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.previousCursor ?? undefined,
  });
}
