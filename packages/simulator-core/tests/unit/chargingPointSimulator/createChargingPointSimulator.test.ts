import { describe, expect, test } from "vitest";

import {
  CHARGING_POINT_SIMULATOR_RUNTIME_SUPPORT,
  ChargingPointSimulatorError,
  createChargingPointSimulator,
  isChargingPointSimulatorRuntimeSupported,
  type ChargingPointSimulatorOptions,
} from "../../../src";
import { createChargingPoint } from "../protocolRuntime/ocpp16/helpers";

function createOptions(
  overrides: Partial<ChargingPointSimulatorOptions> = {},
): ChargingPointSimulatorOptions {
  return {
    protocol: "OCPP16J",
    id: "cp-1",
    centralSystemUrl: "ws://localhost/cp-1",
    chargingPoint: createChargingPoint(),
    ...overrides,
  } as ChargingPointSimulatorOptions;
}

describe("createChargingPointSimulator", () => {
  test("creates an OCPP 1.6 simulator instance", () => {
    const simulator = createChargingPointSimulator(createOptions());

    expect(simulator.id).toBe("cp-1");
    expect(simulator.protocol).toBe("OCPP16J");
    expect(typeof simulator.start).toBe("function");
    expect(typeof simulator.stop).toBe("function");
    expect(typeof simulator.plug).toBe("function");
    expect(typeof simulator.unplug).toBe("function");
    expect(typeof simulator.authorize).toBe("function");
    expect(typeof simulator.startTransaction).toBe("function");
    expect(typeof simulator.reportMeterValue).toBe("function");
    expect(typeof simulator.stopTransaction).toBe("function");
  });

  test("rejects unsupported OCPP 2.0.1 at runtime with a stable error", () => {
    expect(() =>
      createChargingPointSimulator({
        protocol: "OCPP201",
        id: "cp-201",
        centralSystemUrl: "ws://localhost/cp-201",
      })
    ).toThrow(ChargingPointSimulatorError);

    expect(() =>
      createChargingPointSimulator({
        protocol: "OCPP201",
        id: "cp-201",
        centralSystemUrl: "ws://localhost/cp-201",
      })
    ).toThrow("OCPP201 暂不支持运行");

    try {
      createChargingPointSimulator({
        protocol: "OCPP201",
        id: "cp-201",
        centralSystemUrl: "ws://localhost/cp-201",
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: "CHARGING_POINT_SIMULATOR_PROTOCOL_UNSUPPORTED",
        cause: {
          protocol: "OCPP201",
          support: CHARGING_POINT_SIMULATOR_RUNTIME_SUPPORT.OCPP201,
        },
      });
    }
  });

  test("documents protocol toolkit support separately from simulator runtime support", () => {
    expect(CHARGING_POINT_SIMULATOR_RUNTIME_SUPPORT.OCPP16J).toEqual({
      protocolToolkit: true,
      chargingPointSimulatorRuntime: true,
      status: "supported",
    });
    expect(CHARGING_POINT_SIMULATOR_RUNTIME_SUPPORT.OCPP201).toEqual({
      protocolToolkit: true,
      chargingPointSimulatorRuntime: false,
      status: "protocol-only",
    });
    expect(isChargingPointSimulatorRuntimeSupported("OCPP16J")).toBe(true);
    expect(isChargingPointSimulatorRuntimeSupported("OCPP201")).toBe(false);
  });

  test("requires charging point topology for normal OCPP16J creation", () => {
    expect(() =>
      createChargingPointSimulator({
        protocol: "OCPP16J",
        id: "cp-1",
        centralSystemUrl: "ws://localhost/cp-1",
      } as never)
    ).toThrow(
      expect.objectContaining({
        code: "CHARGING_POINT_SIMULATOR_INVALID_OPERATION",
      }),
    );
  });

});
