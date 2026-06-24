import { describe, expect, test } from "vitest";

import { createCodecErrorFactory } from "../../../src/protocol/codec/internal/codecErrorFactory.ts";
import { decodeRawMessage } from "../../../src/protocol/codec/internal/decodeHelpers.ts";
import {
  MAX_ACTION_LENGTH,
  MAX_MESSAGE_ID_LENGTH,
  assertEncodeStringField,
  isPlainObject,
  validateDecodeStringField,
} from "../../../src/protocol/codec/internal/frameValidation.ts";

describe("protocol codec helpers", () => {
  test("prefixes decode and encode errors with the protocol version", () => {
    const errors = createCodecErrorFactory("OCPP201");

    expect(errors.decode("decode failed")).toMatchObject({
      code: "DECODE_ERROR",
      message: "[OCPP201] decode failed",
    });
    expect(errors.encode("encode failed")).toMatchObject({
      code: "ENCODE_ERROR",
      message: "[OCPP201] encode failed",
    });
  });

  test("validates decode string fields", () => {
    const errors = createCodecErrorFactory("OCPP16J");

    expect(
      validateDecodeStringField(42, "CALL.messageId", MAX_MESSAGE_ID_LENGTH, errors),
    ).toMatchObject({
      code: "DECODE_ERROR",
      message: "[OCPP16J] CALL.messageId 必须是字符串",
    });
    expect(
      validateDecodeStringField("", "CALL.messageId", MAX_MESSAGE_ID_LENGTH, errors),
    ).toMatchObject({
      message: "[OCPP16J] CALL.messageId 不能为空",
    });
    expect(
      validateDecodeStringField(
        "A".repeat(MAX_ACTION_LENGTH + 1),
        "CALL.action",
        MAX_ACTION_LENGTH,
        errors,
      ),
    ).toMatchObject({
      message: `[OCPP16J] CALL.action 长度不能超过 ${MAX_ACTION_LENGTH}`,
    });
    expect(
      validateDecodeStringField("ok", "CALL.action", MAX_ACTION_LENGTH, errors),
    ).toBeUndefined();
  });

  test("asserts encode string fields", () => {
    const errors = createCodecErrorFactory("OCPP16J");

    expect(() =>
      assertEncodeStringField(42, "request message.messageId", MAX_MESSAGE_ID_LENGTH, errors),
    ).toThrow(expect.objectContaining({
      code: "ENCODE_ERROR",
      message: "[OCPP16J] request message.messageId 必须是字符串",
    }));

    expect(() =>
      assertEncodeStringField("", "request message.messageId", MAX_MESSAGE_ID_LENGTH, errors),
    ).toThrow(expect.objectContaining({
      code: "ENCODE_ERROR",
      message: "[OCPP16J] request message.messageId 不能为空",
    }));

    expect(() =>
      assertEncodeStringField(
        "A".repeat(MAX_ACTION_LENGTH + 1),
        "request message.action",
        MAX_ACTION_LENGTH,
        errors,
      ),
    ).toThrow(expect.objectContaining({
      code: "ENCODE_ERROR",
      message: `[OCPP16J] request message.action 长度不能超过 ${MAX_ACTION_LENGTH}`,
    }));
  });

  test("accepts plain objects and rejects arrays and null", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("text")).toBe(false);
  });

  test("throws TypeError for unsupported raw message values before protocol wrapping", () => {
    expect(() =>
      decodeRawMessage(42 as unknown as Parameters<typeof decodeRawMessage>[0]),
    ).toThrow(new TypeError("raw message 必须是 string 或 Uint8Array"));
  });
});
