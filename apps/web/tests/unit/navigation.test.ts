import { describe, expect, test } from "vitest";

import {
  appMenuItems,
  getDocumentTitleForPath,
  getPageTitleForPath,
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

  test("uses page titles as document titles for non-menu pages", () => {
    expect(getPageTitleForPath("/charging-points/cp-1")).toBe("运行调试台");
    expect(getDocumentTitleForPath("/charging-points/cp-1")).toBe(
      "运行调试台 - SparkBee",
    );
    expect(getPageTitleForPath("/charging-points/cp-1/configuration")).toBe(
      "协议配置",
    );
    expect(getDocumentTitleForPath("/charging-points/cp-1/configuration")).toBe(
      "协议配置 - SparkBee",
    );
  });

  test("does not invent titles for non-menu paths", () => {
    expect(getDocumentTitleForPath("/")).toBeNull();
    expect(getDocumentTitleForPath("/unknown")).toBeNull();
  });
});
