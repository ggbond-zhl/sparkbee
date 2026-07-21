export const ALL_RUNTIME_LOG_TYPE_FILTER = "__all__";

export type ObservationTimeFilter = "all" | "1m" | "5m" | "15m" | "1h";

export interface ObservationTimeFilterOption {
  value: ObservationTimeFilter;
  label: string;
}

export interface ObservationTypeFilterOption {
  value: string;
  label: string;
}

export const OBSERVATION_TIME_FILTER_OPTIONS: ObservationTimeFilterOption[] = [
  { value: "all", label: "全部" },
  { value: "1m", label: "最近 1 分钟" },
  { value: "5m", label: "最近 5 分钟" },
  { value: "15m", label: "最近 15 分钟" },
  { value: "1h", label: "最近 1 小时" },
];

export function buildObservationTypeFilterOptions<TEntry>(
  entries: TEntry[],
  getType: (entry: TEntry) => string,
): ObservationTypeFilterOption[] {
  const types = [...new Set(entries.map(getType))].sort((left, right) =>
    left.localeCompare(right),
  );

  return [
    { value: ALL_RUNTIME_LOG_TYPE_FILTER, label: "全部类型" },
    ...types.map((type) => ({ value: type, label: type })),
  ];
}

export function filterObservationEntries<TEntry extends { occurredAt: string }>(
  entries: TEntry[],
  {
    getType,
    limit,
    nowMs,
    timeFilter,
    typeFilter,
  }: {
    getType: (entry: TEntry) => string;
    limit?: number;
    nowMs: number;
    timeFilter: ObservationTimeFilter;
    typeFilter: string;
  },
): TEntry[] {
  const cutoffMs = getObservationTimeFilterCutoffMs(timeFilter, nowMs);

  const filteredEntries = entries.filter((entry) => {
    if (
      typeFilter !== ALL_RUNTIME_LOG_TYPE_FILTER &&
      getType(entry) !== typeFilter
    ) {
      return false;
    }

    if (cutoffMs === null) {
      return true;
    }

    const occurredAtMs = Date.parse(entry.occurredAt);
    return Number.isFinite(occurredAtMs) && occurredAtMs >= cutoffMs;
  });

  return limit === undefined ? filteredEntries : filteredEntries.slice(0, limit);
}

export function getObservationEmptyText({
  emptyText,
  entriesCount,
  filteredEmptyText,
}: {
  emptyText: string;
  entriesCount: number;
  filteredEmptyText: string;
}) {
  return entriesCount === 0 ? emptyText : filteredEmptyText;
}

export function getObservationTimeFilterCutoffMs(
  timeFilter: ObservationTimeFilter,
  nowMs: number,
) {
  if (timeFilter === "all") {
    return null;
  }

  if (timeFilter === "1m") {
    return nowMs - 60_000;
  }

  if (timeFilter === "5m") {
    return nowMs - 5 * 60_000;
  }

  if (timeFilter === "15m") {
    return nowMs - 15 * 60_000;
  }

  return nowMs - 60 * 60_000;
}
