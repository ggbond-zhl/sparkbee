import type { ProtocolVersion } from "../../../shared/types";
import { ProtocolError } from "../../types";

export type CodecErrorFactory = {
  decode(message: string, cause?: unknown): ProtocolError;
  encode(message: string, cause?: unknown): ProtocolError;
};

/** 统一生成带协议版本前缀的 codec 错误。 */
export function createCodecErrorFactory(
  protocolVersion: ProtocolVersion,
): CodecErrorFactory {
  return {
    decode(message: string, cause?: unknown): ProtocolError {
      return new ProtocolError(
        "DECODE_ERROR",
        `[${protocolVersion}] ${message}`,
        cause,
      );
    },
    encode(message: string, cause?: unknown): ProtocolError {
      return new ProtocolError(
        "ENCODE_ERROR",
        `[${protocolVersion}] ${message}`,
        cause,
      );
    },
  };
}
