import { describe, expect, test } from "vitest";

import {
  ALL_RUNTIME_LOG_TYPE_FILTER,
  buildObservationTypeFilterOptions,
  filterObservationEntries,
  getObservationEmptyText,
} from "../../src/features/charging-points/model/chargingPointObservationFilters";

interface TestLogEntry {
  id?: string;
  occurredAt: string;
  type: string;
}

describe("charging point observation filters", () => {
  test("builds sorted type options with all types first", () => {
    const entries: TestLogEntry[] = [
      { occurredAt: "2026-07-09T10:00:00.000Z", type: "StatusNotification" },
      { occurredAt: "2026-07-09T10:00:01.000Z", type: "Heartbeat" },
      { occurredAt: "2026-07-09T10:00:02.000Z", type: "StatusNotification" },
      { occurredAt: "2026-07-09T10:00:03.000Z", type: "Authorize" },
    ];

    expect(buildObservationTypeFilterOptions(entries, (entry) => entry.type)).toEqual([
      { value: ALL_RUNTIME_LOG_TYPE_FILTER, label: "全部类型" },
      { value: "Authorize", label: "Authorize" },
      { value: "Heartbeat", label: "Heartbeat" },
      { value: "StatusNotification", label: "StatusNotification" },
    ]);
  });

  test("filters entries by relative time and type without reordering", () => {
    const nowMs = Date.parse("2026-07-09T10:10:00.000Z");
    const entries: TestLogEntry[] = [
      { occurredAt: "2026-07-09T10:09:30.000Z", type: "Heartbeat" },
      { occurredAt: "2026-07-09T10:07:00.000Z", type: "StatusNotification" },
      { occurredAt: "2026-07-09T10:06:00.000Z", type: "Heartbeat" },
      { occurredAt: "2026-07-09T09:00:00.000Z", type: "Heartbeat" },
    ];

    expect(
      filterObservationEntries(entries, {
        getType: (entry) => entry.type,
        nowMs,
        timeFilter: "5m",
        typeFilter: "Heartbeat",
      }),
    ).toEqual([
      { occurredAt: "2026-07-09T10:09:30.000Z", type: "Heartbeat" },
      { occurredAt: "2026-07-09T10:06:00.000Z", type: "Heartbeat" },
    ]);
  });

  test("caps matching entries after filtering so unmatched entries do not consume capacity", () => {
    const unmatchedEntries: TestLogEntry[] = Array.from(
      { length: 10 },
      (_, index) => ({
        id: `status-${index}`,
        occurredAt: "2026-07-09T10:10:00.000Z",
        type: "StatusNotification",
      }),
    );
    const matchingEntries: TestLogEntry[] = Array.from(
      { length: 205 },
      (_, index) => ({
        id: `heartbeat-${index}`,
        occurredAt: "2026-07-09T10:10:00.000Z",
        type: "Heartbeat",
      }),
    );

    const result = filterObservationEntries(
      [...unmatchedEntries, ...matchingEntries],
      {
        getType: (entry) => entry.type,
        limit: 200,
        nowMs: Date.parse("2026-07-09T10:10:00.000Z"),
        timeFilter: "all",
        typeFilter: "Heartbeat",
      },
    );

    expect(result).toHaveLength(200);
    expect(result.at(0)?.id).toBe("heartbeat-0");
    expect(result.at(-1)?.id).toBe("heartbeat-199");
  });

  test("uses distinct empty text for empty feeds and empty filter results", () => {
    expect(
      getObservationEmptyText({
        emptyText: "暂无报文",
        entriesCount: 0,
        filteredEmptyText: "没有匹配筛选条件的报文",
      }),
    ).toBe("暂无报文");
    expect(
      getObservationEmptyText({
        emptyText: "暂无报文",
        entriesCount: 3,
        filteredEmptyText: "没有匹配筛选条件的报文",
      }),
    ).toBe("没有匹配筛选条件的报文");
  });
});
