export type ModelErrorCode =
  | "MODEL_INVALID_ARGUMENT"
  | "MODEL_DUPLICATE_RESOURCE"
  | "MODEL_RESOURCE_NOT_FOUND"
  | "MODEL_STATE_CONFLICT";

export class ModelError extends Error {
  override readonly name = "ModelError";
  readonly code: ModelErrorCode;
  override readonly cause: unknown;

  constructor(code: ModelErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.cause = cause;
  }
}
