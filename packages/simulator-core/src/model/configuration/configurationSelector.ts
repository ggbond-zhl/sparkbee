import { assertPositiveInteger } from "../shared/invariants";
import type {
  ConfigurationAttributeType,
  ConfigurationComponentRef,
  ConfigurationEntrySelector,
  ConfigurationVariableRef,
} from "./types";

export interface NormalizedConfigurationEntrySelector {
  key?: string;
  component?: ConfigurationComponentRef;
  variable?: ConfigurationVariableRef;
  attributeType?: ConfigurationAttributeType;
}

function cloneComponentRef(
  value: ConfigurationComponentRef,
): ConfigurationComponentRef {
  return {
    name: value.name,
    instance: value.instance,
    evseId: value.evseId,
    connectorId: value.connectorId,
  };
}

function cloneVariableRef(
  value: ConfigurationVariableRef,
): ConfigurationVariableRef {
  return {
    name: value.name,
    instance: value.instance,
  };
}

export function cloneSelector(
  value: NormalizedConfigurationEntrySelector,
): ConfigurationEntrySelector {
  return {
    key: value.key,
    component: value.component === undefined
      ? undefined
      : cloneComponentRef(value.component),
    variable: value.variable === undefined
      ? undefined
      : cloneVariableRef(value.variable),
    attributeType: value.attributeType,
  };
}

function normalizeComponentRef(
  value: ConfigurationComponentRef | undefined,
): ConfigurationComponentRef | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value.evseId !== undefined) {
    assertPositiveInteger(value.evseId, "component.evseId");
  }

  if (value.connectorId !== undefined) {
    assertPositiveInteger(value.connectorId, "component.connectorId");
  }

  if (value.connectorId !== undefined && value.evseId === undefined) {
    throw new Error("connectorId 存在时必须同时指定 evseId");
  }

  return cloneComponentRef(value);
}

function normalizeVariableRef(
  value: ConfigurationVariableRef | undefined,
): ConfigurationVariableRef | undefined {
  return value === undefined ? undefined : cloneVariableRef(value);
}

export function normalizeSelector(
  selector: ConfigurationEntrySelector | undefined,
  fallbackKey?: string,
): NormalizedConfigurationEntrySelector {
  const normalizedKey = selector?.key ?? fallbackKey;
  const normalizedComponent = normalizeComponentRef(selector?.component);
  const normalizedVariable = normalizeVariableRef(selector?.variable);
  const hasStructuredSelector = normalizedComponent !== undefined ||
    normalizedVariable !== undefined ||
    selector?.attributeType !== undefined;

  if (
    fallbackKey !== undefined &&
    selector?.key !== undefined &&
    selector.key !== fallbackKey
  ) {
    throw new Error("key 与 selector.key 不能冲突");
  }

  if (hasStructuredSelector) {
    if (normalizedComponent === undefined || normalizedVariable === undefined) {
      throw new Error("结构化 selector 必须同时包含 component 与 variable");
    }
  } else if (normalizedKey === undefined) {
    throw new Error("配置项必须至少提供 key 或结构化 selector");
  }

  return {
    ...(normalizedKey === undefined ? {} : { key: normalizedKey }),
    ...(normalizedComponent === undefined ? {} : { component: normalizedComponent }),
    ...(normalizedVariable === undefined ? {} : { variable: normalizedVariable }),
    ...(selector?.attributeType === undefined
      ? {}
      : { attributeType: selector.attributeType }),
  };
}

export function createStructuredSelectorKey(
  selector: NormalizedConfigurationEntrySelector,
): string {
  if (selector.component === undefined || selector.variable === undefined) {
    throw new Error("结构化 selector 缺少 component 或 variable");
  }

  const componentSegments = [`name=${selector.component.name}`];
  if (selector.component.instance !== undefined) {
    componentSegments.push(`instance=${selector.component.instance}`);
  }
  if (selector.component.evseId !== undefined) {
    componentSegments.push(`evse=${selector.component.evseId}`);
  }
  if (selector.component.connectorId !== undefined) {
    componentSegments.push(`connector=${selector.component.connectorId}`);
  }

  const variableSegments = [`name=${selector.variable.name}`];
  if (selector.variable.instance !== undefined) {
    variableSegments.push(`instance=${selector.variable.instance}`);
  }

  return `component(${componentSegments.join(",")})/variable(${
    variableSegments.join(",")
  })/attribute(${selector.attributeType ?? "Actual"})`;
}

export function createSelectorId(
  selector: NormalizedConfigurationEntrySelector,
): string {
  if (selector.component !== undefined && selector.variable !== undefined) {
    return createStructuredSelectorKey(selector);
  }

  if (selector.key === undefined) {
    throw new Error("扁平 selector 缺少 key");
  }

  return `key:${selector.key}`;
}

export function createEntryKey(
  selector: NormalizedConfigurationEntrySelector,
): string {
  return selector.key ?? createStructuredSelectorKey(selector);
}
