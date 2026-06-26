import type { ChargingPointSimulatorProtocol } from "./types";

export type ChargingPointSimulatorRuntimeSupportStatus = "supported" | "protocol-only";

export type ChargingPointSimulatorRuntimeSupportEntry = {
  protocolToolkit: boolean;
  chargingPointSimulatorRuntime: boolean;
  status: ChargingPointSimulatorRuntimeSupportStatus;
};

export const CHARGING_POINT_SIMULATOR_RUNTIME_SUPPORT = {
  OCPP16J: {
    protocolToolkit: true,
    chargingPointSimulatorRuntime: true,
    status: "supported",
  },
  OCPP201: {
    protocolToolkit: true,
    chargingPointSimulatorRuntime: false,
    status: "protocol-only",
  },
} satisfies Record<ChargingPointSimulatorProtocol, ChargingPointSimulatorRuntimeSupportEntry>;

export function isChargingPointSimulatorRuntimeSupported(
  protocol: ChargingPointSimulatorProtocol,
): boolean {
  return CHARGING_POINT_SIMULATOR_RUNTIME_SUPPORT[protocol].chargingPointSimulatorRuntime;
}
