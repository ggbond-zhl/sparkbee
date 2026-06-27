import type { ProtocolVersion } from "../../shared/types";
import {
  createSelectorId,
  normalizeSelector,
} from "./configurationSelector";
import { ConfigurationEntry } from "./ConfigurationEntry";
import type {
  ConfigurationCatalogChangeResult,
  ConfigurationCatalogOptions,
  ConfigurationCatalogSyncResult,
  ConfigurationEntrySelector,
} from "./types";

export class ConfigurationCatalog {
  readonly chargingPointId: string;
  readonly protocolVersion: ProtocolVersion;
  readonly catalogId: string;
  private readonly entriesByKey: Map<string, ConfigurationEntry>;
  private readonly entriesBySelectorId: Map<string, ConfigurationEntry>;

  constructor(options: ConfigurationCatalogOptions) {
    const entriesByKey = new Map<string, ConfigurationEntry>();
    const entriesBySelectorId = new Map<string, ConfigurationEntry>();
    for (const entryInput of options.entries ?? []) {
      const entry = entryInput instanceof ConfigurationEntry
        ? entryInput
        : new ConfigurationEntry(entryInput);
      if (entriesByKey.has(entry.key)) {
        throw new Error(`配置项 ${entry.key} 已存在`);
      }

      if (entriesBySelectorId.has(entry.getSelectorId())) {
        throw new Error(`配置项 ${entry.key} 的 selector 已存在`);
      }

      entriesByKey.set(entry.key, entry);
      entriesBySelectorId.set(entry.getSelectorId(), entry);
    }

    this.chargingPointId = options.chargingPointId;
    this.protocolVersion = options.protocolVersion;
    this.catalogId = ConfigurationCatalog.createId(
      options.chargingPointId,
      options.protocolVersion,
    );
    this.entriesByKey = entriesByKey;
    this.entriesBySelectorId = entriesBySelectorId;
  }

  static createId(
    chargingPointId: string,
    protocolVersion: ProtocolVersion,
  ): string {
    return `${protocolVersion}:${chargingPointId}`;
  }

  listEntries(): ConfigurationEntry[] {
    return [...this.entriesByKey.values()];
  }

  getEntry(key: string): ConfigurationEntry | undefined {
    return this.entriesByKey.get(key);
  }

  getEntryBySelector(
    selector: ConfigurationEntrySelector,
  ): ConfigurationEntry | undefined {
    return this.entriesBySelectorId.get(createSelectorId(normalizeSelector(selector)));
  }

  changeValue(
    key: string,
    nextValue: string,
    at: Date,
  ): ConfigurationCatalogChangeResult {
    const entry = this.entriesByKey.get(key);
    if (entry === undefined) {
      return {
        catalog: this,
        status: "not-supported",
      };
    }

    const result = entry.changeValue(nextValue, at);
    return {
      catalog: result.entry === entry ? this : this.replaceEntry(result.entry),
      status: result.status,
    };
  }

  changeValueBySelector(
    selector: ConfigurationEntrySelector,
    nextValue: string,
    at: Date,
  ): ConfigurationCatalogChangeResult {
    const entry = this.getEntryBySelector(selector);
    if (entry === undefined) {
      return {
        catalog: this,
        status: "not-supported",
      };
    }

    const result = entry.changeValue(nextValue, at);
    return {
      catalog: result.entry === entry ? this : this.replaceEntry(result.entry),
      status: result.status,
    };
  }

  syncValue(
    key: string,
    nextValue: string,
    at: Date,
  ): ConfigurationCatalogSyncResult {
    const entry = this.entriesByKey.get(key);
    if (entry === undefined) {
      throw new Error(`配置项 ${key} 不存在`);
    }

    const result = entry.syncValue(nextValue, at);
    return {
      catalog: result.entry === entry ? this : this.replaceEntry(result.entry),
      changed: result.changed,
    };
  }

  syncValueBySelector(
    selector: ConfigurationEntrySelector,
    nextValue: string,
    at: Date,
  ): ConfigurationCatalogSyncResult {
    const entry = this.getEntryBySelector(selector);
    if (entry === undefined) {
      throw new Error("配置项 selector 不存在");
    }

    const result = entry.syncValue(nextValue, at);
    return {
      catalog: result.entry === entry ? this : this.replaceEntry(result.entry),
      changed: result.changed,
    };
  }

  private replaceEntry(nextEntry: ConfigurationEntry): ConfigurationCatalog {
    const entries = this.listEntries().map((entry) =>
      entry.key === nextEntry.key ? nextEntry : entry
    );

    return new ConfigurationCatalog({
      chargingPointId: this.chargingPointId,
      protocolVersion: this.protocolVersion,
      entries,
    });
  }
}
