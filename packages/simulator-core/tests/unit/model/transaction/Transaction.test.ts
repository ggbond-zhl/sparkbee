import { describe, expect, test } from "vitest";

import {
  Transaction,
  ModelError,
  createConnectorRef,
} from "../../../../src/model/index.ts";

describe("Transaction", () => {
  test("clones dates and resource refs at construction and through getters", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const endedAt = new Date("2026-01-01T01:00:00.000Z");
    const target = createConnectorRef("cp-1", 1, 2);
    const transaction = new Transaction({
      id: "transaction-1",
      target,
      credentialId: "cred-1",
      startedAt,
      endedAt,
      startMeterWh: 100,
      latestMeterWh: 120,
      endMeterWh: 120,
      stopReason: "local",
      state: "ended",
    });

    startedAt.setUTCFullYear(2030);
    endedAt.setUTCFullYear(2030);
    (target as { chargingPointId: string }).chargingPointId = "mutated";

    expect(transaction.startedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(transaction.endedAt?.toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(transaction.target).toEqual({
      scope: "connector",
      chargingPointId: "cp-1",
      evseId: 1,
      connectorId: 2,
    });

    expect(transaction.startedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(transaction.endedAt?.toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(transaction.target.chargingPointId).toBe("cp-1");
  });

  test("rejects invalid meter options", () => {
    expect(() =>
      new Transaction({
        id: "transaction-1",
        target: createConnectorRef("cp-1", 1, 1),
        credentialId: "cred-1",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: -1,
      })
    ).toThrow("startMeterWh");

    expect(() =>
      new Transaction({
        id: "transaction-1",
        target: createConnectorRef("cp-1", 1, 1),
        credentialId: "cred-1",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 100,
        latestMeterWh: 99,
      })
    ).toThrow("latestMeterWh 不能小于 startMeterWh");

    expect(() =>
      new Transaction({
        id: "transaction-1",
        target: createConnectorRef("cp-1", 1, 1),
        credentialId: "cred-1",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 100,
        latestMeterWh: 120,
        endMeterWh: -1,
      })
    ).toThrow("endMeterWh");

    expect(() =>
      new Transaction({
        id: "transaction-1",
        target: createConnectorRef("cp-1", 1, 1),
        credentialId: "cred-1",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 100,
        latestMeterWh: 120,
        endMeterWh: 110,
      })
    ).toThrow("endMeterWh 不能小于 latestMeterWh");

    expect(() =>
      new Transaction({
        id: "transaction-1",
        target: createConnectorRef("cp-1", 1, 1),
        credentialId: "cred-1",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 100,
        latestMeterWh: 120,
        consumedEnergyWh: -1,
      })
    ).toThrow("consumedEnergyWh");

    expect(() =>
      new Transaction({
        id: "transaction-1",
        target: createConnectorRef("cp-1", 1, 1),
        credentialId: "cred-1",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 100,
        latestMeterWh: 120,
        consumedEnergyWh: 25,
      })
    ).toThrow("consumedEnergyWh 必须等于");

    try {
      new Transaction({
        id: "transaction-1",
        target: createConnectorRef("cp-1", 1, 1),
        credentialId: "cred-1",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 100,
        latestMeterWh: 99,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ModelError);
      expect(error).toMatchObject({
        code: "MODEL_INVALID_ARGUMENT",
        message: "latestMeterWh 不能小于 startMeterWh",
      });
    }
  });

  test("transitions through activation, charging, suspension, resume, ending, and end", () => {
    const transaction = new Transaction({
      id: "transaction-1",
      target: createConnectorRef("cp-1", 1, 1),
      credentialId: "cred-1",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      startMeterWh: 100,
    });

    const active = transaction.activate();
    const charging = active.startCharging();
    const metered = charging.recordMeterValue(140);
    const suspended = metered.suspend("station");
    const resumed = suspended.resumeCharging();
    const ending = resumed.startEnding("remote");
    const ended = ending.end(
      "remote",
      new Date("2026-01-01T01:00:00.000Z"),
      180,
    );

    expect(active.state).toBe("active");
    expect(charging.chargingState).toBe("charging");
    expect(metered.consumedEnergyWh).toBe(40);
    expect(suspended.state).toBe("suspended");
    expect(suspended.chargingState).toBe("suspended-by-station");
    expect(resumed.state).toBe("active");
    expect(ending.state).toBe("ending");
    expect(ending.stopReason).toBe("remote");
    expect(ended.state).toBe("ended");
    expect(ended.chargingState).toBe("idle");
    expect(ended.endMeterWh).toBe(180);
    expect(ended.consumedEnergyWh).toBe(80);
    expect(ended.endedAt?.toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });

  test("rejects illegal transitions and meter rollback", () => {
    const transaction = new Transaction({
      id: "transaction-1",
      target: createConnectorRef("cp-1", 1, 1),
      credentialId: "cred-1",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      startMeterWh: 100,
    });

    expect(() => transaction.resumeCharging()).toThrow("只有 suspended 态交易可以恢复");

    const ended = transaction.end(
      "local",
      new Date("2026-01-01T00:10:00.000Z"),
      120,
    );

    expect(() => ended.activate()).toThrow("已结束流程的交易不能重新激活");
    expect(() => ended.end("remote", new Date("2026-01-01T00:20:00.000Z")))
      .toThrow("已结束交易不能重复结束");
    expect(() => ended.recordMeterValue(121)).toThrow("已结束交易不能继续记录电表值");
    expect(() => transaction.recordMeterValue(99)).toThrow("meterWh 不能回退");

    try {
      ended.activate();
    } catch (error) {
      expect(error).toBeInstanceOf(ModelError);
      expect(error).toMatchObject({
        code: "MODEL_STATE_CONFLICT",
        message: "已结束流程的交易不能重新激活",
      });
    }
  });
});
