import { describe, expect, test } from "vitest";

import {
  createChargingPointRef,
  createConnectorRef,
  createEvseRef,
} from "../../../../src/model/index.ts";

describe("ResourceRef", () => {
  test("creates charging point, evse, and connector refs", () => {
    expect(createChargingPointRef("cp-1")).toEqual({
      scope: "chargingPoint",
      chargingPointId: "cp-1",
    });

    expect(createEvseRef("cp-1", 2)).toEqual({
      scope: "evse",
      chargingPointId: "cp-1",
      evseId: 2,
    });

    expect(createConnectorRef("cp-1", 2, 3)).toEqual({
      scope: "connector",
      chargingPointId: "cp-1",
      evseId: 2,
      connectorId: 3,
    });
  });

  test("rejects non-positive evse and connector identifiers", () => {
    expect(() => createEvseRef("cp-1", 0)).toThrow("evseId");
    expect(() => createConnectorRef("cp-1", 1, 0)).toThrow("connectorId");
  });
});
