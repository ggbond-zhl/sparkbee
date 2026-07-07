import { describe, expect, test } from "vitest";

import { connectorManagementFormSchema } from "../../src/features/charging-points/model/connectorManagementForm";

describe("connector management form", () => {
  test("converts text inputs to connector payload values", () => {
    const values = connectorManagementFormSchema.parse({
      connectorId: "2",
      type: " Type2 ",
      format: "socket",
      powerType: "ac",
      maxVoltage: "230",
      maxCurrent: "32",
    });

    expect(values).toEqual({
      evseId: 2,
      connectorId: 2,
      type: "Type2",
      format: "socket",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
    });
  });

  test("rejects connector id zero and missing rated values", () => {
    expect(() =>
      connectorManagementFormSchema.parse({
        connectorId: "0",
        type: "Type2",
        format: "socket",
        powerType: "ac",
        maxVoltage: "",
        maxCurrent: "",
      }),
    ).toThrow();

    expect(() =>
      connectorManagementFormSchema.parse({
        connectorId: "1",
        type: "Type2",
        format: "socket",
        powerType: "ac",
        maxVoltage: "",
        maxCurrent: "32",
      }),
    ).toThrow();
  });
});
