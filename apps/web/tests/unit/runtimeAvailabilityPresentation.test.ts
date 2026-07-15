import { describe, expect, test } from "vitest";

import {
  formatRuntimeAvailabilityDetail,
  toRuntimeAvailabilityTone,
} from "../../src/features/charging-points/model/runtimeAvailabilityPresentation";

describe("运行状态展示", () => {
  test("用同一 interface 展示当前与待切换可用性", () => {
    expect(formatRuntimeAvailabilityDetail({ currentAvailability: "operative" }))
      .toBe("可用");
    expect(formatRuntimeAvailabilityDetail({
      currentAvailability: "operative",
      requestedAvailability: "inoperative",
    })).toBe("可用 · 待切换为不可用");
  });

  test("为可用性提供统一状态色调", () => {
    expect(toRuntimeAvailabilityTone("operative")).toBe("success");
    expect(toRuntimeAvailabilityTone("inoperative")).toBe("warning");
  });
});
