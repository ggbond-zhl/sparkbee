import { describe, expect, test } from "vitest";

import {
  appMenuItems,
  getDocumentTitleForPath,
} from "../../src/app/navigation";

describe("app navigation", () => {
  test("uses menu labels as document titles", () => {
    expect(appMenuItems).toEqual([
      { label: "充电桩列表", to: "/charging-points" },
    ]);
    expect(getDocumentTitleForPath("/charging-points")).toBe(
      "充电桩列表 - SparkBee",
    );
  });

  test("does not invent titles for non-menu paths", () => {
    expect(getDocumentTitleForPath("/")).toBeNull();
    expect(getDocumentTitleForPath("/unknown")).toBeNull();
  });
});
