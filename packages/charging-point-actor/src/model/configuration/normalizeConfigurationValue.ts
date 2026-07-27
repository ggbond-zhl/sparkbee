import { assertFiniteNumber } from "../shared/invariants";

import type { ConfigurationValueType } from "./types";

export interface ConfigurationValueDefinition {
  key: string;
  valueType?: ConfigurationValueType;
  minValue?: number;
  maxValue?: number;
}

export function normalizeConfigurationValue(
  definition: ConfigurationValueDefinition,
  value: string,
): string {
  if (definition.valueType === undefined || definition.valueType === "string") {
    return value;
  }

  if (definition.valueType === "boolean") {
    const normalized = value.trim().toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      throw new Error(`配置项 ${definition.key} 只接受 true/false`);
    }
    return normalized;
  }

  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`配置项 ${definition.key} 只接受整数`);
  }

  const parsed = Number(normalized);
  assertFiniteNumber(parsed, `${definition.key}.value`);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`配置项 ${definition.key} 超出安全整数范围`);
  }
  if (definition.minValue !== undefined && parsed < definition.minValue) {
    throw new Error(`配置项 ${definition.key} 不能小于 ${definition.minValue}`);
  }
  if (definition.maxValue !== undefined && parsed > definition.maxValue) {
    throw new Error(`配置项 ${definition.key} 不能大于 ${definition.maxValue}`);
  }
  return String(parsed);
}
