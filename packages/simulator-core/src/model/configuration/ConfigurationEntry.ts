import {
  cloneNullableDate,
  cloneOptionalDate,
} from "../shared/collections";
import {
  assertFiniteNumber,
} from "../shared/invariants";
import {
  cloneSelector,
  createEntryKey,
  createSelectorId,
  normalizeSelector,
  type NormalizedConfigurationEntrySelector,
} from "./configurationSelector";
import type {
  ConfigurationEntryChangeResult,
  ConfigurationEntryOptions,
  ConfigurationEntrySelector,
  ConfigurationEntrySyncResult,
  ConfigurationValueType,
} from "./types";

export class ConfigurationEntry {
  readonly key: string;
  readonly isReadonly: boolean;
  readonly valueType: ConfigurationValueType;
  readonly rebootRequired: boolean;
  readonly minValue?: number;
  readonly maxValue?: number;
  private readonly selectorId: string;
  private readonly _selector: NormalizedConfigurationEntrySelector;
  private _value: string;
  private _updatedAt: Date | null;

  constructor(options: ConfigurationEntryOptions) {
    this._selector = normalizeSelector(options.selector, options.key);
    this.selectorId = createSelectorId(this._selector);
    this.key = createEntryKey(this._selector);
    this.isReadonly = options.readonly ?? false;
    this.valueType = options.valueType ?? "string";
    this.rebootRequired = options.rebootRequired ?? false;
    this.minValue = options.minValue;
    this.maxValue = options.maxValue;
    this._value = this.normalizeValue(options.value);
    this._updatedAt = cloneOptionalDate(options.updatedAt ?? null, "updatedAt") ?? null;

    if (this.minValue !== undefined) {
      assertFiniteNumber(this.minValue, `${this.key}.minValue`);
    }

    if (this.maxValue !== undefined) {
      assertFiniteNumber(this.maxValue, `${this.key}.maxValue`);
    }

    if (
      this.minValue !== undefined &&
      this.maxValue !== undefined &&
      this.minValue > this.maxValue
    ) {
      throw new Error(`配置项 ${this.key} 的最小值不能大于最大值`);
    }
  }

  get selector(): ConfigurationEntrySelector {
    return cloneSelector(this._selector);
  }

  get value(): string {
    return this._value;
  }

  get updatedAt(): Date | null {
    return cloneNullableDate(this._updatedAt, "updatedAt");
  }

  matchesSelector(selector: ConfigurationEntrySelector): boolean {
    return this.selectorId === createSelectorId(normalizeSelector(selector));
  }

  changeValue(
    nextValue: string,
    at: Date,
  ): ConfigurationEntryChangeResult {
    if (this.isReadonly) {
      return {
        entry: this,
        status: "rejected",
      };
    }

    try {
      return this.applyValue(nextValue, at);
    } catch {
      return {
        entry: this,
        status: "rejected",
      };
    }
  }

  syncValue(nextValue: string, at: Date): ConfigurationEntrySyncResult {
    const normalized = this.normalizeValue(nextValue);
    if (normalized === this._value) {
      return {
        entry: this,
        changed: false,
      };
    }

    return {
      entry: this.clone({
        value: normalized,
        updatedAt: at,
      }),
      changed: true,
    };
  }

  getSelectorId(): string {
    return this.selectorId;
  }

  private clone(overrides: Partial<ConfigurationEntryOptions>): ConfigurationEntry {
    return new ConfigurationEntry({
      key: this.key,
      selector: this.selector,
      value: this.value,
      readonly: this.isReadonly,
      valueType: this.valueType,
      rebootRequired: this.rebootRequired,
      minValue: this.minValue,
      maxValue: this.maxValue,
      updatedAt: this.updatedAt,
      ...overrides,
    });
  }

  private applyValue(
    nextValue: string,
    at: Date,
  ): ConfigurationEntryChangeResult {
    const normalized = this.normalizeValue(nextValue);
    if (normalized === this._value) {
      return {
        entry: this,
        status: "accepted",
      };
    }

    return {
      entry: this.clone({
        value: normalized,
        updatedAt: at,
      }),
      status: this.rebootRequired ? "reboot-required" : "accepted",
    };
  }

  private normalizeValue(value: string): string {
    if (this.valueType === "string") {
      return value;
    }

    if (this.valueType === "boolean") {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "true" && normalized !== "false") {
        throw new Error(`配置项 ${this.key} 只接受 true/false`);
      }

      return normalized;
    }

    const normalized = value.trim();
    if (!/^-?\d+$/.test(normalized)) {
      throw new Error(`配置项 ${this.key} 只接受整数`);
    }

    const parsed = Number(normalized);
    assertFiniteNumber(parsed, `${this.key}.value`);

    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`配置项 ${this.key} 超出安全整数范围`);
    }

    if (this.minValue !== undefined && parsed < this.minValue) {
      throw new Error(`配置项 ${this.key} 不能小于 ${this.minValue}`);
    }

    if (this.maxValue !== undefined && parsed > this.maxValue) {
      throw new Error(`配置项 ${this.key} 不能大于 ${this.maxValue}`);
    }

    return String(parsed);
  }
}
