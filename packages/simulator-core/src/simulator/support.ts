import type { SimulatorProtocol } from "./types";

export type SimulatorRuntimeSupportStatus = "supported" | "protocol-only";

export type SimulatorRuntimeSupportEntry = {
  protocolToolkit: boolean;
  simulatorRuntime: boolean;
  status: SimulatorRuntimeSupportStatus;
};

export const SIMULATOR_RUNTIME_SUPPORT = {
  OCPP16J: {
    protocolToolkit: true,
    simulatorRuntime: true,
    status: "supported",
  },
  OCPP201: {
    protocolToolkit: true,
    simulatorRuntime: false,
    status: "protocol-only",
  },
} satisfies Record<SimulatorProtocol, SimulatorRuntimeSupportEntry>;

export function isSimulatorRuntimeSupported(
  protocol: SimulatorProtocol,
): boolean {
  return SIMULATOR_RUNTIME_SUPPORT[protocol].simulatorRuntime;
}
