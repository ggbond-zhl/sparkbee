import { describe, expect, test } from "vitest";

import { chargingPointCreateFormSchema } from "../../src/features/charging-points/model/chargingPointCreateForm";

describe("charging point create form", () => {
  test("trims required fields and converts empty optional fields to null", () => {
    const values = chargingPointCreateFormSchema.parse({
      name: "  测试桩  ",
      description: " ",
      identity: " CP_001 ",
      protocol: "OCPP16J",
      centralSystemUrl: " ws://localhost:9000/ocpp ",
      vendor: " SparkBee ",
      model: " Simulator ",
      firmwareVersion: "",
      serialNumber: "",
    });

    expect(values).toEqual({
      name: "测试桩",
      description: null,
      identity: "CP_001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "Simulator",
      firmwareVersion: null,
      serialNumber: null,
    });
  });
});
