import { describe, expect, test } from "vitest";

import { ConfigurationCatalog } from "../../../../src/model/index.ts";

describe("ConfigurationCatalog", () => {
  test("creates stable ids and rejects duplicate entries", () => {
    expect(ConfigurationCatalog.createId("cp-1", "OCPP16J")).toBe("OCPP16J:cp-1");

    expect(() =>
      new ConfigurationCatalog({
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "HeartbeatInterval",
            value: "60",
          },
          {
            key: "HeartbeatInterval",
            value: "30",
          },
        ],
      })
    ).toThrow("配置项 HeartbeatInterval 已存在");
  });

  test("changes and syncs values through keys and selectors", () => {
    const catalog = new ConfigurationCatalog({
      chargingPointId: "cp-1",
      protocolVersion: "OCPP201",
      entries: [
        {
          key: "HeartbeatInterval",
          value: "60",
          valueType: "integer",
        },
        {
          selector: {
            component: {
              name: "TxCtrlr",
            },
            variable: {
              name: "Enabled",
            },
          },
          value: "true",
          valueType: "boolean",
        },
      ],
    });

    const changedByKey = catalog.changeValue(
      "HeartbeatInterval",
      "30",
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const changedBySelector = changedByKey.catalog.changeValueBySelector(
      {
        component: {
          name: "TxCtrlr",
        },
        variable: {
          name: "Enabled",
        },
      },
      "false",
      new Date("2026-01-01T00:01:00.000Z"),
    );
    const synced = changedBySelector.catalog.syncValue(
      "HeartbeatInterval",
      "45",
      new Date("2026-01-01T00:02:00.000Z"),
    );

    expect(changedByKey.status).toBe("accepted");
    expect(changedByKey.catalog.getEntry("HeartbeatInterval")?.value).toBe("30");
    expect(changedBySelector.status).toBe("accepted");
    expect(
      changedBySelector.catalog.getEntryBySelector({
        component: {
          name: "TxCtrlr",
        },
        variable: {
          name: "Enabled",
        },
      })?.value,
    ).toBe("false");
    expect(synced.changed).toBe(true);
    expect(synced.catalog.getEntry("HeartbeatInterval")?.value).toBe("45");
  });

  test("returns not-supported or throws for missing entries as appropriate", () => {
    const catalog = new ConfigurationCatalog({
      chargingPointId: "cp-1",
      protocolVersion: "OCPP16J",
      entries: [
        {
          key: "HeartbeatInterval",
          value: "60",
        },
      ],
    });

    expect(
      catalog.changeValue("Missing", "1", new Date("2026-01-01T00:00:00.000Z")).status,
    ).toBe("not-supported");

    expect(() =>
      catalog.syncValue("Missing", "1", new Date("2026-01-01T00:00:00.000Z"))
    ).toThrow("配置项 Missing 不存在");
  });

  test("returns defensive copies from entries", () => {
    const catalog = new ConfigurationCatalog({
      chargingPointId: "cp-1",
      protocolVersion: "OCPP16J",
      entries: [
        {
          key: "HeartbeatInterval",
          value: "60",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    const entries = catalog.listEntries();
    entries[0] = new ConfigurationCatalog({
      chargingPointId: "cp-2",
      protocolVersion: "OCPP16J",
      entries: [{ key: "Changed", value: "1" }],
    }).getEntry("Changed")!;
    catalog.getEntry("HeartbeatInterval")?.updatedAt?.setUTCFullYear(2030);

    expect(catalog.getEntry("HeartbeatInterval")?.key).toBe("HeartbeatInterval");
    expect(catalog.getEntry("HeartbeatInterval")?.updatedAt?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});
