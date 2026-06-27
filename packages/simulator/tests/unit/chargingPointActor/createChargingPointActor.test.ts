import { describe, expect, test } from "vitest";

import {
  ChargingPointActorError,
  createChargingPointActor,
  type ChargingPointActorOptions,
} from "../../../src";
import { createChargingPoint } from "../protocolRuntime/ocpp16/helpers";

function createOptions(
  overrides: Partial<ChargingPointActorOptions> = {},
): ChargingPointActorOptions {
  return {
    protocol: "OCPP16J",
    id: "cp-1",
    centralSystemUrl: "ws://localhost/cp-1",
    chargingPoint: createChargingPoint(),
    ...overrides,
  } as ChargingPointActorOptions;
}

describe("createChargingPointActor", () => {
  test("creates an OCPP 1.6 actor instance", () => {
    const actor = createChargingPointActor(createOptions());

    expect(actor.id).toBe("cp-1");
    expect(actor.protocol).toBe("OCPP16J");
    expect(typeof actor.start).toBe("function");
    expect(typeof actor.stop).toBe("function");
    expect(typeof actor.plug).toBe("function");
    expect(typeof actor.unplug).toBe("function");
    expect(typeof actor.authorize).toBe("function");
    expect(typeof actor.startTransaction).toBe("function");
    expect(typeof actor.reportMeterValue).toBe("function");
    expect(typeof actor.stopTransaction).toBe("function");
  });

  test("rejects unsupported OCPP 2.0.1 when callers bypass types", () => {
    expect(() =>
      createChargingPointActor({
        protocol: "OCPP201",
        id: "cp-201",
        centralSystemUrl: "ws://localhost/cp-201",
      } as never)
    ).toThrow(ChargingPointActorError);

    expect(() =>
      createChargingPointActor({
        protocol: "OCPP201",
        id: "cp-201",
        centralSystemUrl: "ws://localhost/cp-201",
      } as never)
    ).toThrow("OCPP201 暂不支持运行");

    try {
      createChargingPointActor({
        protocol: "OCPP201",
        id: "cp-201",
        centralSystemUrl: "ws://localhost/cp-201",
      } as never);
    } catch (error) {
      expect(error).toMatchObject({
        code: "CHARGING_POINT_ACTOR_PROTOCOL_UNSUPPORTED",
        cause: {
          protocol: "OCPP201",
        },
      });
    }
  });

  test("requires charging point topology for normal OCPP16J creation", () => {
    expect(() =>
      createChargingPointActor({
        protocol: "OCPP16J",
        id: "cp-1",
        centralSystemUrl: "ws://localhost/cp-1",
      } as never)
    ).toThrow(
      expect.objectContaining({
        code: "CHARGING_POINT_ACTOR_INVALID_OPERATION",
      }),
    );
  });

});
