import { Ocpp16ChargingPointActor } from "./ocpp16/Ocpp16ChargingPointActor";
import { ChargingPointActorError } from "./errors";
import { CHARGING_POINT_ACTOR_RUNTIME_SUPPORT } from "./support";
import type {
  ChargingPointActor,
  ChargingPointActorOptions,
} from "./types";

export function createChargingPointActor(options: ChargingPointActorOptions): ChargingPointActor {
  switch (options.protocol) {
    case "OCPP16J":
      return new Ocpp16ChargingPointActor(options);
    case "OCPP201":
      throw unsupportedChargingPointActorRuntime(options.protocol);
  }
}

function unsupportedChargingPointActorRuntime(
  protocol: ChargingPointActorOptions["protocol"],
): ChargingPointActorError {
  return new ChargingPointActorError(
    "CHARGING_POINT_ACTOR_PROTOCOL_UNSUPPORTED",
    `${protocol} 暂不支持运行`,
    {
      protocol,
      support: CHARGING_POINT_ACTOR_RUNTIME_SUPPORT[protocol],
    },
  );
}
