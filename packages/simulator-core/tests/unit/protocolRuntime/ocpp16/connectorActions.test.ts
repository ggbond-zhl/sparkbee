import { describe, expect, test } from "vitest";

import { Transaction } from "../../../../src/index.ts";
import {
  bootAccepted,
  createChargingPoint,
  createProtocolRuntime,
  response,
  runtimeContext,
} from "./helpers";

describe("Ocpp16Runtime connector actions", () => {
  test("reports Preparing StatusNotification after plug-in", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "unplugged",
        vehiclePresence: "absent",
      }),
    });

    await protocolRuntime.boot();
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);
    expect(session.requests[1]?.payload).toMatchObject({
      connectorId: 1,
      errorCode: "NoError",
      status: "Preparing",
    });
  });

  test("plug updates connector physical state and keeps transaction startable", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("Authorize", {
        idTagInfo: { status: "Accepted" },
      }),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "unplugged",
        vehiclePresence: "absent",
      }),
    });

    await protocolRuntime.boot();
    const plugResult = await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
    await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "CARD001",
    });
    const startResult = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "CARD001",
      meterStartWh: 0,
    });

    expect(plugResult).toEqual({
      evseId: 1,
      connectorId: 1,
      ocppConnectorId: 1,
      plugState: "plugged",
      vehiclePresence: "detected",
      connectorStatus: "occupied",
    });
    expect(startResult.status).toBe("Accepted");
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "Authorize",
      "StartTransaction",
      "StatusNotification",
    ]);
  });

  test("plug updates local physical state before BootNotification is accepted", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([], {
      chargingPoint: createChargingPoint({
        plugState: "unplugged",
        vehiclePresence: "absent",
      }),
    });

    await expect(
      protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 }),
    ).resolves.toMatchObject({
      plugState: "plugged",
      vehiclePresence: "detected",
      connectorStatus: "occupied",
    });
    expect(session.requests).toEqual([]);
  });

  test.each([
    ["occupied", { plugState: "plugged", vehiclePresence: "detected" }],
    ["unavailable", { availability: "inoperative" }],
    ["faulted", { activeFaultIds: ["fault-1"], faultCode: "GroundFailure" }],
  ] as const)("plug rejects %s connector", async (_status, connector) => {
    const { protocolRuntime } = createProtocolRuntime([bootAccepted()], {
      chargingPoint: createChargingPoint(connector),
    });

    await protocolRuntime.boot();

    await expect(
      protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 }),
    ).rejects.toThrow(
      "枪口 1/1 当前不可插枪",
    );
  });

  test("plug rejects active transaction on connector", async () => {
    const { protocolRuntime } = createProtocolRuntime([bootAccepted()], {
      chargingPoint: createChargingPoint({
        plugState: "unplugged",
        vehiclePresence: "absent",
      }),
    });
    await protocolRuntime.boot();
    runtimeContext(protocolRuntime).transactions.set(
      "transaction-1",
      new Transaction({
        id: "transaction-1",
        target: {
          scope: "connector",
          chargingPointId: "cp-1",
          evseId: 1,
          connectorId: 1,
        },
        credentialId: "CARD001",
        state: "active",
        chargingState: "charging",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 0,
        latestMeterWh: 0,
        endedAt: null,
        stopReason: null,
      }),
    );

    await expect(
      protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 }),
    ).rejects.toThrow(
      "枪口存在未结束交易，不能插枪",
    );
  });

  test("unplug rejects active transaction", async () => {
    const { protocolRuntime } = createProtocolRuntime([]);
    runtimeContext(protocolRuntime).transactions.set(
      "transaction-1",
      new Transaction({
        id: "transaction-1",
        target: {
          scope: "connector",
          chargingPointId: "cp-1",
          evseId: 1,
          connectorId: 1,
        },
        credentialId: "CARD001",
        state: "active",
        chargingState: "charging",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 0,
        latestMeterWh: 0,
        endedAt: null,
        stopReason: null,
      }),
    );

    await expect(
      protocolRuntime.unplugConnector({ evseId: 1, connectorId: 1 }),
    ).rejects.toThrow(
      "枪口存在活跃交易，拔枪前需要先停止交易",
    );
  });

  test("unplug returns available connector state when there is no active transaction", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
    });

    await expect(
      protocolRuntime.unplugConnector({ evseId: 1, connectorId: 1 }),
    ).resolves.toEqual({
      evseId: 1,
      connectorId: 1,
      ocppConnectorId: 1,
      plugState: "unplugged",
      vehiclePresence: "absent",
      connectorStatus: "available",
    });
  });
});
