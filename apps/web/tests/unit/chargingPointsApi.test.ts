import { afterEach, describe, expect, test, vi } from "vitest";

import { listChargingPoints } from "../../src/features/charging-points/api/chargingPoints";

describe("chargingPoints API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("sends requested page and page size", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 50,
          total: 0,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listChargingPoints({ keyword: " CP ", page: 2, pageSize: 50 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/charging-points?page=2&pageSize=50&keyword=CP",
    );
  });
});
