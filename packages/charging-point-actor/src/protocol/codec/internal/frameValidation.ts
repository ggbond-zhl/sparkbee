import type { ProtocolError } from "../../types";
import type { CodecErrorFactory } from "./codecErrorFactory";

export const CALL_MESSAGE_TYPE = 2;
export const CALL_RESULT_MESSAGE_TYPE = 3;
export const CALL_ERROR_MESSAGE_TYPE = 4;
export const MAX_MESSAGE_ID_LENGTH = 36;
export const MAX_ACTION_LENGTH = 50;

export function validateDecodeStringField(
  value: unknown,
  fieldName: string,
  maxLength: number,
  errors: CodecErrorFactory,
): ProtocolError | undefined {
  if (typeof value !== "string") {
    return errors.decode(`${fieldName} 必须是字符串`);
  }

  if (value.length === 0) {
    return errors.decode(`${fieldName} 不能为空`);
  }

  if (value.length > maxLength) {
    return errors.decode(`${fieldName} 长度不能超过 ${maxLength}`);
  }

  return undefined;
}

export function assertEncodeStringField(
  value: unknown,
  fieldName: string,
  maxLength: number,
  errors: CodecErrorFactory,
): asserts value is string {
  if (typeof value !== "string") {
    throw errors.encode(`${fieldName} 必须是字符串`);
  }

  if (value.length === 0) {
    throw errors.encode(`${fieldName} 不能为空`);
  }

  if (value.length > maxLength) {
    throw errors.encode(`${fieldName} 长度不能超过 ${maxLength}`);
  }
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
