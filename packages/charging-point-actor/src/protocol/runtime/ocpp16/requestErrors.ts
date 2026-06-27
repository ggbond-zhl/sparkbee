import { SessionError } from "../../session/types";

export function toRequestErrorInfo(cause: unknown): {
  errorCode: string;
  errorMessage: string;
} {
  if (cause instanceof SessionError) {
    return {
      errorCode: cause.code,
      errorMessage: cause.message,
    };
  }

  if (cause instanceof Error) {
    return {
      errorCode: "INTERNAL_ERROR",
      errorMessage: cause.message,
    };
  }

  return {
    errorCode: "INTERNAL_ERROR",
    errorMessage: String(cause),
  };
}

export function getUnexpectedResponseFields(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  return Object.keys(payload);
}
