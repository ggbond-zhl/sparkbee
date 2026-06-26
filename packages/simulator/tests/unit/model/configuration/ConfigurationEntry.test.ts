import { describe, expect, test } from "vitest";

import { ConfigurationEntry } from "../../../../src/model/index.ts";

describe("ConfigurationEntry", () => {
  test("normalizes boolean and integer values and matches selectors", () => {
    const entry = new ConfigurationEntry({
      selector: {
        component: {
          name: "TxCtrlr",
          evseId: 1,
        },
        variable: {
          name: "Enabled",
        },
      },
      value: " TRUE ",
      valueType: "boolean",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(entry.key).toBe("component(name=TxCtrlr,evse=1)/variable(name=Enabled)/attribute(Actual)");
    expect(entry.value).toBe("true");
    expect(entry.matchesSelector({
      component: {
        name: "TxCtrlr",
        evseId: 1,
      },
      variable: {
        name: "Enabled",
      },
    })).toBe(true);
  });

  test("rejects invalid selectors and out-of-range integer values", () => {
    expect(() =>
      new ConfigurationEntry({
        selector: {
          component: {
            name: "TxCtrlr",
          },
        },
        value: "1",
      })
    ).toThrow("结构化 selector 必须同时包含 component 与 variable");

    expect(() =>
      new ConfigurationEntry({
        selector: {
          component: {
            name: "TxCtrlr",
            connectorId: 1,
          },
          variable: {
            name: "Enabled",
          },
        },
        value: "1",
      })
    ).toThrow("connectorId 存在时必须同时指定 evseId");

    expect(() =>
      new ConfigurationEntry({
        key: "HeartbeatInterval",
        value: "0",
        valueType: "integer",
        minValue: 1,
      })
    ).toThrow("不能小于 1");
  });

  test("respects readonly changes but still allows syncValue", () => {
    const readonlyEntry = new ConfigurationEntry({
      key: "HeartbeatInterval",
      value: "60",
      readonly: true,
      valueType: "integer",
    });

    const rejected = readonlyEntry.changeValue("30", new Date("2026-01-01T00:00:00.000Z"));
    const synced = readonlyEntry.syncValue("30", new Date("2026-01-01T00:01:00.000Z"));

    expect(rejected.status).toBe("rejected");
    expect(rejected.entry).toBe(readonlyEntry);
    expect(synced.changed).toBe(true);
    expect(synced.entry.value).toBe("30");
  });

  test("returns defensive copies for selectors and dates", () => {
    const entry = new ConfigurationEntry({
      key: "HeartbeatInterval",
      value: "60",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const selector = entry.selector;
    selector.key = "Changed";
    entry.updatedAt?.setUTCFullYear(2030);

    expect(entry.selector.key).toBe("HeartbeatInterval");
    expect(entry.updatedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
