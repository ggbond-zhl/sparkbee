import type { ProtocolVersion } from "../../../shared/types";
import {
  ProtocolError,
  type ValidationDirection,
  type ValidationIssue,
} from "../../types";

export function createUnknownActionIssue(
  protocolVersion: ProtocolVersion,
  action: string,
  direction: ValidationDirection,
): ValidationIssue {
  return {
    path: ["action"],
    message: `[${protocolVersion}] 未注册 ${action}.${direction} schema`,
    code: "UNKNOWN_ACTION",
  };
}

export function createValidateError(
  protocolVersion: ProtocolVersion,
  action: string,
  direction: ValidationDirection,
  cause: unknown,
): ProtocolError {
  return new ProtocolError(
    "VALIDATE_ERROR",
    `[${protocolVersion}] 校验 ${action}.${direction} 时发生内部异常`,
    cause,
  );
}
