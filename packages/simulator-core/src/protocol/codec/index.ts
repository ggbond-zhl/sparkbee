import type { ProtocolVersion } from "../../shared/types";
import type { ICodec } from "../types";

import { Ocpp16Codec } from "./Ocpp16Codec";
import { Ocpp201Codec } from "./Ocpp201Codec";

const codecFactories: Record<ProtocolVersion, () => ICodec> = {
  OCPP16J: () => new Ocpp16Codec(),
  OCPP201: () => new Ocpp201Codec(),
};

/**
 * 集中维护协议版本到 codec 的映射，避免调用方在多处散落版本分支。
 * 新增协议版本时，这里的 Record 约束会强制补齐对应实现。
 *
 * @param protocolVersion 协议版本标识
 * @returns 对应版本的编解码器实例
 */
export function createCodec(protocolVersion: ProtocolVersion): ICodec {
  return codecFactories[protocolVersion]();
}

export { Ocpp16Codec } from "./Ocpp16Codec";
export { Ocpp201Codec } from "./Ocpp201Codec";
