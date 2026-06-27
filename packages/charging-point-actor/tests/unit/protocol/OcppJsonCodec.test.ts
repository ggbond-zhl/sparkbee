import { describe, expect, test } from "vitest";

import { Ocpp16Codec } from "../../../src/protocol/codec/Ocpp16Codec.ts";
import { Ocpp201Codec } from "../../../src/protocol/codec/Ocpp201Codec.ts";
import { OcppJsonCodec } from "../../../src/protocol/codec/OcppJsonCodec.ts";
import { ProtocolError, type DecodeResult } from "../../../src/protocol/types.ts";
import type { ProtocolVersion } from "../../../src/shared/types.ts";

describe("OcppJsonCodec", () => {
  test("decodes request frames from string payloads", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[2,"msg-1","BootNotification",{"vendor":"ACME"}]');

    expect(result).toEqual({
      success: true,
      message: {
        kind: "request",
        messageId: "msg-1",
        action: "BootNotification",
        payload: { vendor: "ACME" },
      },
    });
  });

  test("decodes response frames from Uint8Array payloads", () => {
    const codec = new Ocpp16Codec();
    const payload = new TextEncoder().encode('[3,"msg-2",{"status":"Accepted"}]');

    const result = codec.decode(payload);

    expect(result).toEqual({
      success: true,
      message: {
        kind: "response",
        messageId: "msg-2",
        payload: { status: "Accepted" },
      },
    });
  });

  test("returns a decode error for invalid UTF-8", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode(new Uint8Array([0xc3, 0x28]));

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error).toBeInstanceOf(ProtocolError);
    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("[OCPP16J]");
    expect(result.error.message).toContain("UTF-8");
  });

  test("returns a decode error for invalid JSON", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('{"not":"an array"}');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("JSON 数组");
  });

  test("returns a decode error for malformed JSON text", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode("[2,");

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("合法 JSON");
  });

  test("returns a decode error for unknown message types", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[9,"msg-1","BootNotification",{}]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("未知的 OCPP message type");
  });

  test("returns a decode error when CALL frames have the wrong length", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[2,"msg-1","BootNotification"]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALL 帧长度必须为 4");
  });

  test("returns a decode error when CALL message ids are empty", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[2,"","BootNotification",{}]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALL.messageId 不能为空");
  });

  test("returns a decode error when CALL actions exceed the protocol limit", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode(`[2,"msg-1","${"A".repeat(51)}",{}]`);

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALL.action 长度不能超过 50");
  });

  test("returns a decode error when CALLRESULT frames have non-string message ids", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[3,42,{}]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALLRESULT.messageId 必须是字符串");
  });

  test("returns a decode error when CALLRESULT frames have the wrong length", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[3,"msg-2",{},true]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALLRESULT 帧长度必须为 3");
  });

  test("decodes CALLERROR frames", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode(
      '[4,"msg-3","InternalError","Something went wrong",{"detail":true}]',
    );

    expect(result).toEqual({
      success: true,
      message: {
        kind: "error",
        messageId: "msg-3",
        errorCode: "InternalError",
        errorMessage: "Something went wrong",
        errorDetails: { detail: true },
      },
    });
  });

  test("returns a decode error when CALLERROR fields are invalid", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[4,"msg-3",404,"Something went wrong",{}]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALLERROR.errorCode 必须是字符串");
  });

  test("returns a decode error when CALLERROR frames have the wrong length", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[4,"msg-3","InternalError","failure"]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALLERROR 帧长度必须为 5");
  });

  test("returns a decode error when CALLERROR message ids are invalid", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[4,42,"InternalError","failure",{}]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALLERROR.messageId 必须是字符串");
  });

  test("returns a decode error when CALLERROR messages are not strings", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[4,"msg-3","InternalError",42,{}]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALLERROR.errorMessage 必须是字符串");
  });

  test("returns a decode error when CALLERROR details are not objects", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode('[4,"msg-3","InternalError","Something went wrong",42]');

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("CALLERROR.errorDetails 必须是对象");
  });

  test("returns a decode error when raw message types are unsupported", () => {
    const codec = new Ocpp16Codec();

    const result = codec.decode(42 as unknown as Parameters<typeof codec.decode>[0]);

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected decode to fail");
    }

    expect(result.error.code).toBe("DECODE_ERROR");
    expect(result.error.message).toContain("合法 UTF-8 文本");
    expect(result.error.cause).toBeInstanceOf(TypeError);
  });

  test("encodes request, response, and error frames", () => {
    const codec = new Ocpp16Codec();

    expect(
      codec.encode({
        kind: "request",
        messageId: "req-1",
        action: "Heartbeat",
        payload: {},
      }),
    ).toBe('[2,"req-1","Heartbeat",{}]');

    expect(
      codec.encode({
        kind: "response",
        messageId: "res-1",
        payload: { status: "Accepted" },
      }),
    ).toBe('[3,"res-1",{"status":"Accepted"}]');

    expect(
      codec.encode({
        kind: "error",
        messageId: "err-1",
        errorCode: "InternalError",
        errorMessage: "failure",
        errorDetails: {},
      }),
    ).toBe('[4,"err-1","InternalError","failure",{}]');
  });

  test("throws ENCODE_ERROR when request messages are missing required fields", () => {
    const codec = new Ocpp16Codec();

    expect(() =>
      codec.encode({
        kind: "request",
        messageId: "req-2",
        action: "Heartbeat",
        payload: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "ENCODE_ERROR",
      }),
    );
  });

  test("throws ENCODE_ERROR when response messages are missing payloads", () => {
    const codec = new Ocpp16Codec();

    expect(() =>
      codec.encode({
        kind: "response",
        messageId: "res-2",
        payload: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "ENCODE_ERROR",
      }),
    );
  });

  test("throws ENCODE_ERROR when response message ids are empty", () => {
    const codec = new Ocpp16Codec();

    expect(() =>
      codec.encode({
        kind: "response",
        messageId: "",
        payload: {},
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "ENCODE_ERROR",
        message: expect.stringContaining("messageId 不能为空"),
      }),
    );
  });

  test("throws ENCODE_ERROR when request actions exceed the protocol limit", () => {
    const codec = new Ocpp16Codec();

    expect(() =>
      codec.encode({
        kind: "request",
        messageId: "req-3",
        action: "A".repeat(51),
        payload: {},
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "ENCODE_ERROR",
        message: expect.stringContaining("action 长度不能超过 50"),
      }),
    );
  });

  test("throws ENCODE_ERROR when error messages are missing details", () => {
    const codec = new Ocpp16Codec();

    expect(() =>
      codec.encode({
        kind: "error",
        messageId: "err-2",
        errorCode: "InternalError",
        errorMessage: "failure",
        errorDetails: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "ENCODE_ERROR",
      }),
    );
  });

  test("throws ENCODE_ERROR when error details are not objects", () => {
    const codec = new Ocpp16Codec();

    expect(() =>
      codec.encode({
        kind: "error",
        messageId: "err-3",
        errorCode: "InternalError",
        errorMessage: "failure",
        errorDetails: 42,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "ENCODE_ERROR",
        message: expect.stringContaining("errorDetails 必须是对象"),
      }),
    );
  });

  test("wraps JSON serialization failures in ENCODE_ERROR", () => {
    const codec = new Ocpp201Codec();
    const payload: Record<string, unknown> = {};

    payload.self = payload;

    expect(() =>
      codec.encode({
        kind: "response",
        messageId: "res-3",
        payload,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "ENCODE_ERROR",
        message: expect.stringContaining("[OCPP201]"),
      }),
    );
  });

  test("rethrows unexpected non-ProtocolError decode failures", () => {
    class ExplodingCodec extends OcppJsonCodec {
      protected readonly protocolVersion: ProtocolVersion = "OCPP16J";

      protected override decodeOrThrow(
        _msg: Parameters<OcppJsonCodec["decode"]>[0],
      ): DecodeResult {
        throw new Error("decode exploded");
      }
    }

    const codec = new ExplodingCodec();

    expect(() => codec.decode('[2,"msg-1","Heartbeat",{}]')).toThrow(
      new Error("decode exploded"),
    );
  });
});
