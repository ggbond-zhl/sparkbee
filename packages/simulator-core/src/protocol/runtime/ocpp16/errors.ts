export type ProtocolRuntimeErrorCode =
  | "PROTOCOL_RUNTIME_NOT_REGISTERED"
  | "PROTOCOL_RUNTIME_REQUEST_FAILED"
  | "PROTOCOL_RUNTIME_CONNECTOR_NOT_FOUND"
  | "PROTOCOL_RUNTIME_CONNECTOR_NOT_TRANSACTIONAL"
  | "PROTOCOL_RUNTIME_CONNECTOR_NOT_STARTABLE"
  | "PROTOCOL_RUNTIME_TRANSACTION_NOT_FOUND"
  | "PROTOCOL_RUNTIME_TRANSACTION_NOT_BOUND"
  | "PROTOCOL_RUNTIME_INVALID_OPERATION";

export class ProtocolRuntimeError extends Error {
  override readonly name = "ProtocolRuntimeError";
  readonly code: ProtocolRuntimeErrorCode;
  override readonly cause: unknown;

  constructor(code: ProtocolRuntimeErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.cause = cause;
  }
}
