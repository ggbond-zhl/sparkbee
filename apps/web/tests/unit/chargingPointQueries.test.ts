import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import { chargingPointListQueryOptions } from "../../src/features/charging-points/model/chargingPointQueries";

describe("charging point list query options", () => {
  test("keeps previous list data while another page is loading", () => {
    expect(
      chargingPointListQueryOptions({ page: 2, pageSize: 50 }).placeholderData,
    ).toBe(keepPreviousData);
  });
});
