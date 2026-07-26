import { ProtocolRuntimeError } from "./errors";
import type {
  ConfigurationStore,
  Ocpp16ConfigurationKeyInput,
} from "./ConfigurationStore";

export class Ocpp16ConfigurationFacts {
  constructor(private readonly configurationStore: ConfigurationStore) {}

  isAuthorizationCacheEnabled(): boolean {
    return this.isEnabled("AuthorizationCacheEnabled");
  }

  isAuthorizeRemoteTxRequestsEnabled(): boolean {
    return this.isEnabled("AuthorizeRemoteTxRequests");
  }

  isLocalAuthListEnabled(): boolean {
    return this.isEnabled("LocalAuthListEnabled");
  }

  isLocalAuthorizeOfflineEnabled(): boolean {
    return this.isEnabled("LocalAuthorizeOffline");
  }

  isLocalPreAuthorizeEnabled(): boolean {
    return this.isEnabled("LocalPreAuthorize");
  }

  isOfflineTxForUnknownIdAllowed(): boolean {
    return this.isEnabled("AllowOfflineTxForUnknownId");
  }

  shouldStopTransactionOnInvalidId(): boolean {
    return this.isEnabled("StopTransactionOnInvalidId");
  }

  supportsLocalAuthorizationList(): boolean {
    return this.isLocalAuthListEnabled() &&
      this.readPositiveIntegerConfig("LocalAuthListMaxLength") !== null;
  }

  getHeartbeatIntervalSec(): number {
    const value = this.configurationStore.getValue("HeartbeatInterval");
    if (value === undefined) {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        "HeartbeatInterval 配置不存在",
      );
    }

    const intervalSec = Number(value);
    if (!Number.isSafeInteger(intervalSec) || intervalSec <= 0) {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        "HeartbeatInterval 尚未初始化",
      );
    }

    return intervalSec;
  }

  getMeterValueSampleIntervalSec(): number {
    const value = this.configurationStore.getValue("MeterValueSampleInterval");
    if (value === undefined) {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        "MeterValueSampleInterval 配置不存在",
      );
    }

    const intervalSec = Number(value);
    if (!Number.isSafeInteger(intervalSec) || intervalSec < 0) {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        "MeterValueSampleInterval 配置非法",
      );
    }

    return intervalSec;
  }

  getConfigurationMaxKeys(): number {
    return this.readPositiveIntegerConfig("GetConfigurationMaxKeys") ?? 0;
  }

  readPositiveIntegerConfig(key: Ocpp16ConfigurationKeyInput): number | null {
    const value = this.configurationStore.getValue(key);
    if (value === undefined) {
      return null;
    }

    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  readNonNegativeIntegerConfig(key: Ocpp16ConfigurationKeyInput): number | null {
    const value = this.configurationStore.getValue(key);
    if (value === undefined || !/^\d+$/.test(value.trim())) {
      return null;
    }

    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  private isEnabled(key: Ocpp16ConfigurationKeyInput): boolean {
    return this.configurationStore.getValue(key) === "true";
  }
}
