import { describe, expect, test } from "vitest";

import { ConfigurationCatalog } from "../../../../src/model/index.ts";
import { ProtocolRuntimeError } from "../../../../src/protocol/runtime/index.ts";
import {
  ConfigurationStore,
  configurationDefinitions,
  type ConfigurationDefinition,
  type Ocpp16ConfigurationKey,
  type Ocpp16ConfigurationKeyInput,
} from "../../../../src/protocol/runtime/ocpp16/ConfigurationStore/index.ts";

const STANDARD_CONFIGURATION_KEYS = [
  "AllowOfflineTxForUnknownId",
  "AuthorizationCacheEnabled",
  "AuthorizeRemoteTxRequests",
  "BlinkRepeat",
  "ClockAlignedDataInterval",
  "ConnectionTimeOut",
  "ConnectorPhaseRotation",
  "ConnectorPhaseRotationMaxLength",
  "GetConfigurationMaxKeys",
  "HeartbeatInterval",
  "LightIntensity",
  "LocalAuthorizeOffline",
  "LocalPreAuthorize",
  "MaxEnergyOnInvalidId",
  "MeterValuesAlignedData",
  "MeterValuesAlignedDataMaxLength",
  "MeterValuesSampledData",
  "MeterValuesSampledDataMaxLength",
  "MeterValueSampleInterval",
  "MinimumStatusDuration",
  "NumberOfConnectors",
  "ResetRetries",
  "StopTransactionOnEVSideDisconnect",
  "StopTransactionOnInvalidId",
  "StopTxnAlignedData",
  "StopTxnAlignedDataMaxLength",
  "StopTxnSampledData",
  "StopTxnSampledDataMaxLength",
  "SupportedFeatureProfiles",
  "SupportedFeatureProfilesMaxLength",
  "TransactionMessageAttempts",
  "TransactionMessageRetryInterval",
  "UnlockConnectorOnEVSideDisconnect",
  "WebSocketPingInterval",
  "StopTransactionMaxMeterValues",
  "LocalAuthListEnabled",
  "LocalAuthListMaxLength",
  "SendLocalListMaxLength",
  "ReserveConnectorZeroSupported",
  "ChargeProfileMaxStackLevel",
  "ChargingScheduleAllowedChargingRateUnit",
  "ChargingScheduleMaxPeriods",
  "ConnectorSwitch3to1PhaseSupported",
  "MaxChargingProfilesInstalled",
  "SupportedFileTransferProtocols",
] as const;

const READONLY_KEYS = [
  "ConnectorPhaseRotationMaxLength",
  "GetConfigurationMaxKeys",
  "MeterValuesAlignedDataMaxLength",
  "MeterValuesSampledDataMaxLength",
  "NumberOfConnectors",
  "StopTxnAlignedDataMaxLength",
  "StopTxnSampledDataMaxLength",
  "SupportedFeatureProfiles",
  "SupportedFeatureProfilesMaxLength",
  "StopTransactionMaxMeterValues",
  "LocalAuthListMaxLength",
  "SendLocalListMaxLength",
  "ReserveConnectorZeroSupported",
  "ChargeProfileMaxStackLevel",
  "ChargingScheduleAllowedChargingRateUnit",
  "ChargingScheduleMaxPeriods",
  "ConnectorSwitch3to1PhaseSupported",
  "MaxChargingProfilesInstalled",
  "SupportedFileTransferProtocols",
] as const;

describe("ConfigurationStore", () => {
  test("predefines OCPP16 standard configuration keys with descriptions", () => {
    const definitionsByKey = new Map(
      configurationDefinitions.map((definition) => [definition.key, definition]),
    );

    expect(configurationDefinitions.map((definition) => definition.key)).toEqual(
      [...STANDARD_CONFIGURATION_KEYS],
    );

    for (const key of STANDARD_CONFIGURATION_KEYS) {
      const definition = definitionsByKey.get(key);
      expect(definition).toBeDefined();
      expect(definition?.description.length).toBeGreaterThan(0);
    }

    for (const key of READONLY_KEYS) {
      expect(definitionsByKey.get(key)?.access).toBe("R");
    }

    expect(definitionsByKey.get("AuthorizeRemoteTxRequests")?.access).toBe("R/RW");
    const heartbeatDefinition = definitionsByKey.get(
      "HeartbeatInterval",
    ) as ConfigurationDefinition | undefined;
    expect(heartbeatDefinition?.minValue).toBe(1);
  });

  test("adds required OCPP16 configuration entries", () => {
    const store = new ConfigurationStore("cp-1", {
      chargingPointId: "cp-1",
      protocolVersion: "OCPP16J",
      entries: [
        {
          key: "CustomConfig",
          value: "enabled",
        },
      ],
    });

    const standardKey: Ocpp16ConfigurationKey = "HeartbeatInterval";
    const customKey: Ocpp16ConfigurationKeyInput = "CustomConfig";
    const dynamicCustomKey: string = "CustomConfig";

    expect(store.getValue("CustomConfig")).toBe("enabled");
    expect(store.getValue(customKey)).toBe("enabled");
    expect(store.getEntry(dynamicCustomKey)?.value).toBe("enabled");
    expect(store.getValue(standardKey)).toBe("60");
    expect(store.getValue("WebSocketPingInterval")).toBe("0");
    expect(store.getValue("SupportedFeatureProfiles")).toBe("Core");
    expect(store.getValue("AuthorizationCacheEnabled")).toBe("true");
    expect(store.getValue("LocalAuthorizeOffline")).toBe("true");
    expect(store.getValue("LocalAuthListEnabled")).toBe("true");
    expect(store.getValue("LocalAuthListMaxLength")).toBe("99");
    expect(store.getValue("SendLocalListMaxLength")).toBe("99");
    expect(store.getValue("MeterValuesSampledData")).toBe(
      "Energy.Active.Import.Register,Power.Active.Import,Current.Import,Voltage",
    );
    expect(store.getEntry("NumberOfConnectors")?.isReadonly).toBe(true);
    expect(store.getEntry("AuthorizeRemoteTxRequests")?.isReadonly).toBe(false);
    for (const key of READONLY_KEYS) {
      expect(store.getEntry(key)?.isReadonly).toBe(true);
    }
    expect(store.listEntries().map((entry) => entry.key)).toEqual([
      "CustomConfig",
      ...STANDARD_CONFIGURATION_KEYS,
    ]);
  });

  test("maps changes to OCPP16 statuses but syncs internal facts", () => {
    const store = new ConfigurationStore(
      "cp-1",
      new ConfigurationCatalog({
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "HeartbeatInterval",
            value: "1",
            readonly: true,
            valueType: "integer",
            minValue: 1,
          },
          {
            key: "CustomConfig",
            value: "enabled",
          },
          {
            key: "RebootConfig",
            value: "off",
            rebootRequired: true,
          },
        ],
      }),
    );

    expect(
      store.change("CustomConfig", "disabled", new Date("2026-01-01T00:00:00.000Z")),
    ).toBe("Accepted");
    expect(store.getValue("CustomConfig")).toBe("disabled");

    expect(
      store.change("MissingConfig", "value", new Date("2026-01-01T00:00:00.000Z")),
    ).toBe("NotSupported");

    expect(
      store.change("RebootConfig", "on", new Date("2026-01-01T00:00:00.000Z")),
    ).toBe("RebootRequired");
    expect(store.getValue("RebootConfig")).toBe("on");

    const changed = store.change(
      "HeartbeatInterval",
      "30",
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(changed).toBe("Rejected");
    expect(store.getValue("HeartbeatInterval")).toBe("1");

    store.sync(
      "HeartbeatInterval",
      "30",
      new Date("2026-01-01T00:01:00.000Z"),
    );

    expect(store.getValue("HeartbeatInterval")).toBe("30");
  });

  test("rejects mismatched or invalid OCPP16 catalogs", () => {
    expect(() =>
      new ConfigurationStore("cp-1", {
        chargingPointId: "cp-2",
        protocolVersion: "OCPP16J",
      })
    ).toThrow(ProtocolRuntimeError);

    expect(() =>
      new ConfigurationStore("cp-1", {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP201",
      })
    ).toThrow(ProtocolRuntimeError);

    expect(() =>
      new ConfigurationStore("cp-1", {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "HeartbeatInterval",
            value: "0",
            valueType: "string",
            minValue: 0,
          },
        ],
      })
    ).toThrow(ProtocolRuntimeError);
  });
});
