import type { RawMessage } from "../../transport";
import type {
  DecodeResult,
  ErrorMessage,
  ProtocolError,
  RequestMessage,
  ResponseMessage,
} from "../../types";
import type { CodecErrorFactory } from "./codecErrorFactory";
import {
  CALL_ERROR_MESSAGE_TYPE,
  CALL_MESSAGE_TYPE,
  CALL_RESULT_MESSAGE_TYPE,
  MAX_ACTION_LENGTH,
  MAX_MESSAGE_ID_LENGTH,
  isPlainObject,
  validateDecodeStringField,
} from "./frameValidation";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function decodeRawMessage(message: RawMessage): string {
  if (typeof message === "string") {
    return message;
  }

  if (message instanceof Uint8Array) {
    return utf8Decoder.decode(message);
  }

  throw new TypeError("raw message 必须是 string 或 Uint8Array");
}

export function decodeFrameText(
  message: RawMessage,
  errors: CodecErrorFactory,
): string {
  try {
    return decodeRawMessage(message);
  } catch (cause) {
    throw errors.decode("raw message 不是合法 UTF-8 文本", cause);
  }
}

export function parseJsonFrame(
  frameText: string,
  errors: CodecErrorFactory,
): unknown[] {
  const frame = parseJson(frameText, errors);
  assertArrayFrame(frame, errors);
  return frame;
}

export function decodeProtocolFrame(
  frame: unknown[],
  errors: CodecErrorFactory,
): DecodeResult {
  switch (frame[0]) {
    case CALL_MESSAGE_TYPE:
      return decodeRequestFrame(frame, errors);
    case CALL_RESULT_MESSAGE_TYPE:
      return decodeResponseFrame(frame, errors);
    case CALL_ERROR_MESSAGE_TYPE:
      return decodeErrorFrame(frame, errors);
    default:
      return createDecodeFailure(errors.decode("未知的 OCPP message type"));
  }
}

function parseJson(
  frameText: string,
  errors: CodecErrorFactory,
): unknown {
  try {
    return JSON.parse(frameText);
  } catch (cause) {
    throw errors.decode("raw message 不是合法 JSON", cause);
  }
}

function assertArrayFrame(
  frame: unknown,
  errors: CodecErrorFactory,
): asserts frame is unknown[] {
  if (!Array.isArray(frame)) {
    throw errors.decode("OCPP 帧必须是 JSON 数组");
  }
}

function decodeRequestFrame(
  frame: unknown[],
  errors: CodecErrorFactory,
): DecodeResult {
  if (frame.length !== 4) {
    return createDecodeFailure(errors.decode("CALL 帧长度必须为 4"));
  }

  const [, messageId, action, payload] = frame;
  const messageIdResult = readDecodeStringField(
    messageId,
    "CALL.messageId",
    MAX_MESSAGE_ID_LENGTH,
    errors,
  );
  if (messageIdResult instanceof Error) {
    return createDecodeFailure(messageIdResult);
  }

  const actionResult = readDecodeStringField(
    action,
    "CALL.action",
    MAX_ACTION_LENGTH,
    errors,
  );
  if (actionResult instanceof Error) {
    return createDecodeFailure(actionResult);
  }

  return createDecodeSuccess<RequestMessage>({
    kind: "request",
    messageId: messageIdResult,
    action: actionResult,
    payload,
  });
}

function decodeResponseFrame(
  frame: unknown[],
  errors: CodecErrorFactory,
): DecodeResult {
  if (frame.length !== 3) {
    return createDecodeFailure(errors.decode("CALLRESULT 帧长度必须为 3"));
  }

  const [, messageId, payload] = frame;
  const messageIdResult = readDecodeStringField(
    messageId,
    "CALLRESULT.messageId",
    MAX_MESSAGE_ID_LENGTH,
    errors,
  );
  if (messageIdResult instanceof Error) {
    return createDecodeFailure(messageIdResult);
  }

  return createDecodeSuccess<ResponseMessage>({
    kind: "response",
    messageId: messageIdResult,
    payload,
  });
}

function decodeErrorFrame(
  frame: unknown[],
  errors: CodecErrorFactory,
): DecodeResult {
  if (frame.length !== 5) {
    return createDecodeFailure(errors.decode("CALLERROR 帧长度必须为 5"));
  }

  const [, messageId, errorCode, errorMessage, errorDetails] = frame;
  const messageIdResult = readDecodeStringField(
    messageId,
    "CALLERROR.messageId",
    MAX_MESSAGE_ID_LENGTH,
    errors,
  );
  if (messageIdResult instanceof Error) {
    return createDecodeFailure(messageIdResult);
  }

  if (typeof errorCode !== "string") {
    return createDecodeFailure(
      errors.decode("CALLERROR.errorCode 必须是字符串"),
    );
  }

  if (typeof errorMessage !== "string") {
    return createDecodeFailure(
      errors.decode("CALLERROR.errorMessage 必须是字符串"),
    );
  }

  if (!isPlainObject(errorDetails)) {
    return createDecodeFailure(
      errors.decode("CALLERROR.errorDetails 必须是对象"),
    );
  }

  return createDecodeSuccess<ErrorMessage>({
    kind: "error",
    messageId: messageIdResult,
    errorCode,
    errorMessage,
    errorDetails,
  });
}

function readDecodeStringField(
  value: unknown,
  fieldName: string,
  maxLength: number,
  errors: CodecErrorFactory,
): string | ProtocolError {
  const validationError = validateDecodeStringField(
    value,
    fieldName,
    maxLength,
    errors,
  );
  if (validationError !== undefined) {
    return validationError;
  }

  return value as string;
}

function createDecodeSuccess<T extends RequestMessage | ResponseMessage | ErrorMessage>(
  message: T,
): DecodeResult {
  return { success: true, message };
}

function createDecodeFailure(error: ProtocolError): DecodeResult {
  return { success: false, error };
}
