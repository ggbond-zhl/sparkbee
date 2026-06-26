import { Ocpp16ChargingPointSimulator } from "./ocpp16/Ocpp16ChargingPointSimulator";
import { ChargingPointSimulatorError } from "./errors";
import { CHARGING_POINT_SIMULATOR_RUNTIME_SUPPORT } from "./support";
import type {
  ChargingPointSimulator,
  ChargingPointSimulatorOptions,
} from "./types";

export function createChargingPointSimulator(options: ChargingPointSimulatorOptions): ChargingPointSimulator {
  switch (options.protocol) {
    case "OCPP16J":
      return new Ocpp16ChargingPointSimulator(options);
    case "OCPP201":
      throw unsupportedChargingPointSimulatorRuntime(options.protocol);
  }
}

function unsupportedChargingPointSimulatorRuntime(
  protocol: ChargingPointSimulatorOptions["protocol"],
): ChargingPointSimulatorError {
  return new ChargingPointSimulatorError(
    "CHARGING_POINT_SIMULATOR_PROTOCOL_UNSUPPORTED",
    `${protocol} 暂不支持运行`,
    {
      protocol,
      support: CHARGING_POINT_SIMULATOR_RUNTIME_SUPPORT[protocol],
    },
  );
}
