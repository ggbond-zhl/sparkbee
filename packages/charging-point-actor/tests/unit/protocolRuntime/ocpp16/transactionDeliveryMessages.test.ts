import { describe, expect, expectTypeOf, test } from "vitest";

import { MemoryTransactionDeliveryStore } from "../../../../src/protocol/runtime/ocpp16/MemoryTransactionDeliveryStore.ts";

describe("交易交付消息 interface", () => {
  const transaction = {
    transactionId: "tx-1",
    evseId: 1,
    connectorId: 1,
    idTag: "tag-1",
    state: "active" as const,
    chargingState: "charging" as const,
    meterStartWh: 100,
    latestMeterWh: 100,
    startedAt: new Date("2026-07-27T00:00:00.000Z"),
  };

  test("开始交付记录暴露类型化 payload", async () => {
    const store = new MemoryTransactionDeliveryStore();
    const record = await store.start({
      transaction,
      messageId: "message-1",
      payload: {
        evseId: 1,
        connectorId: 1,
        idTag: "tag-1",
        meterStartWh: 100,
      },
    });

    expect(record.messageType).toBe("start");
    if (record.messageType === "start") {
      expectTypeOf(record.payload.connectorId).toEqualTypeOf<number>();
      expectTypeOf(record.payload.idTag).toEqualTypeOf<string>();
      expect(record.payload.connectorId).toBe(1);
    }
  });

  test("采样交付记录暴露电气量 payload", async () => {
    const store = new MemoryTransactionDeliveryStore();
    await store.start({
      transaction,
      messageId: "message-start",
      payload: {
        evseId: 1,
        connectorId: 1,
        idTag: "tag-1",
        meterStartWh: 100,
      },
    });

    const record = await store.recordSample({
      sampleId: "sample-1",
      transactionId: "tx-1",
      sampledAt: new Date("2026-07-27T00:01:00.000Z"),
      meterWh: 120,
      powerW: 7000,
      currentA: 32,
      voltageV: 230,
      messageId: "message-meter",
      payload: {
        connectorId: 1,
        meterWh: 120,
        powerW: 7000,
        currentA: 32,
        voltageV: 230,
      },
    });

    expect(record.messageType).toBe("meter_value");
    if (record.messageType === "meter_value") {
      expectTypeOf(record.payload.powerW).toEqualTypeOf<number>();
      expectTypeOf(record.payload.voltageV).toEqualTypeOf<number>();
      expect(record.payload.meterWh).toBe(120);
    }
  });

  test("停止交付记录暴露完整收尾 payload", async () => {
    const store = new MemoryTransactionDeliveryStore();
    await store.start({
      transaction,
      messageId: "message-start",
      payload: {
        evseId: 1,
        connectorId: 1,
        idTag: "tag-1",
        meterStartWh: 100,
      },
    });

    const record = await store.end({
      transactionId: "tx-1",
      stoppedAt: new Date("2026-07-27T00:02:00.000Z"),
      meterStopWh: 140,
      messageId: "message-stop",
      payload: {
        evseId: 1,
        connectorId: 1,
        meterStopWh: 140,
        reason: "EVDisconnected",
        idTag: "tag-1",
        authorizationIdTag: "tag-1",
      },
    });

    expect(record.messageType).toBe("stop");
    if (record.messageType === "stop") {
      expectTypeOf(record.payload.reason).toEqualTypeOf<string | null>();
      expectTypeOf(record.payload.authorizationIdTag).toEqualTypeOf<string | null>();
      expect(record.payload.meterStopWh).toBe(140);
    }
  });
});
