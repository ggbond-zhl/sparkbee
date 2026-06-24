import type { SchemaCatalog } from "../catalog";
import { SchemaRegistryValidator } from "../SchemaRegistryValidator";

import { ocpp16SchemaCatalog } from "./Ocpp16SchemaCatalog";

/**
 * OCPP 1.6 validator 只负责把 action 映射到对应 schema，并输出统一的 ValidationResult。
 * schema 本身由独立 registry 维护，避免把协议动作表和校验流程耦合在一个类里。
 */
export class Ocpp16Validator extends SchemaRegistryValidator {
  constructor(schemaCatalog: SchemaCatalog = ocpp16SchemaCatalog) {
    super("OCPP16J", schemaCatalog);
  }
}
