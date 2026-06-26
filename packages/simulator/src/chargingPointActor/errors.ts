export type ChargingPointActorErrorCode =
  | "CHARGING_POINT_ACTOR_ALREADY_RUNNING"
  | "CHARGING_POINT_ACTOR_NOT_RUNNING"
  | "CHARGING_POINT_ACTOR_START_FAILED"
  | "CHARGING_POINT_ACTOR_STOP_FAILED"
  | "CHARGING_POINT_ACTOR_PROTOCOL_UNSUPPORTED"
  | "CHARGING_POINT_ACTOR_OPERATION_FAILED"
  | "CHARGING_POINT_ACTOR_INVALID_OPERATION";

export class ChargingPointActorError extends Error {
  override readonly name = "ChargingPointActorError";
  readonly code: ChargingPointActorErrorCode;
  override readonly cause: unknown;

  constructor(code: ChargingPointActorErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.cause = cause;
  }
}
