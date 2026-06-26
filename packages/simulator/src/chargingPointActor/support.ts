import type { ChargingPointActorProtocol } from "./types";

export type ChargingPointActorRuntimeSupportStatus = "supported" | "protocol-only";

export type ChargingPointActorRuntimeSupportEntry = {
  protocolToolkit: boolean;
  chargingPointActorRuntime: boolean;
  status: ChargingPointActorRuntimeSupportStatus;
};

export const CHARGING_POINT_ACTOR_RUNTIME_SUPPORT = {
  OCPP16J: {
    protocolToolkit: true,
    chargingPointActorRuntime: true,
    status: "supported",
  },
  OCPP201: {
    protocolToolkit: true,
    chargingPointActorRuntime: false,
    status: "protocol-only",
  },
} satisfies Record<ChargingPointActorProtocol, ChargingPointActorRuntimeSupportEntry>;

export function isChargingPointActorRuntimeSupported(
  protocol: ChargingPointActorProtocol,
): boolean {
  return CHARGING_POINT_ACTOR_RUNTIME_SUPPORT[protocol].chargingPointActorRuntime;
}
