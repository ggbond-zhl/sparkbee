import { Ocpp16Simulator } from "./ocpp16/Ocpp16Simulator";
import { SimulatorError } from "./errors";
import { SIMULATOR_RUNTIME_SUPPORT } from "./support";
import type {
  Simulator,
  SimulatorOptions,
} from "./types";

export function createSimulator(options: SimulatorOptions): Simulator {
  switch (options.protocol) {
    case "OCPP16J":
      return new Ocpp16Simulator(options);
    case "OCPP201":
      throw unsupportedSimulatorRuntime(options.protocol);
  }
}

function unsupportedSimulatorRuntime(
  protocol: SimulatorOptions["protocol"],
): SimulatorError {
  return new SimulatorError(
    "SIMULATOR_PROTOCOL_UNSUPPORTED",
    `${protocol} 暂不支持运行`,
    {
      protocol,
      support: SIMULATOR_RUNTIME_SUPPORT[protocol],
    },
  );
}
