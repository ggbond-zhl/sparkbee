import type { ProtocolVersion } from "../../shared/types";
import type { IValidator } from "../types";

import { Ocpp16Validator } from "./Ocpp16";
import { Ocpp201Validator } from "./Ocpp201";

const validatorFactories: Record<ProtocolVersion, () => IValidator> = {
  OCPP16J: () => new Ocpp16Validator(),
  OCPP201: () => new Ocpp201Validator(),
};

/**
 * 集中维护协议版本到 validator 的映射，避免调用方在多处散落版本分支。
 * 新增协议版本时，这里的 Record 约束会强制补齐对应实现。
 *
 * @param protocolVersion 协议版本标识
 * @returns 对应版本的校验器实例
 */
export function createValidator(protocolVersion: ProtocolVersion): IValidator {
  return validatorFactories[protocolVersion]();
}

export { SchemaRegistryValidator } from "./SchemaRegistryValidator";
export { mapZodIssues } from "./catalog";
export type {
  MessageSchema,
  RequestOf,
  ResponseOf,
  SchemaCatalog,
  SchemaCatalogEntry,
} from "./catalog";
export { Ocpp16Validator } from "./Ocpp16";
export { Ocpp201Validator } from "./Ocpp201";
export * as Ocpp16 from "./Ocpp16";
export * as Ocpp201 from "./Ocpp201";
