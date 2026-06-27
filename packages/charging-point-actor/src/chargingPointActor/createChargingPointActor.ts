import { Ocpp16ChargingPointActor } from "./ocpp16/Ocpp16ChargingPointActor";
import { ChargingPointActorError } from "./errors";
import type {
  ChargingPointActor,
  ChargingPointActorOptions,
} from "./types";

export function createChargingPointActor(options: ChargingPointActorOptions): ChargingPointActor {
  const protocol = (options as { protocol?: string }).protocol;
  if (protocol !== "OCPP16J") {
    throw unsupportedChargingPointActorRuntime(protocol ?? "unknown");
  }

  return new Ocpp16ChargingPointActor(options);
}

function unsupportedChargingPointActorRuntime(
  protocol: string,
): ChargingPointActorError {
  return new ChargingPointActorError(
    "CHARGING_POINT_ACTOR_PROTOCOL_UNSUPPORTED",
    `${protocol} 暂不支持运行`,
    {
      protocol,
    },
  );
}
