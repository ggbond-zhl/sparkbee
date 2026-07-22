import { describe, expect, test } from "vitest";

import { connectorManagementFormSchema } from "../../src/features/charging-points/model/connectorManagementForm";

describe("connector management form", () => {
  test("converts text inputs to connector payload values", () => {
    const values = connectorManagementFormSchema.parse({
      connectorId: "2",
      type: "IEC_62196_T2",
      powerType: "ac",
      maxVoltage: "230",
      maxCurrent: "32",
    });

    expect(values).toEqual({
      evseId: 2,
      connectorId: 2,
      type: "IEC_62196_T2",
      format: "cable",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
    });
  });

  test("rejects connector id zero and missing rated values", () => {
    expect(() =>
      connectorManagementFormSchema.parse({
        connectorId: "0",
        type: "IEC_62196_T2",
        powerType: "ac",
        maxVoltage: "",
        maxCurrent: "",
      }),
    ).toThrow();

    expect(() =>
      connectorManagementFormSchema.parse({
        connectorId: "1",
        type: "IEC_62196_T2",
        powerType: "ac",
        maxVoltage: "",
        maxCurrent: "32",
      }),
    ).toThrow();
  });

  test("rejects legacy free-text connector type values", () => {
    expect(() =>
      connectorManagementFormSchema.parse({
        connectorId: "1",
        type: "Type2",
        powerType: "ac",
        maxVoltage: "230",
        maxCurrent: "32",
      }),
    ).toThrow();
  });
});
