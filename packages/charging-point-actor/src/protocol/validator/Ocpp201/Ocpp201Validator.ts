import type { SchemaCatalog } from "../catalog";
import { SchemaRegistryValidator } from "../SchemaRegistryValidator";

import { ocpp201SchemaCatalog } from "./Ocpp201SchemaCatalog";

/**
 * OCPP 2.0.1 的 validator 继续复用统一错误模型，避免把底层 zod 异常直接暴露给调用方。
 * 对调用方来说，只需要区分 schema 不通过与 validator 自身异常即可。
 */
export class Ocpp201Validator extends SchemaRegistryValidator {
  constructor(schemaCatalog: SchemaCatalog = ocpp201SchemaCatalog) {
    super("OCPP201", schemaCatalog);
  }
}
