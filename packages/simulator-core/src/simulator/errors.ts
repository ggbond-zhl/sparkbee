export type SimulatorErrorCode =
  | "SIMULATOR_ALREADY_RUNNING"
  | "SIMULATOR_NOT_RUNNING"
  | "SIMULATOR_START_FAILED"
  | "SIMULATOR_STOP_FAILED"
  | "SIMULATOR_PROTOCOL_UNSUPPORTED"
  | "SIMULATOR_OPERATION_FAILED"
  | "SIMULATOR_INVALID_OPERATION";

export class SimulatorError extends Error {
  override readonly name = "SimulatorError";
  readonly code: SimulatorErrorCode;
  override readonly cause: unknown;

  constructor(code: SimulatorErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.cause = cause;
  }
}
