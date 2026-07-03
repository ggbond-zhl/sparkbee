import { describe, expect, test } from "vitest";

import { connectorManagementFormSchema } from "../../src/features/charging-points/model/connectorManagementForm";

describe("connector management form", () => {
  test("converts text inputs to connector payload values", () => {
    const values = connectorManagementFormSchema.parse({
      connectorId: "2",
      type: " Type2 ",
      format: "socket",
      powerType: "ac",
      maxVoltage: "",
      maxCurrent: "32",
      maxPower: "22000",
    });

    expect(values).toEqual({
      evseId: 2,
      connectorId: 2,
      type: "Type2",
      format: "socket",
      powerType: "ac",
      maxVoltage: null,
      maxCurrent: 32,
      maxPower: 22000,
    });
  });

  test("rejects connector id zero", () => {
    expect(() =>
      connectorManagementFormSchema.parse({
        connectorId: "0",
        type: "Type2",
        format: "socket",
        powerType: "ac",
        maxVoltage: "",
        maxCurrent: "",
        maxPower: "",
      }),
    ).toThrow();
  });
});
