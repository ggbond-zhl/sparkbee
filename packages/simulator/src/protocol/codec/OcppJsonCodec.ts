import type { ProtocolVersion } from "../../shared/types";
import type { RawMessage } from "../transport";
import {
  ProtocolError,
  type DecodeResult,
  type ICodec,
  type ProtocolMessage,
} from "../types";
import { createCodecErrorFactory } from "./internal/codecErrorFactory";
import {
  decodeFrameText,
  decodeProtocolFrame,
  parseJsonFrame,
} from "./internal/decodeHelpers";
import { encodeProtocolFrame } from "./internal/encodeHelpers";

/** 负责 OCPP JSON frame 的编排；具体帧校验和消息断言由 helper 模块处理。 */
export abstract class OcppJsonCodec implements ICodec {
  protected abstract readonly protocolVersion: ProtocolVersion;

  decode(msg: RawMessage): DecodeResult {
    try {
      return this.decodeOrThrow(msg);
    } catch (error) {
      if (error instanceof ProtocolError) {
        return { success: false, error };
      }

      throw error;
    }
  }

  encode(msg: ProtocolMessage): RawMessage {
    const errors = createCodecErrorFactory(this.protocolVersion);

    try {
      return JSON.stringify(this.encodeFrameOrThrow(msg));
    } catch (cause) {
      if (cause instanceof ProtocolError) {
        throw cause;
      }

      throw errors.encode("消息无法序列化为 JSON", cause);
    }
  }

  protected decodeOrThrow(msg: RawMessage): DecodeResult {
    const errors = createCodecErrorFactory(this.protocolVersion);
    const frameText = decodeFrameText(msg, errors);
    const frame = parseJsonFrame(frameText, errors);
    return decodeProtocolFrame(frame, errors);
  }

  protected encodeFrameOrThrow(msg: ProtocolMessage): unknown[] {
    const errors = createCodecErrorFactory(this.protocolVersion);
    return encodeProtocolFrame(msg, errors);
  }
}
