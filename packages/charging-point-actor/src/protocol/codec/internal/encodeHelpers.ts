import type {
  ErrorMessage,
  ProtocolMessage,
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
  assertEncodeStringField,
  isPlainObject,
} from "./frameValidation";

type EncodedProtocolFrame =
  | [typeof CALL_MESSAGE_TYPE, string, string, unknown]
  | [typeof CALL_RESULT_MESSAGE_TYPE, string, unknown]
  | [typeof CALL_ERROR_MESSAGE_TYPE, string, string, string, Record<string, unknown>];

export function encodeProtocolFrame(
  message: ProtocolMessage,
  errors: CodecErrorFactory,
): EncodedProtocolFrame {
  switch (message.kind) {
    case "request":
      assertRequestMessage(message, errors);
      return [CALL_MESSAGE_TYPE, message.messageId, message.action, message.payload];
    case "response":
      assertResponseMessage(message, errors);
      return [CALL_RESULT_MESSAGE_TYPE, message.messageId, message.payload];
    case "error":
      assertErrorMessage(message, errors);
      return [
        CALL_ERROR_MESSAGE_TYPE,
        message.messageId,
        message.errorCode,
        message.errorMessage,
        message.errorDetails,
      ];
  }
}

function assertRequestMessage(
  message: ProtocolMessage,
  errors: CodecErrorFactory,
): asserts message is RequestMessage {
  if (message.kind !== "request" || message.payload === undefined) {
    throw errors.encode("request message 缺少必要字段或字段类型不正确");
  }

  assertEncodeStringField(
    message.messageId,
    "request message.messageId",
    MAX_MESSAGE_ID_LENGTH,
    errors,
  );
  assertEncodeStringField(
    message.action,
    "request message.action",
    MAX_ACTION_LENGTH,
    errors,
  );
}

function assertResponseMessage(
  message: ProtocolMessage,
  errors: CodecErrorFactory,
): asserts message is ResponseMessage {
  if (message.kind !== "response" || message.payload === undefined) {
    throw errors.encode("response message 缺少必要字段或字段类型不正确");
  }

  assertEncodeStringField(
    message.messageId,
    "response message.messageId",
    MAX_MESSAGE_ID_LENGTH,
    errors,
  );
}

function assertErrorMessage(
  message: ProtocolMessage,
  errors: CodecErrorFactory,
): asserts message is ErrorMessage & { errorDetails: Record<string, unknown> } {
  if (
    message.kind !== "error" ||
    typeof message.errorCode !== "string" ||
    typeof message.errorMessage !== "string" ||
    message.errorDetails === undefined
  ) {
    throw errors.encode("error message 缺少必要字段或字段类型不正确");
  }

  assertEncodeStringField(
    message.messageId,
    "error message.messageId",
    MAX_MESSAGE_ID_LENGTH,
    errors,
  );

  if (!isPlainObject(message.errorDetails)) {
    throw errors.encode("error message.errorDetails 必须是对象");
  }
}
