import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import {
  chargingPointDetailQueryKey,
  chargingPointDetailQueryOptions,
  chargingPointListQueryOptions,
  chargingPointRuntimeSnapshotQueryKey,
  chargingPointRuntimeSnapshotQueryOptions,
  chargingPointRuntimeStatusQueryKey,
  chargingPointRuntimeStatusQueryOptions,
} from "../../src/features/charging-points/model/chargingPointQueries";

describe("charging point list query options", () => {
  test("keeps previous list data while another page is loading", () => {
    expect(
      chargingPointListQueryOptions({ page: 2, pageSize: 50 }).placeholderData,
    ).toBe(keepPreviousData);
  });

  test("uses separate query keys for detail and runtime status", () => {
    const id = "00000000-0000-4000-8000-000000000001";

    expect(chargingPointDetailQueryKey(id)).toEqual(["charging-points", id]);
    expect(chargingPointRuntimeStatusQueryKey(id)).toEqual([
      "charging-points",
      id,
      "runtime-status",
    ]);
    expect(chargingPointRuntimeSnapshotQueryKey(id)).toEqual([
      "charging-points",
      id,
      "runtime-snapshot",
    ]);
    expect(chargingPointDetailQueryOptions(id).queryKey).toEqual([
      "charging-points",
      id,
    ]);
    expect(chargingPointRuntimeStatusQueryOptions(id).queryKey).toEqual([
      "charging-points",
      id,
      "runtime-status",
    ]);
    expect(chargingPointRuntimeSnapshotQueryOptions(id).queryKey).toEqual([
      "charging-points",
      id,
      "runtime-snapshot",
    ]);
  });
});
