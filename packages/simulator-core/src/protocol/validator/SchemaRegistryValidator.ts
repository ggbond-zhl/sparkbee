import type { ProtocolVersion } from "../../shared/types";
import {
  type IValidator,
  type ValidationDirection,
  type ValidationResult,
} from "../types";

import {
  mapZodIssues,
  type SchemaCatalog,
  type SchemaCatalogEntry,
  type MessageSchema,
} from "./catalog";
import {
  createUnknownActionIssue,
  createValidateError,
} from "./internal/validatorErrors";

export abstract class SchemaRegistryValidator implements IValidator {
  constructor(
    private readonly protocolVersion: ProtocolVersion,
    private readonly schemaCatalog: SchemaCatalog,
  ) {}

  validate(
    action: string,
    payload: unknown,
    direction: ValidationDirection,
  ): ValidationResult {
    try {
      const schemaEntry = this.resolveSchemaEntry(action);

      if (!schemaEntry) {
        return {
          success: false,
          issues: [
            createUnknownActionIssue(this.protocolVersion, action, direction),
          ],
        };
      }

      const schema = this.resolveSchema(schemaEntry, direction);
      const result = schema.safeParse(payload);

      if (result.success) {
        return { success: true };
      }

      return {
        success: false,
        issues: mapZodIssues(result.error),
      };
    } catch (cause) {
      throw createValidateError(
        this.protocolVersion,
        action,
        direction,
        cause,
      );
    }
  }

  private resolveSchemaEntry(
    action: string,
  ): SchemaCatalogEntry | undefined {
    return this.schemaCatalog[action];
  }

  private resolveSchema(
    schemaEntry: SchemaCatalogEntry,
    direction: ValidationDirection,
  ): MessageSchema {
    return schemaEntry[direction];
  }
}
