import { describe, expect, test } from "vitest";

import { Transaction } from "../../../../src/model/index.ts";
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
      "枪口 1 当前不可插枪",
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

  test("unplug ends an active transaction with EVDisconnected before reporting Available", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("Authorize", { idTagInfo: { status: "Accepted" } }),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "unplugged",
        vehiclePresence: "absent",
      }),
    });

    await protocolRuntime.boot();
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
    await protocolRuntime.authorize({ connectorId: 1, idTag: "CARD001" });
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "CARD001",
      meterStartWh: 0,
    });

    await expect(
      protocolRuntime.unplugConnector({ evseId: 1, connectorId: 1 }),
    ).resolves.toMatchObject({
      plugState: "unplugged",
      vehiclePresence: "absent",
      connectorStatus: "available",
    });

    const unplugRequests = session.requests.slice(5);
    expect(unplugRequests.map((request) => request.action)).toEqual([
      "StatusNotification",
      "StopTransaction",
      "StatusNotification",
    ]);
    expect(unplugRequests[0]?.payload).toMatchObject({ status: "Finishing" });
    expect(unplugRequests[1]?.payload).toMatchObject({
      transactionId: 1001,
      meterStop: 0,
      reason: "EVDisconnected",
    });
    expect(unplugRequests[2]?.payload).toMatchObject({ status: "Available" });
  });

  test("unplug ends the local transaction while offline without waiting for CSMS", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("Authorize", { idTagInfo: { status: "Accepted" } }),
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
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
    await protocolRuntime.authorize({ connectorId: 1, idTag: "CARD001" });
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "CARD001",
      meterStartWh: 0,
    });
    session.emitOffline("unexpected_disconnect");

    await expect(
      protocolRuntime.unplugConnector({ evseId: 1, connectorId: 1 }),
    ).resolves.toMatchObject({
      plugState: "unplugged",
      vehiclePresence: "absent",
      connectorStatus: "available",
    });

    expect(start.status).toBe("Accepted");
    if (start.status !== "Accepted") {
      throw new Error("交易启动失败");
    }
    expect(protocolRuntime.getTransactionState(start.transactionId)).toBe("ended");
    expect(session.requests.map((request) => request.action)).not.toContain(
      "StopTransaction",
    );
  });

  test("unplug rejects a transaction that is already ending", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
    });
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
        state: "ending",
        chargingState: "idle",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 0,
        latestMeterWh: 100,
        endedAt: null,
        stopReason: null,
      }),
    );

    await expect(
      protocolRuntime.unplugConnector({ evseId: 1, connectorId: 1 }),
    ).rejects.toThrow("交易正在结束，请稍后拔枪");
    expect(
      protocolRuntime.getRuntimeSnapshot().chargingPoint.evses[0]
        ?.getConnector(1)?.plugState,
    ).toBe("plugged");
  });

  test("unplug treats an already ended transaction as a normal physical disconnect", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
    });
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
        state: "ended",
        chargingState: "idle",
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        startMeterWh: 0,
        latestMeterWh: 100,
        endMeterWh: 100,
        endedAt: new Date("2026-01-01T00:10:00.000Z"),
        stopReason: "local",
      }),
    );

    await expect(
      protocolRuntime.unplugConnector({ evseId: 1, connectorId: 1 }),
    ).resolves.toMatchObject({
      plugState: "unplugged",
      vehiclePresence: "absent",
      connectorStatus: "available",
    });
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
