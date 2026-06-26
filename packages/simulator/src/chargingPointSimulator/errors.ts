export type ChargingPointSimulatorErrorCode =
  | "CHARGING_POINT_SIMULATOR_ALREADY_RUNNING"
  | "CHARGING_POINT_SIMULATOR_NOT_RUNNING"
  | "CHARGING_POINT_SIMULATOR_START_FAILED"
  | "CHARGING_POINT_SIMULATOR_STOP_FAILED"
  | "CHARGING_POINT_SIMULATOR_PROTOCOL_UNSUPPORTED"
  | "CHARGING_POINT_SIMULATOR_OPERATION_FAILED"
  | "CHARGING_POINT_SIMULATOR_INVALID_OPERATION";

export class ChargingPointSimulatorError extends Error {
  override readonly name = "ChargingPointSimulatorError";
  readonly code: ChargingPointSimulatorErrorCode;
  override readonly cause: unknown;

  constructor(code: ChargingPointSimulatorErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.cause = cause;
  }
}
