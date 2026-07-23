import { describe, expect, test } from "vitest";

import type { ProtocolConfigurationItem } from "@spark-bee/contracts";

import {
  filterProtocolConfigurationItems,
  type ProtocolConfigurationFilter,
} from "../../src/features/charging-points/model/protocolConfiguration";

const items = [
  configurationItem({ key: "HeartbeatInterval", description: "心跳间隔" }),
  configurationItem({ key: "NumberOfConnectors", readonly: true }),
  configurationItem({ key: "WebSocketPingInterval", pendingRestart: true }),
];

describe("protocol configuration filtering", () => {
  test.each([
    ["全部", "", "all", 3],
    ["按键名搜索", "heartbeat", "all", 1],
    ["按说明搜索", "心跳", "all", 1],
    ["可写", "", "writable", 2],
    ["只读", "", "readonly", 1],
    ["待重启", "", "pending-restart", 1],
  ] satisfies Array<[string, string, ProtocolConfigurationFilter, number]>) (
    "%s",
    (_label, keyword, filter, count) => {
      expect(filterProtocolConfigurationItems(items, keyword, filter)).toHaveLength(count);
    },
  );
});

function configurationItem(
  overrides: Partial<ProtocolConfigurationItem>,
): ProtocolConfigurationItem {
  return {
    key: "MeterValueSampleInterval",
    value: "60",
    defaultValue: "60",
    readonly: false,
    valueType: "integer",
    rebootRequired: false,
    minValue: 0,
    maxValue: null,
    description: "采样间隔",
    version: 1,
    pendingRestart: false,
    lastModifiedBy: "initialization",
    updatedAt: "2026-07-22T08:00:00.000Z",
    ...overrides,
  };
}
