import { afterEach, describe, expect, vi, test } from "vitest";

import {
  AuthorizationGrant,
  ChargingPoint,
  ConfigurationCatalog,
  Transaction,
  Connector,
  EVSE,
} from "../../../../src/model/index.ts";
import {
  SessionError,
  type OutboundRequestResult,
} from "../../../../src/protocol/session/types.ts";
import { createDeferred } from "../../../../src/shared/deferred.ts";
import {
  Ocpp16Runtime,
  ProtocolRuntimeError,
  type Ocpp16HeartbeatResult,
  type Ocpp16RuntimeDiagnostic,
  type Ocpp16RuntimeOptions,
  type Ocpp16RuntimeEvent,
} from "../../../../src/protocol/runtime/index.ts";
import {
  FakeInboundRequest,
  FakeSession,
  boot,
  bootAccepted,
  createChargingPoint,
  createProtocolRuntime,
  error,
  getAuthorizationGrant,
  getChargingPointAvailability,
  getChargingPointStatus,
  getConfigurationEntry,
  getConfigurationValue,
  getConnectorFact,
  getRuntimeTransaction,
  listAuthorizationGrants,
  listRuntimeEvses,
  listRuntimeTransactions,
  rejected,
  response,
  runtimeContext,
  runtimeState,
} from "./helpers";

function seedAcceptedAuthorization(
  protocolRuntime: Ocpp16Runtime,
  input: {
    idTag?: string;
    evseId?: number;
    validUntil?: Date | null;
  } = {},
): void {
  const idTag = input.idTag ?? "TAG-1";
  const evseId = input.evseId ?? 1;
  runtimeContext(protocolRuntime).authorizationGrants.set(
    `${idTag}\u0000${evseId}`,
    new AuthorizationGrant({
      credentialId: idTag,
      status: "accepted",
      validUntil: input.validUntil ?? null,
      allowedEvseIds: [evseId],
      source: "online",
      lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  );
}

async function plugConnector(protocolRuntime: Ocpp16Runtime): Promise<void> {
  await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
}

function collectRuntimeEvents(
  protocolRuntime: Ocpp16Runtime,
): Ocpp16RuntimeEvent[] {
  const events: Ocpp16RuntimeEvent[] = [];
  protocolRuntime.on("runtimeEvent", (event) => {
    events.push(event);
  });

  return events;
}

function localAuthorizationListConfiguration(input: {
  localMaxLength?: number;
  sendMaxLength?: number;
  localAuthorizeOffline?: boolean;
  allowOfflineUnknownId?: boolean;
  localPreAuthorize?: boolean;
  authorizationCacheEnabled?: boolean;
} = {}): Ocpp16RuntimeOptions["configurationCatalog"] {
  return {
    chargingPointId: "cp-1",
    protocolVersion: "OCPP16J",
    entries: [
      {
        key: "LocalAuthListEnabled",
        value: "true",
        valueType: "boolean",
      },
      {
        key: "LocalAuthListMaxLength",
        value: String(input.localMaxLength ?? 3),
        valueType: "integer",
        minValue: 0,
        readonly: true,
      },
      {
        key: "SendLocalListMaxLength",
        value: String(input.sendMaxLength ?? 3),
        valueType: "integer",
        minValue: 0,
        readonly: true,
      },
      {
        key: "LocalAuthorizeOffline",
        value: String(input.localAuthorizeOffline ?? false),
        valueType: "boolean",
      },
      {
        key: "AllowOfflineTxForUnknownId",
        value: String(input.allowOfflineUnknownId ?? false),
        valueType: "boolean",
      },
      {
        key: "LocalPreAuthorize",
        value: String(input.localPreAuthorize ?? false),
        valueType: "boolean",
      },
      {
        key: "AuthorizationCacheEnabled",
        value: String(input.authorizationCacheEnabled ?? false),
        valueType: "boolean",
      },
    ],
  };
}

function localAuthorizeOfflineDisabledConfiguration(): Ocpp16RuntimeOptions["configurationCatalog"] {
  return {
    chargingPointId: "cp-1",
    protocolVersion: "OCPP16J",
    entries: [
      {
        key: "LocalAuthorizeOffline",
        value: "false",
        valueType: "boolean",
      },
    ],
  };
}

function localAuthorizationListUnsupportedConfiguration(): Ocpp16RuntimeOptions["configurationCatalog"] {
  return {
    chargingPointId: "cp-1",
    protocolVersion: "OCPP16J",
    entries: [
      {
        key: "LocalAuthListEnabled",
        value: "false",
        valueType: "boolean",
      },
    ],
  };
}

describe("Ocpp16Runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("boot and status reporting", () => {
  test("records accepted boot fields and reports connector status", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ]);

    const result = await protocolRuntime.boot();
    await protocolRuntime.reportConnectorStatus({ connectorId: 1 });

    expect(result).toEqual({
      status: "Accepted",
      currentTime: new Date("2026-01-01T00:00:00.000Z"),
      interval: 30,
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);
    expect(session.requests[1]?.payload).toMatchObject({
      connectorId: 1,
      status: "Available",
      errorCode: "NoError",
    });

    expect(getChargingPointAvailability(protocolRuntime)).toBe("operative");
    expect(getConfigurationEntry(protocolRuntime, "HeartbeatInterval")?.value)
      .toBe("30");
  });

  test("syncs protocol clock from accepted boot currentTime", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      response("BootNotification", {
        status: "Accepted",
        currentTime: "2026-01-01T00:00:02.000Z",
        interval: 30,
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    await protocolRuntime.reportChargingPointStatus();

    expect(session.requests[1]?.payload).toMatchObject({
      timestamp: "2026-01-01T00:00:02.000Z",
    });
  });

  test("uses first boot currentTime as protocol clock anchor", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      response("BootNotification", {
        status: "Accepted",
        currentTime: "2026-01-01T00:10:00.000Z",
        interval: 30,
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    await protocolRuntime.reportChargingPointStatus();

    expect(session.requests[1]?.payload).toMatchObject({
      timestamp: "2026-01-01T00:10:00.000Z",
    });
  });

  test("does not sync protocol clock from drifted boot currentTime", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("BootNotification", {
        status: "Accepted",
        currentTime: "2026-01-01T00:06:00.001Z",
        interval: 30,
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    await boot(protocolRuntime);
    await protocolRuntime.reportChargingPointStatus();

    expect(session.requests[2]?.payload).toMatchObject({
      timestamp: "2026-01-01T00:00:00.000Z",
    });
  });

  test("projects EVSE reservation as OCPP16 Reserved connector status", async () => {
    const chargingPoint = createChargingPoint().updateEvse(1, (evse) =>
      evse.reserve("reservation-1", new Date("2026-01-01T00:00:00.000Z"))
    );
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ], {
      chargingPoint,
    });

    await boot(protocolRuntime);
    await protocolRuntime.reportConnectorStatus({ connectorId: 1 });

    expect(session.requests[1]?.payload).toMatchObject({
      connectorId: 1,
      status: "Reserved",
    });
    const [evse] = listRuntimeEvses(protocolRuntime);
    const [connector] = evse?.listConnectors() ?? [];
    expect(evse?.status).toBe("reserved");
    expect(connector?.status).toBe("available");
  });

  test("rejects duplicate connector ids across EVSEs", () => {
    const chargingPoint = createMultiEvseChargingPoint([
      { evseId: 1, connectorId: 1 },
      { evseId: 2, connectorId: 1 },
    ]);
    let thrown: unknown;

    try {
      createProtocolRuntime([], { chargingPoint });
    } catch (cause) {
      thrown = cause;
    }

    expect(thrown).toBeInstanceOf(ProtocolRuntimeError);
    expect(thrown).toMatchObject({
      code: "PROTOCOL_RUNTIME_INVALID_OPERATION",
      message: "OCPP 1.6 connectorId 1 在 EVSE 1 与 EVSE 2 中重复",
    });
  });

  test("rejects OCPP16 EVSE without a connector", () => {
    const chargingPoint = new ChargingPoint({
      id: "cp-1",
      vendor: "Volt",
      model: "Sim",
      evses: [
        new EVSE({
          id: 1,
          connectors: [],
        }),
      ],
    });
    let thrown: unknown;

    try {
      createProtocolRuntime([], { chargingPoint });
    } catch (cause) {
      thrown = cause;
    }

    expect(thrown).toBeInstanceOf(ProtocolRuntimeError);
    expect(thrown).toMatchObject({
      code: "PROTOCOL_RUNTIME_INVALID_OPERATION",
      message: "OCPP 1.6 EVSE 1 必须有且仅有一个 Connector，当前为 0 个",
    });
  });

  test("rejects OCPP16 EVSE with multiple connectors", () => {
    const chargingPoint = new ChargingPoint({
      id: "cp-1",
      vendor: "Volt",
      model: "Sim",
      evses: [
        new EVSE({
          id: 1,
          connectors: [
            new Connector({
              id: 1,
              type: "GBT",
              format: "socket",
              powerType: "ac",
            }),
            new Connector({
              id: 2,
              type: "GBT",
              format: "socket",
              powerType: "ac",
            }),
          ],
        }),
      ],
    });
    let thrown: unknown;

    try {
      createProtocolRuntime([], { chargingPoint });
    } catch (cause) {
      thrown = cause;
    }

    expect(thrown).toBeInstanceOf(ProtocolRuntimeError);
    expect(thrown).toMatchObject({
      code: "PROTOCOL_RUNTIME_INVALID_OPERATION",
      message: "OCPP 1.6 EVSE 1 必须有且仅有一个 Connector，当前为 2 个",
    });
  });

  test("reports connector status by direct OCPP connector id", async () => {
    const chargingPoint = createMultiEvseChargingPoint([
      { evseId: 1, connectorId: 2 },
      { evseId: 2, connectorId: 1 },
    ]);
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ], {
      chargingPoint,
    });

    await boot(protocolRuntime);
    const result = await protocolRuntime.reportConnectorStatus({ connectorId: 1 });

    expect(result.connectorId).toBe(1);
    expect(session.requests
      .filter((request) => request.action === "StatusNotification")
      .map((request) => (request.payload as { connectorId: number }).connectorId)
    ).toEqual([1]);
    expect(
      getConfigurationValue(protocolRuntime, "NumberOfConnectors"),
    ).toBe("2");
  });

  test("syncs accepted BootNotification interval into HeartbeatInterval configuration", async () => {
    const { protocolRuntime } = createProtocolRuntime([bootAccepted()]);

    const result = await protocolRuntime.boot();

    expect(result.interval).toBe(30);
    expect(getConfigurationEntry(protocolRuntime, "HeartbeatInterval")?.value)
      .toBe("30");
  });

  test("keeps pending BootNotification interval as return value only", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      response("BootNotification", {
        status: "Pending",
        currentTime: "2026-01-01T00:00:00.000Z",
        interval: 45,
      }),
    ]);

    const result = await protocolRuntime.boot();
    const state = runtimeState(protocolRuntime);

    expect(result.status).toBe("Pending");
    expect(result.interval).toBe(45);
    expect(state.configurationStore.getEntry("HeartbeatInterval")?.value).toBe("60");
  });

  test("does not treat operative availability as protocol registration", async () => {
    const chargingPoint = createChargingPoint().markOperative(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const { protocolRuntime, session } = createProtocolRuntime([], {
      chargingPoint,
      configurationCatalog: new ConfigurationCatalog({
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "HeartbeatInterval",
            value: "30",
            valueType: "integer",
            minValue: 0,
          },
        ],
      }),
    });

    await expect(
      protocolRuntime.reportConnectorStatus({ connectorId: 1 }),
    ).rejects.toMatchObject({
      code: "PROTOCOL_RUNTIME_NOT_REGISTERED",
      message: "BootNotification 未 Accepted，不能上报状态",
    });
    expect(session.requests).toEqual([]);
  });

  test("adds default HeartbeatInterval to custom OCPP16 configuration catalog", () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: new ConfigurationCatalog({
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "CustomConfig",
            value: "enabled",
          },
        ],
      }),
    });

    expect(getConfigurationEntry(protocolRuntime, "CustomConfig")?.value)
      .toBe("enabled");
    expect(getConfigurationEntry(protocolRuntime, "HeartbeatInterval")?.value)
      .toBe("60");
  });

  test("rejects OCPP16 configuration catalog for another charging point", () => {
    expect(() =>
      createProtocolRuntime([], {
        configurationCatalog: new ConfigurationCatalog({
          chargingPointId: "cp-2",
          protocolVersion: "OCPP16J",
          entries: [],
        }),
      })
    ).toThrow(ProtocolRuntimeError);
  });

  test("rejects non-OCPP16 configuration catalog", () => {
    expect(() =>
      createProtocolRuntime([], {
        configurationCatalog: new ConfigurationCatalog({
          chargingPointId: "cp-1",
          protocolVersion: "OCPP201",
          entries: [],
        }),
      })
    ).toThrow(ProtocolRuntimeError);
  });

  test("rejects invalid HeartbeatInterval configuration entry", () => {
    const invalidEntries = [
      {
        key: "HeartbeatInterval",
        value: "0",
        valueType: "string",
        minValue: 0,
      },
      {
        key: "HeartbeatInterval",
        value: "0",
        valueType: "integer",
      },
      {
        key: "HeartbeatInterval",
        value: "1",
        valueType: "integer",
        minValue: 1,
      },
    ] as const;

    for (const entry of invalidEntries) {
      expect(() =>
        createProtocolRuntime([], {
          configurationCatalog: new ConfigurationCatalog({
            chargingPointId: "cp-1",
            protocolVersion: "OCPP16J",
            entries: [entry],
          }),
        })
      ).toThrow(ProtocolRuntimeError);
    }
  });

  test("reports only charging point status when requested", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ]);

    await protocolRuntime.boot();
    const result = await protocolRuntime.reportChargingPointStatus();

    expect(result).toMatchObject({
      outcome: "Accepted",
      connectorId: 0,
      connectorStatus: "Available",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);
    expect(session.requests[1]?.payload).toMatchObject({
      connectorId: 0,
      status: "Available",
      errorCode: "NoError",
    });

    expect(getChargingPointStatus(protocolRuntime)).toBe("available");
  });

  test("rejects connectorId 0 for connector status reports", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ]);

    await protocolRuntime.boot();

    await expect(
      protocolRuntime.reportConnectorStatus({ connectorId: 0 }),
    ).rejects.toMatchObject({
      code: "PROTOCOL_RUNTIME_INVALID_OPERATION",
      message: "connectorId=0 不能用于枪口状态上报",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("records successful StatusNotification reports and unexpected response fields", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", { status: "Accepted" }),
    ]);

    await boot(protocolRuntime);
    const result = await protocolRuntime.reportConnectorStatus({ connectorId: 1 });

    expect(result).toMatchObject({
      outcome: "Accepted",
      connectorId: 1,
      connectorStatus: "Available",
      unexpectedResponseFields: ["status"],
      consecutiveFailures: 0,
      platformCommunicationStatus: "online",
      shouldReconnect: false,
    });
  });

  test("returns stateless StatusNotification failures", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      error("StatusNotification", "status rejected"),
      error("StatusNotification", "status rejected"),
      error("StatusNotification", "status rejected"),
    ]);

    await boot(protocolRuntime);
    const first = await protocolRuntime.reportChargingPointStatus();
    const second = await protocolRuntime.reportChargingPointStatus();
    const third = await protocolRuntime.reportChargingPointStatus();

    expect(first).toMatchObject({
      outcome: "Failed",
      errorCode: "InternalError",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(second).toMatchObject({
      outcome: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(third).toMatchObject({
      outcome: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
  });

  test("continues sending StatusNotification after session offline", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      bootAccepted(),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    session.emitOffline("unexpected_disconnect");
    const offlineResult = await protocolRuntime.reportChargingPointStatus();

    expect(offlineResult).toMatchObject({
      outcome: "Accepted",
      connectorId: 0,
      connectorStatus: "Available",
      shouldReconnect: false,
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);

    await boot(protocolRuntime);
    const reported = await protocolRuntime.reportChargingPointStatus();

    expect(reported).toMatchObject({
      outcome: "Accepted",
      connectorId: 0,
      connectorStatus: "Available",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "BootNotification",
      "StatusNotification",
    ]);
  });

  });

  describe("local transaction delivery", () => {
  test("runs the basic local charging happy path in protocol order", async () => {
    const diagnostics: Ocpp16RuntimeDiagnostic[] = [];
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", { currentTime: "2026-01-01T00:00:01.000Z" }),
      response("Authorize", {
        idTagInfo: {
          status: "Accepted",
          expiryDate: "2026-06-01T00:00:00.000Z",
          parentIdTag: "GROUP-1",
        },
      }),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ], { diagnostics });

    await boot(protocolRuntime);
    await protocolRuntime.sendHeartbeat();
    const authorization = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-1",
    });
    expect(authorization).toMatchObject({
      outcome: "Accepted",
      idTag: "TAG-1",
      authorizationStatus: "Accepted",
      expiryDate: new Date("2026-06-01T00:00:00.000Z"),
      parentIdTag: "GROUP-1",
    });
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    expect(start).toMatchObject({
      status: "Accepted",
      transactionId: "1001",
      ocppTransactionId: 1001,
      startTransactionResult: {
        outcome: "Accepted",
        connectorId: 1,
        idTag: "TAG-1",
        ocppTransactionId: 1001,
        authorizationStatus: "Accepted",
        consecutiveFailures: 0,
        platformCommunicationStatus: "online",
        shouldReconnect: false,
      },
    });
    expect(start.statusNotificationResults).toEqual([
      expect.objectContaining({ outcome: "Accepted", connectorStatus: "Charging" }),
    ]);
    const meterResult = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 160,
    });
    expect(meterResult).toMatchObject({
      outcome: "Accepted",
      transactionId: "1001",
      connectorId: 1,
      ocppTransactionId: 1001,
      meterWh: 160,
      unexpectedResponseFields: [],
      consecutiveFailures: 0,
      platformCommunicationStatus: "online",
      shouldReconnect: false,
    });
    await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 180,
    });

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Heartbeat",
      "Authorize",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "MeterValues",
      "StatusNotification",
      "StopTransaction",
      "StatusNotification",
    ]);
    expect(session.requests[2]?.payload).toEqual({ idTag: "TAG-1" });
    expect(session.requests[4]?.payload).toMatchObject({
      connectorId: 1,
      idTag: "TAG-1",
      meterStart: 100,
    });
    expect(session.requests[6]?.payload).toMatchObject({
      connectorId: 1,
      transactionId: 1001,
    });
    expect(session.requests[8]?.payload).toMatchObject({
      meterStop: 180,
      transactionId: 1001,
      reason: "Local",
    });

    const transaction = getRuntimeTransaction(protocolRuntime);
    expect(transaction?.id).toBe("1001");
    expect(transaction?.state).toBe("ended");
    expect(transaction?.endMeterWh).toBe(180);
    expect(transaction?.latestMeterWh).toBe(180);
    expect(session.requests[9]?.payload).toMatchObject({
      connectorId: 1,
      status: "Preparing",
    });
    const actionDiagnostics = diagnostics.filter((diagnostic) =>
      diagnostic.context?.category === "action"
    );
    for (const name of [
      "PlugConnector",
      "StartTransaction",
      "MeterValues",
      "StopTransaction",
    ]) {
      expect(actionDiagnostics).toContainEqual(expect.objectContaining({
        code: "OCPP16_ACTION_STARTED",
        context: expect.objectContaining({
          category: "action",
          phase: "started",
          name,
        }),
      }));
      expect(actionDiagnostics).toContainEqual(expect.objectContaining({
        code: "OCPP16_ACTION_COMPLETED",
        context: expect.objectContaining({
          category: "action",
          phase: "completed",
          name,
          durationMs: 0,
        }),
      }));
    }
    expect(actionDiagnostics).toContainEqual(expect.objectContaining({
      code: "OCPP16_ACTION_COMPLETED",
      context: expect.objectContaining({
        name: "MeterValues",
        input: expect.objectContaining({ meterWh: 160 }),
        result: expect.objectContaining({
          outcome: "Accepted",
          transactionId: "1001",
        }),
      }),
    }));
    expect(getAuthorizationGrant(protocolRuntime)).toMatchObject({
      credentialId: "TAG-1",
      status: "accepted",
      source: "online",
      groupCredentialId: null,
    });
  });

  test("reports MeterValues with energy, power, current, and voltage measurands", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
    ], {
      chargingPoint: createChargingPoint({
        maxCurrent: 32,
        maxVoltage: 220,
      }),
    });

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 160,
    });

    expect(session.requests[4]?.payload).toMatchObject({
      connectorId: 1,
      transactionId: 1001,
      meterValue: [
        {
          sampledValue: [
            {
              value: "160",
              context: "Sample.Periodic",
              measurand: "Energy.Active.Import.Register",
              unit: "Wh",
            },
            {
              value: "7040",
              context: "Sample.Periodic",
              measurand: "Power.Active.Import",
              unit: "W",
            },
            {
              value: "32",
              context: "Sample.Periodic",
              measurand: "Current.Import",
              unit: "A",
            },
            {
              value: "220",
              context: "Sample.Periodic",
              measurand: "Voltage",
              unit: "V",
            },
          ],
        },
      ],
    });
  });

  test("emits runtime events from the local charging flow", async () => {
    const { protocolRuntime } = createProtocolRuntime([
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
      response("MeterValues", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    const events = collectRuntimeEvents(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-1",
    });
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 160,
    });
    await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 180,
    });
    protocolRuntime.unplugConnector({ evseId: 1, connectorId: 1 });

    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.status",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      previousStatus: "available",
      currentStatus: "occupied",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "evse.status",
      resource: { scope: "evse", evseId: 1 },
      previousStatus: "available",
      currentStatus: "occupied",
    }));
    expect(events.filter((event) => event.type === "authorization.status"))
      .toEqual([
        expect.objectContaining({
          resource: {
            scope: "authorization",
            idTag: "TAG-1",
            evseId: 1,
            connectorId: 1,
          },
          status: "accepted",
          source: "online",
          protocolStatus: "Accepted",
        }),
        expect.objectContaining({
          resource: {
            scope: "authorization",
            idTag: "TAG-1",
            evseId: 1,
            connectorId: 1,
          },
          status: "accepted",
          source: "online",
          protocolStatus: "Accepted",
        }),
      ]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "1001",
      },
      previousStatus: null,
      currentStatus: "active",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.meterValue",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "1001",
      },
      meterWh: 160,
      sampledAt: new Date("2026-01-01T00:00:00.000Z"),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "1001",
      },
      previousStatus: "active",
      currentStatus: "ended",
      reason: "local",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.status",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      previousStatus: "occupied",
      currentStatus: "available",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "evse.status",
      resource: { scope: "evse", evseId: 1 },
      previousStatus: "occupied",
      currentStatus: "available",
    }));
  });

  test("ignores runtime event listener failures", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    protocolRuntime.on("runtimeEvent", () => {
      throw new Error("observer failed");
    });

    await expect(
      protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 }),
    ).resolves.toMatchObject({
      connectorStatus: "occupied",
      plugState: "plugged",
    });
    expect(getConnectorFact(protocolRuntime)?.status).toBe("occupied");
  });

  });

  describe("authorization policy flows", () => {
  test("records independent Authorize result as an EVSE-scoped grant", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Authorize", {
        idTagInfo: {
          status: "Accepted",
          expiryDate: "2026-06-01T00:00:00.000Z",
          parentIdTag: "GROUP-1",
        },
      }),
    ]);

    await boot(protocolRuntime);
    const result = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-1",
    });

    expect(result).toMatchObject({
      outcome: "Accepted",
      idTag: "TAG-1",
      authorizationStatus: "Accepted",
      expiryDate: new Date("2026-06-01T00:00:00.000Z"),
      parentIdTag: "GROUP-1",
      consecutiveFailures: 0,
      platformCommunicationStatus: "online",
      shouldReconnect: false,
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Authorize",
    ]);
    expect(getAuthorizationGrant(protocolRuntime)).toMatchObject({
      credentialId: "TAG-1",
      status: "accepted",
      source: "online",
      groupCredentialId: "GROUP-1",
    });
    expect(getAuthorizationGrant(protocolRuntime)?.validUntil).toEqual(
      new Date("2026-06-01T00:00:00.000Z"),
    );
    expect(getAuthorizationGrant(protocolRuntime)?.listAllowedEvseIds()).toEqual([1]);
  });

  test("records rejected Authorize statuses without starting a transaction", async () => {
    const rejectedStatuses = [
      ["Blocked", "blocked"],
      ["Expired", "expired"],
      ["Invalid", "invalid"],
      ["ConcurrentTx", "concurrent-transaction"],
    ] as const;

    for (const [authorizationStatus, grantStatus] of rejectedStatuses) {
      const { protocolRuntime, session } = createProtocolRuntime([
        bootAccepted(),
        response("Authorize", { idTagInfo: { status: authorizationStatus } }),
      ]);

      await boot(protocolRuntime);
      const result = await protocolRuntime.authorize({
        connectorId: 1,
        idTag: "BAD",
      });

      expect(result).toMatchObject({
        outcome: "Rejected",
        idTag: "BAD",
        authorizationStatus,
      });
      expect(getAuthorizationGrant(protocolRuntime)).toMatchObject({
        credentialId: "BAD",
        status: grantStatus,
        source: "online",
      });
      expect(session.requests.map((request) => request.action)).toEqual([
        "BootNotification",
        "Authorize",
      ]);
    }
  });

  test("accepts independent Authorize from a local authorization list entry while offline", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
      }),
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [{
        credentialId: "TAG-LOCAL",
        status: "accepted",
        validUntil: new Date("2026-06-01T00:00:00.000Z"),
        groupCredentialId: "GROUP-1",
      }],
    );
    const events = collectRuntimeEvents(protocolRuntime);

    const result = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-LOCAL",
    });

    expect(result).toMatchObject({
      outcome: "Accepted",
      idTag: "TAG-LOCAL",
      authorizationStatus: "Accepted",
      expiryDate: new Date("2026-06-01T00:00:00.000Z"),
      parentIdTag: "GROUP-1",
      source: "local-list",
      platformCommunicationStatus: "offline",
    });
    expect(getAuthorizationGrant(protocolRuntime)).toMatchObject({
      credentialId: "TAG-LOCAL",
      status: "accepted",
      source: "local-list",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      status: "accepted",
      source: "local-list",
      protocolStatus: "Accepted",
    }));
  });

  test("pre-authorizes from a local list entry and still sends Authorize while online", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Authorize", { idTagInfo: { status: "Accepted" } }),
    ], {
      configurationCatalog: localAuthorizationListConfiguration({
        localPreAuthorize: true,
      }),
    });
    await boot(protocolRuntime);
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [{ credentialId: "TAG-LOCAL", status: "accepted" }],
    );
    const events = collectRuntimeEvents(protocolRuntime);

    const result = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-LOCAL",
    });

    expect(result).toMatchObject({
      outcome: "Accepted",
      idTag: "TAG-LOCAL",
      authorizationStatus: "Accepted",
      source: "local-list",
      platformCommunicationStatus: "online",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Authorize",
    ]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      status: "accepted",
      source: "local-list",
    }));
  });

  test("uses CSMS review when local pre-authorization finds a rejected local entry", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Authorize", { idTagInfo: { status: "Accepted" } }),
    ], {
      configurationCatalog: localAuthorizationListConfiguration({
        localPreAuthorize: true,
      }),
    });
    await boot(protocolRuntime);
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [{ credentialId: "TAG-LOCAL", status: "invalid" }],
    );

    const result = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-LOCAL",
    });

    expect(result).toMatchObject({
      outcome: "Accepted",
      source: "online",
      authorizationStatus: "Accepted",
    });
    expect(getAuthorizationGrant(protocolRuntime)).toMatchObject({
      credentialId: "TAG-LOCAL",
      status: "accepted",
      source: "online",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Authorize",
    ]);
  });

  test("stops an active transaction when background Authorize rejects a pre-authorization", async () => {
    const backgroundAuthorize = createDeferred<OutboundRequestResult>();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      {
        action: "Authorize",
        result: backgroundAuthorize.promise,
      },
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: localAuthorizationListConfiguration({
        localPreAuthorize: true,
      }),
    });
    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [{ credentialId: "TAG-LOCAL", status: "accepted" }],
    );
    const events = collectRuntimeEvents(protocolRuntime);

    const authorizeResult = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-LOCAL",
    });
    const startResult = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-LOCAL",
      meterStartWh: 100,
    });

    backgroundAuthorize.resolve({
      kind: "response",
      payload: { idTagInfo: { status: "Invalid" } },
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(authorizeResult).toMatchObject({
      outcome: "Accepted",
      source: "local-list",
    });
    expect(startResult).toMatchObject({
      status: "Accepted",
      transactionId: "1001",
    });
    expect(getRuntimeTransaction(protocolRuntime)).toMatchObject({
      id: "1001",
      state: "ended",
      stopReason: "deauthorized",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      status: "invalid",
      source: "online",
      protocolStatus: "Invalid",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      currentStatus: "ended",
      reason: "deauthorized",
    }));
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "Authorize",
      "StartTransaction",
      "StatusNotification",
      "StatusNotification",
      "StopTransaction",
      "StatusNotification",
    ]);
  });

  test("keeps a pre-authorized transaction active when background Authorize fails", async () => {
    const backgroundAuthorize = createDeferred<OutboundRequestResult>();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      {
        action: "Authorize",
        result: backgroundAuthorize.promise,
      },
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: localAuthorizationListConfiguration({
        localPreAuthorize: true,
      }),
    });
    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [{ credentialId: "TAG-LOCAL", status: "accepted" }],
    );

    await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-LOCAL",
    });
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-LOCAL",
      meterStartWh: 100,
    });

    backgroundAuthorize.reject(new Error("authorize timeout"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getRuntimeTransaction(protocolRuntime)).toMatchObject({
      id: "1001",
      state: "active",
      stopReason: null,
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "Authorize",
      "StartTransaction",
      "StatusNotification",
    ]);
  });

  test("rejects local transaction start when no valid authorization exists", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "Rejected",
      reason: "未找到有效授权",
      statusNotificationResults: [],
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
  });

  test("requires plug-in before local transaction start", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);

    await expect(protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    })).rejects.toThrow("connector 1 当前不可启动交易");
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
    ]);
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
  });

  test("keeps an accepted transaction active when Charging StatusNotification fails", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      rejected(
        "StatusNotification",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 StatusNotification 响应超时"),
      ),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    expect(result.status).toBe("Accepted");
    expect(result.statusNotificationResults).toEqual([
      expect.objectContaining({
        outcome: "Failed",
        connectorStatus: "Charging",
        errorCode: "OUTBOUND_REQUEST_TIMEOUT",
        consecutiveFailures: 1,
        platformCommunicationStatus: "unknown",
        shouldReconnect: false,
      }),
    ]);
    const transaction = getRuntimeTransaction(protocolRuntime);
    expect(transaction?.id).toBe("1001");
    expect(transaction?.state).toBe("active");
    expect(transaction?.chargingState).toBe("charging");
  });

  test("releases local resources when final StatusNotification fails after stop", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      rejected(
        "StatusNotification",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 StatusNotification 响应超时"),
      ),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const result = await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 180,
    });

    expect(result.outcome).toBe("Accepted");
    expect(result.statusNotificationResults).toEqual([
      expect.objectContaining({ outcome: "Accepted", connectorStatus: "Finishing" }),
      expect.objectContaining({
        outcome: "Failed",
        connectorStatus: "Preparing",
        errorCode: "OUTBOUND_REQUEST_TIMEOUT",
        consecutiveFailures: 1,
        platformCommunicationStatus: "unknown",
        shouldReconnect: false,
      }),
    ]);
    const state = runtimeState(protocolRuntime);
    const [evse] = Array.from(state.chargingPoint.evses ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(state.transactions[0]?.state).toBe("ended");
    expect(evse?.activeTransactionId).toBeNull();
    expect(connector?.status).toBe("occupied");
  });

  test("stopTransaction reports current protocol status without unplugging the vehicle", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ]);
    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 150,
    });

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "StatusNotification",
      "StopTransaction",
      "StatusNotification",
    ]);
    expect(session.requests[4]?.payload).toMatchObject({
      status: "Finishing",
    });
    expect(session.requests[6]?.payload).toMatchObject({
      status: "Preparing",
    });
    const state = runtimeState(protocolRuntime);
    const [evse] = Array.from(state.chargingPoint.evses ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(evse?.activeTransactionId).toBeNull();
    expect(connector?.plugState).toBe("plugged");
    expect(connector?.vehiclePresence).toBe("detected");
    expect(connector?.status).toBe("occupied");
    expect(connector?.lockState).toBe("unlocked");
  });

  test("unplug remains the explicit physical disconnect operation after stopTransaction", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ]);
    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 150,
    });

    protocolRuntime.unplugConnector({ evseId: 1, connectorId: 1 });

    const state = runtimeState(protocolRuntime);
    const [evse] = Array.from(state.chargingPoint.evses ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(connector?.plugState).toBe("unplugged");
    expect(connector?.vehiclePresence).toBe("absent");
    expect(connector?.status).toBe("available");
  });

  test("treats StopTransaction idTagInfo statuses as successful delivery metadata", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {
        idTagInfo: { status: "Expired" },
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const result = await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 180,
    });

    expect(result).toMatchObject({
      outcome: "Accepted",
      ocppTransactionId: 1001,
      idTagInfoStatus: "Expired",
      responseIssue: null,
      unexpectedResponseFields: [],
    });
    const state = runtimeState(protocolRuntime);
    expect(state.transactions[0]?.state).toBe("ended");
  });

  test("records non-standard StopTransaction response fields without rejecting the local stop", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", { status: "Rejected" }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const result = await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 180,
    });

    expect(result).toMatchObject({
      outcome: "Accepted",
      idTagInfoStatus: null,
      unexpectedResponseFields: ["status"],
    });
    const state = runtimeState(protocolRuntime);
    expect(state.transactions[0]?.state).toBe("ended");
  });

  test("ends the local transaction without pending retry data when StopTransaction fails", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      error("StopTransaction", "stop rejected"),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const result = await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "ev-disconnected",
      meterStopWh: 180,
    });

    expect(result).toMatchObject({
      outcome: "Failed",
      ocppTransactionId: 1001,
      meterStop: 180,
      errorCode: "InternalError",
      errorMessage: "stop rejected",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(result.statusNotificationResults).toEqual([
      expect.objectContaining({ outcome: "Accepted", connectorStatus: "Finishing" }),
      expect.objectContaining({ outcome: "Accepted", connectorStatus: "Preparing" }),
    ]);
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "StatusNotification",
      "StopTransaction",
      "StatusNotification",
    ]);
    const state = runtimeState(protocolRuntime);
    const [evse] = Array.from(state.chargingPoint.evses ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(state.transactions[0]?.state).toBe("ended");
    expect(state.transactions[0]?.stopReason).toBe("ev-disconnected");
    expect(evse?.activeTransactionId).toBeNull();
    expect(connector?.status).toBe("occupied");
  });

  test("continues sending StopTransaction after session offline", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    session.emitOffline("unexpected_disconnect");
    const result = await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 180,
    });

    expect(result).toMatchObject({
      outcome: "Accepted",
      ocppTransactionId: 1001,
      platformCommunicationStatus: "online",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "StatusNotification",
      "StopTransaction",
      "StatusNotification",
    ]);
    const state = runtimeState(protocolRuntime);
    const [evse] = Array.from(state.chargingPoint.evses ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(state.transactions[0]?.state).toBe("ended");
    expect(evse?.activeTransactionId).toBeNull();
    expect(connector?.status).toBe("occupied");
  });

  test("does not create pending StopTransaction retry state after failure", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      rejected(
        "StopTransaction",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 StopTransaction 响应超时"),
      ),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const result = await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 180,
    });

    expect(result).toMatchObject({
      outcome: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    const state = runtimeState(protocolRuntime);
    expect(state.transactions[0]?.state).toBe("ended");
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "StatusNotification",
      "StopTransaction",
      "StatusNotification",
    ]);
  });

  test("rejects duplicate local StopTransaction through a runtime error", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const transactionId = start.status === "Accepted" ? start.transactionId : "";
    await protocolRuntime.stopTransaction({
      transactionId,
      reason: "local",
      meterStopWh: 180,
    });

    let duplicateStopError: unknown;
    try {
      await protocolRuntime.stopTransaction({
        transactionId,
        reason: "local",
        meterStopWh: 180,
      });
    } catch (error) {
      duplicateStopError = error;
    }
    expect(duplicateStopError).toBeInstanceOf(ProtocolRuntimeError);
    expect(duplicateStopError).toMatchObject({
      code: "PROTOCOL_RUNTIME_INVALID_OPERATION",
      message: "充电交易 1001 已结束，不能重复停止",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "StatusNotification",
      "StopTransaction",
      "StatusNotification",
    ]);
  });

  });

  describe("heartbeat", () => {
  test("records successful heartbeat health", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", { currentTime: "2026-01-01T00:00:01.000Z" }),
    ]);

    await boot(protocolRuntime);
    const result = await protocolRuntime.sendHeartbeat();

    expect(result).toMatchObject({
      status: "Accepted",
      currentTime: new Date("2026-01-01T00:00:01.000Z"),
      timeStatus: "valid",
      timeIssue: null,
      consecutiveFailures: 0,
      platformCommunicationStatus: "online",
      shouldReconnect: false,
    });
  });

  test("syncs protocol clock from valid heartbeat currentTime", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", { currentTime: "2026-01-01T00:00:01.000Z" }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    await protocolRuntime.sendHeartbeat();
    await protocolRuntime.reportChargingPointStatus();

    expect(session.requests[2]?.payload).toMatchObject({
      timestamp: "2026-01-01T00:00:01.000Z",
    });
  });

  test("compares heartbeat drift with current protocol clock", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      response("BootNotification", {
        status: "Accepted",
        currentTime: "2026-01-01T00:10:00.000Z",
        interval: 30,
      }),
      response("Heartbeat", { currentTime: "2026-01-01T00:10:01.000Z" }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    const heartbeatResult = await protocolRuntime.sendHeartbeat();
    await protocolRuntime.reportChargingPointStatus();

    expect(heartbeatResult).toMatchObject({
      status: "Accepted",
      currentTime: new Date("2026-01-01T00:10:01.000Z"),
      timeStatus: "valid",
    });
    expect(session.requests[2]?.payload).toMatchObject({
      timestamp: "2026-01-01T00:10:01.000Z",
    });
  });

  test("returns stateless heartbeat timeout failures", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      rejected(
        "Heartbeat",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Heartbeat 响应超时"),
      ),
      rejected(
        "Heartbeat",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Heartbeat 响应超时"),
      ),
      rejected(
        "Heartbeat",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Heartbeat 响应超时"),
      ),
    ]);

    await boot(protocolRuntime);
    const first = await protocolRuntime.sendHeartbeat();
    const second = await protocolRuntime.sendHeartbeat();
    const third = await protocolRuntime.sendHeartbeat();

    expect(first).toMatchObject({
      status: "Failed",
      errorCode: "OUTBOUND_REQUEST_TIMEOUT",
      consecutiveFailures: 1,
      shouldReconnect: false,
    });
    expect(second).toMatchObject({
      status: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(third).toMatchObject({
      status: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
  });

  test("counts heartbeat loop failures locally and stops at reconnect threshold", async () => {
    vi.useFakeTimers();
    const heartbeatResults: Ocpp16HeartbeatResult[] = [];
    const reconnectResults: Array<
      Extract<Ocpp16HeartbeatResult, { status: "Failed" }>
    > = [];
    const onHeartbeat = vi.fn((result: Ocpp16HeartbeatResult) => {
      heartbeatResults.push(result);
    });
    const onReconnectRequired = vi.fn((
      result: Extract<Ocpp16HeartbeatResult, { status: "Failed" }>,
    ) => {
      reconnectResults.push(result);
    });
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      rejected(
        "Heartbeat",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Heartbeat 响应超时"),
      ),
      rejected(
        "Heartbeat",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Heartbeat 响应超时"),
      ),
      rejected(
        "Heartbeat",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Heartbeat 响应超时"),
      ),
    ]);

    await boot(protocolRuntime);
    protocolRuntime.startHeartbeatLoop({ onHeartbeat, onReconnectRequired });
    for (let index = 0; index < 3; index += 1) {
      vi.advanceTimersByTime(30_000);
      await flushMicrotasks();
    }

    expect(heartbeatResults.map((result) => ({
      status: result.status,
      consecutiveFailures: result.consecutiveFailures,
      shouldReconnect: result.shouldReconnect,
    }))).toEqual([
      { status: "Failed", consecutiveFailures: 1, shouldReconnect: false },
      { status: "Failed", consecutiveFailures: 2, shouldReconnect: false },
      { status: "Failed", consecutiveFailures: 3, shouldReconnect: true },
    ]);
    expect(onHeartbeat).toHaveBeenCalledTimes(3);
    expect(onReconnectRequired).toHaveBeenCalledTimes(1);
    expect(reconnectResults[0]).toMatchObject({
      consecutiveFailures: 3,
      shouldReconnect: true,
    });
    expect(protocolRuntime.getRuntimeSnapshot().heartbeatTimerActive).toBe(false);
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Heartbeat",
      "Heartbeat",
      "Heartbeat",
    ]);
  });

  test("counts heartbeat CALLERROR without changing an active transaction", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      error("Heartbeat", "heartbeat rejected"),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const result = await protocolRuntime.sendHeartbeat();

    expect(result).toMatchObject({
      status: "Failed",
      errorCode: "InternalError",
      errorMessage: "heartbeat rejected",
      consecutiveFailures: 1,
    });
    const state = runtimeState(protocolRuntime);
    expect(state.transactions[0]?.id).toBe("1001");
    expect(state.transactions[0]?.state).toBe("active");
    expect(state.transactions[0]?.chargingState).toBe("charging");
  });

  test("treats invalid heartbeat currentTime as communication success", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", { currentTime: "not-a-date" }),
    ]);

    await boot(protocolRuntime);
    const result = await protocolRuntime.sendHeartbeat();

    expect(result).toMatchObject({
      status: "Accepted",
      currentTime: null,
      timeStatus: "invalid",
      timeIssue: "Heartbeat.conf.currentTime 格式非法",
      platformCommunicationStatus: "online",
      shouldReconnect: false,
    });
  });

  test("rejects heartbeat currentTime without OCPP DateTime offset", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", { currentTime: "2026-01-01 00:00:01" }),
    ]);

    await boot(protocolRuntime);
    const result = await protocolRuntime.sendHeartbeat();

    expect(result).toMatchObject({
      status: "Accepted",
      currentTime: null,
      timeStatus: "invalid",
      timeIssue: "Heartbeat.conf.currentTime 格式非法",
      platformCommunicationStatus: "online",
      shouldReconnect: false,
    });
  });

  test("does not use heartbeat currentTime when drift is too large", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", { currentTime: "2026-01-01T00:06:00.001Z" }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    const result = await protocolRuntime.sendHeartbeat();
    await protocolRuntime.reportChargingPointStatus();

    expect(result).toMatchObject({
      status: "Accepted",
      currentTime: null,
      timeStatus: "drifted",
      timeIssue: "Heartbeat.conf.currentTime 与本地时间相差超过 300000ms",
      platformCommunicationStatus: "online",
    });
    expect(session.requests[2]?.payload).toMatchObject({
      timestamp: "2026-01-01T00:00:00.000Z",
    });
  });

  test("stops heartbeat loop on session offline without stopping local charging", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    protocolRuntime.startHeartbeatLoop();
    session.emitOffline("unexpected_disconnect");

    const state = runtimeState(protocolRuntime);
    expect(protocolRuntime.getRuntimeSnapshot().heartbeatTimerActive).toBe(false);
    expect(state.transactions[0]?.id).toBe("1001");
    expect(state.transactions[0]?.state).toBe("active");
    expect(state.transactions[0]?.chargingState).toBe("charging");
  });

  });

  describe("registration gates", () => {
  test("rejects starting before BootNotification is accepted", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      response("BootNotification", {
        status: "Pending",
        currentTime: "2026-01-01T00:00:00.000Z",
        interval: 30,
      }),
    ], {
      configurationCatalog: localAuthorizeOfflineDisabledConfiguration(),
    });

    const result = await protocolRuntime.boot();
    expect(result.status).toBe("Pending");
    expect(result.interval).toBe(30);

    const state = runtimeState(protocolRuntime);
    expect(state.chargingPoint.availability).toBe("inoperative");
    expect(state.configurationStore.getEntry("HeartbeatInterval")?.value).toBe("60");

    await expect(
      protocolRuntime.reportConnectorStatus({ connectorId: 1 }),
    ).rejects.toThrow("BootNotification 未 Accepted");
    await expect(protocolRuntime.sendHeartbeat()).rejects.toThrow(
      "BootNotification 未 Accepted",
    );
    await expect(protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    })).rejects.toThrow("BootNotification 未 Accepted");
    try {
      await protocolRuntime.startLocalTransaction({
        connectorId: 1,
        idTag: "TAG-1",
        meterStartWh: 100,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolRuntimeError);
      expect(error).toMatchObject({
        code: "PROTOCOL_RUNTIME_NOT_REGISTERED",
        message: "BootNotification 未 Accepted，不能启动交易",
      });
    }
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("records rejected boot retry interval and blocks normal business", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      response("BootNotification", {
        status: "Rejected",
        currentTime: "2026-01-01T00:00:00.000Z",
        interval: 300,
      }),
    ], {
      configurationCatalog: localAuthorizeOfflineDisabledConfiguration(),
    });

    const result = await protocolRuntime.boot();

    expect(result).toEqual({
      status: "Rejected",
      currentTime: new Date("2026-01-01T00:00:00.000Z"),
      interval: 300,
    });
    const state = runtimeState(protocolRuntime);
    expect(state.chargingPoint.availability).toBe("inoperative");
    expect(state.configurationStore.getEntry("HeartbeatInterval")?.value).toBe("60");

    await expect(
      protocolRuntime.reportConnectorStatus({ connectorId: 1 }),
    ).rejects.toThrow("BootNotification 未 Accepted");
    await expect(protocolRuntime.sendHeartbeat()).rejects.toThrow(
      "BootNotification 未 Accepted",
    );
    await expect(protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    })).rejects.toThrow("BootNotification 未 Accepted");
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("keeps connector available when independent Authorize rejects the idTag", async () => {
    const rejectedStatuses = [
      "Blocked",
      "Expired",
      "Invalid",
      "ConcurrentTx",
    ] as const;

    for (const authorizationStatus of rejectedStatuses) {
      const { protocolRuntime, session } = createProtocolRuntime([
        bootAccepted(),
        response("Authorize", { idTagInfo: { status: authorizationStatus } }),
      ]);

      await boot(protocolRuntime);
      const result = await protocolRuntime.authorize({
        connectorId: 1,
        idTag: "BAD",
      });

      expect(result).toMatchObject({
        outcome: "Rejected",
        authorizationStatus,
        idTag: "BAD",
        consecutiveFailures: 0,
        platformCommunicationStatus: "online",
        shouldReconnect: false,
      });
      expect(session.requests.map((request) => request.action)).toEqual([
        "BootNotification",
        "Authorize",
      ]);
      expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
      const [evse] = Array.from(listRuntimeEvses(protocolRuntime) ?? []);
      const [connector] = evse?.listConnectors() ?? [];
      expect(connector?.status).toBe("available");
    }
  });

  test("fails closed when Authorize times out with stateless failure results", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      rejected(
        "Authorize",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Authorize 响应超时"),
      ),
      rejected(
        "Authorize",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Authorize 响应超时"),
      ),
      rejected(
        "Authorize",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 Authorize 响应超时"),
      ),
    ]);

    await boot(protocolRuntime);
    const first = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-1",
    });
    const second = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-1",
    });
    const third = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-1",
    });

    expect(first).toMatchObject({
      outcome: "Failed",
      errorCode: "OUTBOUND_REQUEST_TIMEOUT",
      consecutiveFailures: 1,
      shouldReconnect: false,
    });
    expect(second).toMatchObject({
      outcome: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(third).toMatchObject({
      outcome: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Authorize",
      "Authorize",
      "Authorize",
    ]);
    expect(session.requests.some((request) => request.action === "StartTransaction")).toBe(
      false,
    );
    const state = runtimeState(protocolRuntime);
    expect(state.transactions).toEqual([]);
    const [evse] = Array.from(state.chargingPoint.evses ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(connector?.status).toBe("available");
  });

  test("treats Authorize CALLERROR as failed and does not create a transaction", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      error("Authorize", "authorize rejected"),
    ]);

    await boot(protocolRuntime);
    const result = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-1",
    });

    expect(result).toMatchObject({
      outcome: "Failed",
      errorCode: "InternalError",
      errorMessage: "authorize rejected",
      consecutiveFailures: 1,
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Authorize",
    ]);
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
  });

  test("rejects independent Authorize after session offline when local authorization is disabled", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ], {
      configurationCatalog: localAuthorizeOfflineDisabledConfiguration(),
    });

    await boot(protocolRuntime);
    session.emitOffline("unexpected_disconnect");
    const result = await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-1",
    });

    expect(result).toMatchObject({
      outcome: "Rejected",
      authorizationStatus: "Invalid",
      reason: "离线授权未启用",
      platformCommunicationStatus: "offline",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
    ]);
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
    const [evse] = Array.from(listRuntimeEvses(protocolRuntime) ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(connector?.status).toBe("available");
  });

  });

  describe("offline transaction delivery", () => {
  test("starts an offline local transaction from an accepted local authorization list entry", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
      }),
    });
    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [
        {
          credentialId: "TAG-LOCAL",
          status: "accepted",
          validUntil: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
    );
    session.emitOffline("unexpected_disconnect");
    const events = collectRuntimeEvents(protocolRuntime);

    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-LOCAL",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "Accepted",
      transactionId: "transaction-1",
      authorizationSource: "local-list",
      statusNotificationResults: [],
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);
    expect(getRuntimeTransaction(protocolRuntime)).toMatchObject({
      id: "transaction-1",
      credentialId: "TAG-LOCAL",
      state: "active",
    });
    expect(getAuthorizationGrant(protocolRuntime)).toMatchObject({
      credentialId: "TAG-LOCAL",
      status: "accepted",
      source: "local-list",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      resource: {
        scope: "authorization",
        idTag: "TAG-LOCAL",
        evseId: 1,
        connectorId: 1,
      },
      status: "accepted",
      source: "local-list",
      protocolStatus: "Accepted",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "transaction-1",
      },
      previousStatus: null,
      currentStatus: "active",
    }));
  });

  test("starts an offline local transaction before protocol registration when locally authorized", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
      }),
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [{ credentialId: "TAG-LOCAL", status: "accepted" }],
    );

    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-LOCAL",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "Accepted",
      transactionId: "transaction-1",
      authorizationSource: "local-list",
      statusNotificationResults: [],
    });
    expect(session.requests).toEqual([]);
    expect(getRuntimeTransaction(protocolRuntime)).toMatchObject({
      id: "transaction-1",
      state: "active",
    });
  });

  test("rejects a denied offline local authorization list entry before unknown-id policy", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        allowOfflineUnknownId: true,
      }),
    });
    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [{ credentialId: "TAG-BAD", status: "invalid" }],
    );
    session.emitOffline("unexpected_disconnect");

    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-BAD",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "Rejected",
      reason: "无效卡",
      authorizationStatus: "Invalid",
      statusNotificationResults: [],
    });
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);
  });

  test("does not read the local authorization list when LocalAuthListEnabled is false", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "LocalAuthListEnabled",
            value: "false",
            valueType: "boolean",
          },
          {
            key: "LocalAuthorizeOffline",
            value: "true",
            valueType: "boolean",
          },
        ],
      },
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      [{ credentialId: "TAG-LOCAL", status: "accepted" }],
    );

    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-LOCAL",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "Rejected",
      reason: "未找到有效授权",
      statusNotificationResults: [],
    });
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
  });

  test("does not read the authorization cache when AuthorizationCacheEnabled is false", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        authorizationCacheEnabled: false,
      }),
    });
    runtimeContext(protocolRuntime).authorizationCache.set(
      "TAG-CACHE\u00001",
      new AuthorizationGrant({
        credentialId: "TAG-CACHE",
        status: "accepted",
        validUntil: null,
        allowedEvseIds: [1],
        source: "cache",
        isCacheEntry: true,
        lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );

    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-CACHE",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "Rejected",
      reason: "未找到有效授权",
      statusNotificationResults: [],
    });
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
  });

  test("starts an offline local transaction for an unknown idTag when configured", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        allowOfflineUnknownId: true,
      }),
    });
    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    session.emitOffline("unexpected_disconnect");

    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "Accepted",
      transactionId: "transaction-1",
      authorizationSource: "default-policy",
      statusNotificationResults: [],
    });
    expect(getAuthorizationGrant(protocolRuntime)).toMatchObject({
      credentialId: "UNKNOWN",
      status: "accepted",
      source: "default-policy",
    });
  });

  test("replays an active offline transaction after accepted boot", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        allowOfflineUnknownId: true,
      }),
    });

    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });
    await boot(protocolRuntime);

    expect(start).toEqual({
      status: "Accepted",
      transactionId: "transaction-1",
      authorizationSource: "default-policy",
      statusNotificationResults: [],
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "StatusNotification",
    ]);
    expect(protocolRuntime.getTransactionResource("transaction-1"))
      .toMatchObject({
        evseId: 1,
        connectorId: 1,
        ocppTransactionId: 1001,
      });
    expect(getRuntimeTransaction(protocolRuntime)).toMatchObject({
      id: "transaction-1",
      state: "active",
    });
  });

  test("caches offline MeterValues and replays them after StartTransaction", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("MeterValues", {}),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        allowOfflineUnknownId: true,
      }),
    });

    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });
    const meter = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });
    expect(meter).toMatchObject({
      outcome: "Accepted",
      transactionId: "transaction-1",
      ocppTransactionId: null,
      meterWh: 150,
      platformCommunicationStatus: "offline",
    });
    expect(session.requests).toEqual([]);

    await boot(protocolRuntime);

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "MeterValues",
      "StatusNotification",
    ]);
    expect(session.requests[2]?.payload).toMatchObject({
      connectorId: 1,
      transactionId: 1001,
      meterValue: [
        {
          sampledValue: expect.arrayContaining([
            expect.objectContaining({ value: "150" }),
          ]),
        },
      ],
    });
    expect(getRuntimeTransaction(protocolRuntime)?.latestMeterWh)
      .toBe(150);
  });

  test("caches an offline StopTransaction and replays it after MeterValues", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("MeterValues", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        allowOfflineUnknownId: true,
      }),
    });

    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });
    await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });
    const stop = await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
      meterStopWh: 180,
    });

    expect(stop).toMatchObject({
      outcome: "Accepted",
      transactionId: "transaction-1",
      ocppTransactionId: null,
      meterStop: 180,
      platformCommunicationStatus: "offline",
    });
    expect(session.requests).toEqual([]);

    await boot(protocolRuntime);

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "MeterValues",
      "StopTransaction",
      "StatusNotification",
    ]);
    expect(session.requests[3]?.payload).toMatchObject({
      transactionId: 1001,
      meterStop: 180,
      reason: "Local",
    });
    expect(getRuntimeTransaction(protocolRuntime)).toMatchObject({
      id: "transaction-1",
      state: "ended",
      stopReason: "local",
    });
  });

  test("samples offline MeterValues with the configured interval", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("MeterValues", {}),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
        maxVoltage: 120,
        maxCurrent: 60,
      }),
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "LocalAuthListEnabled",
            value: "true",
            valueType: "boolean",
          },
          {
            key: "LocalAuthorizeOffline",
            value: "true",
            valueType: "boolean",
          },
          {
            key: "AllowOfflineTxForUnknownId",
            value: "true",
            valueType: "boolean",
          },
          {
            key: "MeterValueSampleInterval",
            value: "2",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
    });

    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });
    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();
    expect(session.requests).toEqual([]);
    expect(getRuntimeTransaction(protocolRuntime)?.latestMeterWh)
      .toBe(104);

    await boot(protocolRuntime);

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "MeterValues",
      "StatusNotification",
    ]);
    expect(session.requests[2]?.payload).toMatchObject({
      transactionId: 1001,
      meterValue: [
        {
          sampledValue: expect.arrayContaining([
            expect.objectContaining({ value: "104" }),
          ]),
        },
      ],
    });
  });

  test("stops an active offline transaction when replayed StartTransaction is invalid", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Invalid" },
      }),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        allowOfflineUnknownId: true,
      }),
    });

    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });
    await boot(protocolRuntime);

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "StopTransaction",
      "StatusNotification",
    ]);
    expect(session.requests[2]?.payload).toMatchObject({
      transactionId: 1001,
      reason: "DeAuthorized",
    });
    expect(getRuntimeTransaction(protocolRuntime)).toMatchObject({
      id: "transaction-1",
      state: "ended",
      stopReason: "deauthorized",
    });
  });

  test("keeps an active offline transaction when invalid-id stop is disabled", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Invalid" },
      }),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "LocalAuthListEnabled",
            value: "true",
            valueType: "boolean",
          },
          {
            key: "LocalAuthorizeOffline",
            value: "true",
            valueType: "boolean",
          },
          {
            key: "AllowOfflineTxForUnknownId",
            value: "true",
            valueType: "boolean",
          },
          {
            key: "StopTransactionOnInvalidId",
            value: "false",
            valueType: "boolean",
          },
        ],
      },
    });

    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });
    await boot(protocolRuntime);

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "StatusNotification",
    ]);
    expect(protocolRuntime.getTransactionResource("transaction-1"))
      .toMatchObject({ ocppTransactionId: 1001 });
    expect(getRuntimeTransaction(protocolRuntime)).toMatchObject({
      id: "transaction-1",
      state: "active",
    });
  });

  test("retries offline replay after a successful Heartbeat", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      error("StartTransaction", "start unavailable"),
      response("Heartbeat", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        allowOfflineUnknownId: true,
      }),
    });

    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });
    await boot(protocolRuntime);
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
    ]);
    expect(protocolRuntime.getTransactionResource("transaction-1"))
      .toMatchObject({ ocppTransactionId: null });

    await protocolRuntime.sendHeartbeat();

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "Heartbeat",
      "StartTransaction",
      "StatusNotification",
    ]);
    expect(protocolRuntime.getTransactionResource("transaction-1"))
      .toMatchObject({ ocppTransactionId: 1001 });
  });

  test("retries offline replay from failed MeterValues without replaying StartTransaction", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      error("MeterValues", "meter unavailable"),
      response("Heartbeat", {}),
      response("MeterValues", {}),
      response("StatusNotification", {}),
    ], {
      chargingPoint: createChargingPoint({
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
      configurationCatalog: localAuthorizationListConfiguration({
        localAuthorizeOffline: true,
        allowOfflineUnknownId: true,
      }),
    });

    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "UNKNOWN",
      meterStartWh: 100,
    });
    await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });
    await boot(protocolRuntime);

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "MeterValues",
    ]);
    expect(protocolRuntime.getTransactionResource("transaction-1"))
      .toMatchObject({ ocppTransactionId: 1001 });

    await protocolRuntime.sendHeartbeat();

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StartTransaction",
      "MeterValues",
      "Heartbeat",
      "MeterValues",
      "StatusNotification",
    ]);
    expect(session.requests.filter((request) => request.action === "StartTransaction"))
      .toHaveLength(1);
    expect(session.requests[4]?.payload).toMatchObject({
      transactionId: 1001,
    });
  });

  test("starts an offline local transaction from an authorization cache entry", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Authorize", {
        idTagInfo: {
          status: "Accepted",
          expiryDate: "2026-06-01T00:00:00.000Z",
        },
      }),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "AuthorizationCacheEnabled",
            value: "true",
            valueType: "boolean",
          },
          {
            key: "LocalAuthorizeOffline",
            value: "true",
            valueType: "boolean",
          },
        ],
      },
    });
    await boot(protocolRuntime);
    await protocolRuntime.authorize({
      connectorId: 1,
      idTag: "TAG-CACHE",
    });
    await plugConnector(protocolRuntime);
    session.emitOffline("unexpected_disconnect");

    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-CACHE",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "Accepted",
      transactionId: "transaction-1",
      authorizationSource: "cache",
      statusNotificationResults: [],
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Authorize",
      "StatusNotification",
    ]);
    expect(listAuthorizationGrants(protocolRuntime)[0]).toMatchObject({
      credentialId: "TAG-CACHE",
      status: "accepted",
      source: "cache",
    });
  });

  });

  describe("online transaction delivery", () => {
  test("removes the local transaction when StartTransaction is rejected", async () => {
    const rejectedStatuses = [
      ["Blocked", "卡被禁用"],
      ["Expired", "卡已过期"],
      ["Invalid", "无效卡"],
      ["ConcurrentTx", "已有并发交易"],
    ] as const;

    for (const [authorizationStatus, reason] of rejectedStatuses) {
      const { protocolRuntime, session } = createProtocolRuntime([
        bootAccepted(),
        response("StatusNotification", {}),
        response("StartTransaction", {
          transactionId: 1001,
          idTagInfo: { status: authorizationStatus },
        }),
        response("StatusNotification", {}),
      ]);

      await boot(protocolRuntime);
      seedAcceptedAuthorization(protocolRuntime);
      await plugConnector(protocolRuntime);
      const result = await protocolRuntime.startLocalTransaction({
        connectorId: 1,
        idTag: "TAG-1",
        meterStartWh: 100,
      });

      expect(result).toMatchObject({
        status: "Rejected",
        reason,
        authorizationStatus,
        startTransactionResult: {
          outcome: "Rejected",
          ocppTransactionId: 1001,
          authorizationStatus,
          consecutiveFailures: 0,
          platformCommunicationStatus: "online",
          shouldReconnect: false,
        },
      });
      expect(result.statusNotificationResults).toEqual([]);
      expect(session.requests.map((request) => request.action)).toEqual([
        "BootNotification",
        "StatusNotification",
        "StartTransaction",
      ]);
      const state = runtimeState(protocolRuntime);
      expect(state.transactions).toEqual([]);
      const [evse] = Array.from(state.chargingPoint.evses ?? []);
      const [connector] = evse?.listConnectors() ?? [];
      expect(connector?.status).toBe("occupied");
    }
  });

  test("fails closed when StartTransaction times out with stateless failure results", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      rejected(
        "StartTransaction",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 StartTransaction 响应超时"),
      ),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      rejected(
        "StartTransaction",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 StartTransaction 响应超时"),
      ),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      rejected(
        "StartTransaction",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 StartTransaction 响应超时"),
      ),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const first = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const second = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const third = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    expect(first).toMatchObject({
      status: "Rejected",
      reason: "StartTransaction 请求失败",
      startTransactionResult: {
        outcome: "Failed",
        errorCode: "OUTBOUND_REQUEST_TIMEOUT",
        consecutiveFailures: 1,
        shouldReconnect: false,
      },
    });
    expect(second).toMatchObject({
      status: "Rejected",
      startTransactionResult: {
        outcome: "Failed",
        consecutiveFailures: 1,
        platformCommunicationStatus: "unknown",
        shouldReconnect: false,
      },
    });
    expect(third).toMatchObject({
      status: "Rejected",
      startTransactionResult: {
        outcome: "Failed",
        consecutiveFailures: 1,
        platformCommunicationStatus: "unknown",
        shouldReconnect: false,
      },
    });
    expect(session.requests.filter((request) => request.action === "StartTransaction")).toHaveLength(3);
    const state = runtimeState(protocolRuntime);
    expect(state.transactions).toEqual([]);
    const [evse] = Array.from(state.chargingPoint.evses ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(connector?.status).toBe("occupied");
  });

  test("treats StartTransaction CALLERROR as failed and does not create a transaction", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      error("StartTransaction", "start rejected"),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    expect(result).toMatchObject({
      status: "Rejected",
      reason: "StartTransaction 请求失败",
      startTransactionResult: {
        outcome: "Failed",
        errorCode: "InternalError",
        errorMessage: "start rejected",
        consecutiveFailures: 1,
      },
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
    ]);
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
  });

  test("treats disconnected StartTransaction as failed and keeps the connector plugged locally", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      rejected(
        "StartTransaction",
        new SessionError("OUTBOUND_REQUEST_DISCONNECTED", "WebSocket 已断开"),
      ),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const result = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    expect(result).toMatchObject({
      status: "Rejected",
      reason: "StartTransaction 请求失败",
      startTransactionResult: {
        outcome: "Failed",
        errorCode: "OUTBOUND_REQUEST_DISCONNECTED",
      },
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
    ]);
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
    const [evse] = Array.from(listRuntimeEvses(protocolRuntime) ?? []);
    const [connector] = evse?.listConnectors() ?? [];
    expect(connector?.status).toBe("occupied");
  });

  test("prevents duplicate transactions and connectorId 0 transactions", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await expect(protocolRuntime.startLocalTransaction({
      connectorId: 0,
      idTag: "TAG-1",
      meterStartWh: 100,
    })).rejects.toThrow("connectorId=0 不能用于交易");
    try {
      await protocolRuntime.startLocalTransaction({
        connectorId: 0,
        idTag: "TAG-1",
        meterStartWh: 100,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolRuntimeError);
      expect(error).toMatchObject({
        code: "PROTOCOL_RUNTIME_CONNECTOR_NOT_TRANSACTIONAL",
        message: "connectorId=0 不能用于交易",
      });
    }
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    await expect(protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-2",
      meterStartWh: 200,
    })).rejects.toThrow("connector 1 当前不可启动交易");
  });

  test("keeps reported meter cursor unchanged when MeterValues returns CALLERROR", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      error("MeterValues", "meter rejected"),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const result = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });

    expect(result).toMatchObject({
      outcome: "Failed",
      transactionId: "1001",
      connectorId: 1,
      ocppTransactionId: 1001,
      meterWh: 150,
      errorCode: "InternalError",
      errorMessage: "meter rejected",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(session.requests.at(-1)?.action).toBe("MeterValues");
    const state = runtimeState(protocolRuntime);
    expect(state.transactions[0]?.latestMeterWh).toBe(150);
    expect(state.transactions[0]?.state).toBe("active");
    expect(state.transactions[0]?.chargingState).toBe("charging");
    await expect(protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 90,
    })).rejects.toThrow("meterWh 不能回退");
  });

  test("records unexpected MeterValues response fields as successful delivery", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", { status: "Accepted" }),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const result = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });

    expect(result).toMatchObject({
      outcome: "Accepted",
      unexpectedResponseFields: ["status"],
      consecutiveFailures: 0,
    });
    const state = runtimeState(protocolRuntime);
    expect(state.transactions[0]?.latestMeterWh).toBe(150);
  });

  test("grows periodic MeterValues from voltage and current while ignoring deprecated maxPower", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
      response("MeterValues", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "MeterValueSampleInterval",
            value: "2",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
      chargingPoint: createChargingPoint({
        maxPower: 7200,
        maxVoltage: 120,
        maxCurrent: 30,
      }),
    });

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    expect(start.status).toBe("Accepted");
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
    ]);

    vi.advanceTimersByTime(1_999);
    await flushMicrotasks();
    expect(session.requests.filter((request) => request.action === "MeterValues")).toHaveLength(0);

    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();

    const meterRequests = session.requests.filter((request) =>
      request.action === "MeterValues"
    );
    expect(meterRequests).toHaveLength(2);
    expect(meterRequests.map((request) =>
      (request.payload as {
        transactionId: number;
        meterValue: Array<{ sampledValue: Array<{ value: string }> }>;
      }).transactionId
    )).toEqual([1001, 1001]);
    expect(meterRequests.map((request) =>
      (request.payload as {
        meterValue: Array<{ sampledValue: Array<{ value: string }> }>;
      }).meterValue[0]?.sampledValue[0]?.value
    )).toEqual(["102", "104"]);
  });

  test("grows periodic MeterValues from connector voltage and current", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "MeterValueSampleInterval",
            value: "2",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
      chargingPoint: createChargingPoint({
        maxVoltage: 220,
        maxCurrent: 16,
      }),
    });

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();

    const meterRequest = session.requests.find((request) =>
      request.action === "MeterValues"
    );
    expect((meterRequest?.payload as {
      meterValue: Array<{ sampledValue: Array<{ value: string }> }>;
    }).meterValue[0]?.sampledValue[0]?.value).toBe("101.956");
  });

  test("keeps periodic MeterValues unchanged when connector has no power data", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "MeterValueSampleInterval",
            value: "2",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
    });

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();

    const meterRequest = session.requests.find((request) =>
      request.action === "MeterValues"
    );
    expect((meterRequest?.payload as {
      meterValue: Array<{ sampledValue: Array<{ value: string }> }>;
    }).meterValue[0]?.sampledValue[0]?.value).toBe("100");
  });

  test("does not start periodic MeterValues when MeterValueSampleInterval is zero", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "MeterValueSampleInterval",
            value: "0",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
    });

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    vi.advanceTimersByTime(60_000);
    await flushMicrotasks();

    expect(session.requests.some((request) => request.action === "MeterValues")).toBe(false);
  });

  test("stops periodic MeterValues when the transaction stops", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "MeterValueSampleInterval",
            value: "2",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
    });

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();
    expect(session.requests.filter((request) => request.action === "MeterValues")).toHaveLength(1);

    await protocolRuntime.stopTransaction({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      reason: "local",
    });
    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();

    expect(session.requests.filter((request) => request.action === "MeterValues")).toHaveLength(1);
  });

  test("returns stateless MeterValues failure results after repeated failures", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      rejected(
        "MeterValues",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 MeterValues 响应超时"),
      ),
      rejected(
        "MeterValues",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 MeterValues 响应超时"),
      ),
      rejected(
        "MeterValues",
        new SessionError("OUTBOUND_REQUEST_TIMEOUT", "等待 MeterValues 响应超时"),
      ),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const first = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });
    const second = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 160,
    });
    const third = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 170,
    });

    expect(first).toMatchObject({
      outcome: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(second).toMatchObject({
      outcome: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    expect(third).toMatchObject({
      outcome: "Failed",
      consecutiveFailures: 1,
      platformCommunicationStatus: "unknown",
      shouldReconnect: false,
    });
    const state = runtimeState(protocolRuntime);
    expect(state.transactions[0]?.latestMeterWh).toBe(170);
    expect(state.transactions[0]?.state).toBe("active");
  });

  test("queues MeterValues for an online transaction while session offline and replays after Heartbeat", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
      response("Heartbeat", {}),
      response("MeterValues", {}),
      response("MeterValues", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 120,
    });
    session.emitOffline("unexpected_disconnect");
    const firstOffline = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });
    const secondOffline = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 160,
    });

    expect(firstOffline).toMatchObject({
      outcome: "Accepted",
      transactionId: "1001",
      ocppTransactionId: 1001,
      meterWh: 150,
      consecutiveFailures: 0,
      platformCommunicationStatus: "offline",
    });
    expect(secondOffline).toMatchObject({
      outcome: "Accepted",
      transactionId: "1001",
      ocppTransactionId: 1001,
      meterWh: 160,
      consecutiveFailures: 0,
      platformCommunicationStatus: "offline",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "MeterValues",
    ]);

    await session.connect();
    await protocolRuntime.sendHeartbeat();

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "MeterValues",
      "Heartbeat",
      "MeterValues",
      "MeterValues",
      "StatusNotification",
    ]);
    expect(session.requests.filter((request) => request.action === "StartTransaction"))
      .toHaveLength(1);
    expect(session.requests[6]?.payload).toMatchObject({
      connectorId: 1,
      transactionId: 1001,
      meterValue: [
        {
          sampledValue: expect.arrayContaining([
            expect.objectContaining({ value: "150" }),
            expect.objectContaining({
              value: "0",
              measurand: "Power.Active.Import",
            }),
          ]),
        },
      ],
    });
    expect(session.requests[7]?.payload).toMatchObject({
      connectorId: 1,
      transactionId: 1001,
      meterValue: [
        {
          sampledValue: expect.arrayContaining([
            expect.objectContaining({ value: "160" }),
          ]),
        },
      ],
    });
    const state = runtimeState(protocolRuntime);
    expect(state.transactions[0]?.latestMeterWh).toBe(160);
  });

  test("replays queued MeterValues after reconnecting online restores Heartbeat", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("Heartbeat", {}),
      response("MeterValues", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    protocolRuntime.startHeartbeatLoop();
    session.emitOffline("unexpected_disconnect");
    await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });

    session.emitOnline();
    await flushMicrotasks();

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "Heartbeat",
      "MeterValues",
      "StatusNotification",
    ]);
    expect(session.requests.filter((request) => request.action === "StartTransaction"))
      .toHaveLength(1);
    expect(session.requests[5]?.payload).toMatchObject({
      connectorId: 1,
      transactionId: 1001,
      meterValue: [
        {
          sampledValue: expect.arrayContaining([
            expect.objectContaining({ value: "150" }),
          ]),
        },
      ],
    });
  });

  test("keeps new MeterValues queued while offline replay is in progress", async () => {
    const replayedMeterValue = createDeferred<OutboundRequestResult>();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("Heartbeat", {}),
      {
        action: "MeterValues",
        result: replayedMeterValue.promise,
      },
      response("StatusNotification", {}),
      response("Heartbeat", {}),
      response("MeterValues", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    session.emitOffline("unexpected_disconnect");
    await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });
    await session.connect();

    const heartbeat = protocolRuntime.sendHeartbeat();
    await flushMicrotasks();
    const queuedDuringReplay = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 160,
    });

    expect(queuedDuringReplay).toMatchObject({
      outcome: "Accepted",
      ocppTransactionId: 1001,
      meterWh: 160,
      platformCommunicationStatus: "offline",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "Heartbeat",
      "MeterValues",
    ]);

    replayedMeterValue.resolve({ kind: "response", payload: {} });
    await heartbeat;
    await protocolRuntime.sendHeartbeat();

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "Heartbeat",
      "MeterValues",
      "StatusNotification",
      "Heartbeat",
      "MeterValues",
      "StatusNotification",
    ]);
    expect(session.requests[8]?.payload).toMatchObject({
      connectorId: 1,
      transactionId: 1001,
      meterValue: [
        {
          sampledValue: expect.arrayContaining([
            expect.objectContaining({ value: "160" }),
          ]),
        },
      ],
    });
  });

  test("queues MeterValues when the outbound request disconnects before a response", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      rejected(
        "MeterValues",
        new SessionError("OUTBOUND_REQUEST_DISCONNECTED", "连接已断开，未收到响应"),
      ),
      response("Heartbeat", {}),
      response("MeterValues", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    const start = await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const disconnected = await protocolRuntime.reportMeterValue({
      transactionId: start.status === "Accepted" ? start.transactionId : "",
      meterWh: 150,
    });

    expect(disconnected).toMatchObject({
      outcome: "Accepted",
      ocppTransactionId: 1001,
      meterWh: 150,
      platformCommunicationStatus: "offline",
    });
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "MeterValues",
    ]);

    await protocolRuntime.sendHeartbeat();

    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "MeterValues",
      "Heartbeat",
      "MeterValues",
      "StatusNotification",
    ]);
    expect(session.requests.filter((request) => request.action === "StartTransaction"))
      .toHaveLength(1);
  });

  test("rejects transaction MeterValues when transaction id is not a valid OCPP id", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([bootAccepted()]);
    const context = runtimeContext(protocolRuntime);
    context.transactions.set(
      "transaction-1",
      new Transaction({
          id: "transaction-1",
          target: {
            scope: "connector",
            chargingPointId: "cp-1",
            evseId: 1,
            connectorId: 1,
          },
          credentialId: "TAG-1",
          startedAt: new Date("2026-01-01T00:00:00.000Z"),
          startMeterWh: 100,
          latestMeterWh: 100,
          state: "starting",
          chargingState: "idle",
      }),
    );

    await boot(protocolRuntime);
    await expect(protocolRuntime.reportMeterValue({
      transactionId: "transaction-1",
      meterWh: 150,
    })).rejects.toThrow("交易 transaction-1 未绑定有效 OCPP transactionId");
    try {
      await protocolRuntime.reportMeterValue({
        transactionId: "transaction-1",
        meterWh: 150,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolRuntimeError);
      expect(error).toMatchObject({
        code: "PROTOCOL_RUNTIME_TRANSACTION_NOT_BOUND",
        message: "交易 transaction-1 未绑定有效 OCPP transactionId",
      });
    }
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
    ]);
  });

  });

  describe("remote commands", () => {
  test("handles RemoteStartTransaction without sending Authorize", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 2001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
    ]);
    expect(getRuntimeTransaction(protocolRuntime)?.id).toBe("2001");
  });

  test("rejects RemoteStartTransaction before plug-in", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ]);

    await boot(protocolRuntime);
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Rejected" }]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("authorizes RemoteStartTransaction before accepting when configured", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("Authorize", {
        idTagInfo: { status: "Accepted" },
      }),
      response("StartTransaction", {
        transactionId: 2001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "AuthorizeRemoteTxRequests",
            value: "true",
            valueType: "boolean",
          },
        ],
      },
    });

    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "Authorize",
      "StartTransaction",
      "StatusNotification",
    ]);
  });

  test("rejects RemoteStartTransaction and skips StartTransaction when remote authorization is rejected", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("Authorize", {
        idTagInfo: { status: "Invalid" },
      }),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "AuthorizeRemoteTxRequests",
            value: "true",
            valueType: "boolean",
          },
        ],
      },
    });

    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Rejected" }]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "Authorize",
    ]);
  });

  test("emits rejected transaction event when remote authorization fails", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      error("Authorize", "authorize timeout"),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "AuthorizeRemoteTxRequests",
            value: "true",
            valueType: "boolean",
          },
        ],
      },
    });

    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const events = collectRuntimeEvents(protocolRuntime);
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Rejected" }]);
    expect(events.filter((event) => event.type === "authorization.status"))
      .toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: { scope: "transaction", evseId: 1, connectorId: 1 },
      previousStatus: null,
      currentStatus: "rejected",
      reason: "Authorize 请求失败",
      error: {
        code: "InternalError",
        message: "authorize timeout",
      },
    }));
  });

  test("uses the first startable connector for RemoteStartTransaction without connectorId", async () => {
    const chargingPoint = createMultiEvseChargingPoint([
      { evseId: 1, connectorId: 2 },
      { evseId: 2, connectorId: 1 },
    ]);
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 2001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], {
      chargingPoint,
    });

    await boot(protocolRuntime);
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 2 });
    await protocolRuntime.plugConnector({ evseId: 2, connectorId: 1 });
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      idTag: "REMOTE",
      chargingProfile: {
        chargingProfileId: 1,
        stackLevel: 0,
        chargingProfilePurpose: "TxProfile",
        chargingProfileKind: "Relative",
        chargingSchedule: {
          chargingRateUnit: "W",
          chargingSchedulePeriod: [{ startPeriod: 0, limit: 3200 }],
        },
      },
    });
    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(session.requests.find((item) => item.action === "StartTransaction")?.payload)
      .toMatchObject({
      connectorId: 1,
      idTag: "REMOTE",
    });
  });

  test("keeps the connector plugged when remote StartTransaction is rejected", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 2001,
        idTagInfo: { status: "Invalid" },
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    await plugConnector(protocolRuntime);
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    await protocolRuntime.handleInboundRequest(request);

    const connector = getConnectorFact(protocolRuntime);
    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(connector?.status).toBe("occupied");
    expect(connector?.plugState).toBe("plugged");
    expect(listRuntimeTransactions(protocolRuntime)).toEqual([]);
  });

  test("rejects RemoteStartTransaction when no connector is available", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ], {
      chargingPoint: createChargingPoint({
        availability: "inoperative",
      }),
    });

    await boot(protocolRuntime);
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      idTag: "REMOTE",
    });
    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Rejected" }]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("handles RemoteStopTransaction and rejects unknown transactions", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    const accepted = new FakeInboundRequest("RemoteStopTransaction", {
      transactionId: 1001,
    });
    await protocolRuntime.handleInboundRequest(accepted);
    expect(accepted.responses).toEqual([{ status: "Accepted" }]);
    expect(getRuntimeTransaction(protocolRuntime)?.state).toBe("ended");

    const rejected = new FakeInboundRequest("RemoteStopTransaction", {
      transactionId: 9999,
    });
    await protocolRuntime.handleInboundRequest(rejected);
    expect(rejected.responses).toEqual([{ status: "Rejected" }]);
  });

  test("keeps a remote-stopped transaction ended when StopTransaction report fails", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      error("StopTransaction", "stop rejected"),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    const accepted = new FakeInboundRequest("RemoteStopTransaction", {
      transactionId: 1001,
    });
    await protocolRuntime.handleInboundRequest(accepted);

    expect(accepted.responses).toEqual([{ status: "Accepted" }]);
    expect(getRuntimeTransaction(protocolRuntime)?.state).toBe("ended");
  });

  test("handles UnlockConnector by unlocking the target connector", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ], {
      chargingPoint: createChargingPoint({
        lockState: "locked",
        plugState: "plugged",
        vehiclePresence: "detected",
      }),
    });

    await boot(protocolRuntime);
    const request = new FakeInboundRequest("UnlockConnector", {
      connectorId: 1,
    });
    await protocolRuntime.handleInboundRequest(request);

    const connector = getConnectorFact(protocolRuntime);
    expect(request.responses).toEqual([{ status: "Unlocked" }]);
    expect(request.rejections).toEqual([]);
    expect(connector?.lockState).toBe("unlocked");
    expect(connector?.plugState).toBe("plugged");
    expect(connector?.vehiclePresence).toBe("detected");
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("stops an active transaction with UnlockCommand when UnlockConnector succeeds", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
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
        lockState: "locked",
      }),
    });

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });

    const request = new FakeInboundRequest("UnlockConnector", {
      connectorId: 1,
    });
    await protocolRuntime.handleInboundRequest(request);

    const connector = getConnectorFact(protocolRuntime);
    const stopTransactionRequest = session.requests.find(
      (item) => item.action === "StopTransaction",
    );
    expect(request.responses).toEqual([{ status: "Unlocked" }]);
    expect(stopTransactionRequest?.payload).toMatchObject({
      transactionId: 1001,
      reason: "UnlockCommand",
    });
    expect(getRuntimeTransaction(protocolRuntime)?.state).toBe("ended");
    expect(connector?.lockState).toBe("unlocked");
    expect(connector?.plugState).toBe("plugged");
    expect(connector?.vehiclePresence).toBe("detected");
  });

  test("returns NotSupported for UnlockConnector when the connector is not addressable", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
    ]);

    await boot(protocolRuntime);
    const zero = new FakeInboundRequest("UnlockConnector", {
      connectorId: 0,
    });
    const missing = new FakeInboundRequest("UnlockConnector", {
      connectorId: 2,
    });
    await protocolRuntime.handleInboundRequest(zero);
    await protocolRuntime.handleInboundRequest(missing);

    expect(zero.responses).toEqual([{ status: "NotSupported" }]);
    expect(missing.responses).toEqual([{ status: "NotSupported" }]);
    expect(zero.rejections).toEqual([]);
    expect(missing.rejections).toEqual([]);
  });

  test("returns UnlockFailed for UnlockConnector before protocol registration", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      chargingPoint: createChargingPoint({
        lockState: "locked",
      }),
    });
    const request = new FakeInboundRequest("UnlockConnector", {
      connectorId: 1,
    });

    await protocolRuntime.handleInboundRequest(request);

    const connector = getConnectorFact(protocolRuntime);
    expect(request.responses).toEqual([{ status: "UnlockFailed" }]);
    expect(request.rejections).toEqual([]);
    expect(connector?.lockState).toBe("locked");
  });

  });

  describe("configuration and local authorization list", () => {
  test("handles GetConfiguration before protocol registration", async () => {
    const { protocolRuntime } = createProtocolRuntime([]);
    const request = new FakeInboundRequest("GetConfiguration", {
      key: ["HeartbeatInterval"],
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([
      {
        configurationKey: [
          {
            key: "HeartbeatInterval",
            readonly: false,
            value: "60",
          },
        ],
      },
    ]);
    expect(request.rejections).toEqual([]);
  });

  test("lists all configurations when GetConfiguration keys are omitted or empty", async () => {
    const { protocolRuntime } = createProtocolRuntime([]);
    const omitted = new FakeInboundRequest("GetConfiguration", {});
    const empty = new FakeInboundRequest("GetConfiguration", { key: [] });

    await protocolRuntime.handleInboundRequest(omitted);
    await protocolRuntime.handleInboundRequest(empty);

    const omittedKeys = ((omitted.responses[0] as {
      configurationKey?: Array<{ key: string }>;
    }).configurationKey ?? []).map((entry) => entry.key);
    const emptyKeys = ((empty.responses[0] as {
      configurationKey?: Array<{ key: string }>;
    }).configurationKey ?? []).map((entry) => entry.key);

    expect(omittedKeys).toEqual(emptyKeys);
    expect(omittedKeys.length).toBeGreaterThan(20);
    expect(omittedKeys[0]).toBe("AllowOfflineTxForUnknownId");
    expect(omittedKeys).toContain("HeartbeatInterval");
    expect(omittedKeys).toContain("SupportedFileTransferProtocols");
    expect(omitted.responses[0]).not.toHaveProperty("unknownKey");
    expect(empty.responses[0]).not.toHaveProperty("unknownKey");
    expect(omitted.rejections).toEqual([]);
    expect(empty.rejections).toEqual([]);
  });

  test("returns known and unknown GetConfiguration keys once in request order", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "CustomConfig",
            value: "enabled",
          },
        ],
      },
    });
    const request = new FakeInboundRequest("GetConfiguration", {
      key: [
        "HeartbeatInterval",
        "MissingConfig",
        "HeartbeatInterval",
        "CustomConfig",
        "MissingConfig",
      ],
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([
      {
        configurationKey: [
          {
            key: "HeartbeatInterval",
            readonly: false,
            value: "60",
          },
          {
            key: "CustomConfig",
            readonly: false,
            value: "enabled",
          },
        ],
        unknownKey: ["MissingConfig"],
      },
    ]);
    expect(request.rejections).toEqual([]);
  });

  test("rejects GetConfiguration when requested key count exceeds max keys", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "GetConfigurationMaxKeys",
            value: "2",
            valueType: "integer",
            minValue: 1,
            readonly: true,
          },
        ],
      },
    });
    const request = new FakeInboundRequest("GetConfiguration", {
      key: ["HeartbeatInterval", "NumberOfConnectors", "CustomConfig"],
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([]);
    expect(request.rejections).toEqual([
      {
        errorCode: "OccurrenceConstraintViolation",
        message: "GetConfiguration.req key 数量超过 GetConfigurationMaxKeys",
        details: {
          requestedKeys: 3,
          maxKeys: 2,
        },
      },
    ]);
  });

  test("returns -1 for GetLocalListVersion when local auth list is unsupported", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListUnsupportedConfiguration(),
    });
    const request = new FakeInboundRequest("GetLocalListVersion", {});

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ listVersion: -1 }]);
    expect(request.rejections).toEqual([]);
  });

  test("returns current local authorization list version when supported", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "LocalAuthListEnabled",
            value: "true",
            valueType: "boolean",
          },
          {
            key: "LocalAuthListMaxLength",
            value: "3",
            valueType: "integer",
            minValue: 0,
            readonly: true,
          },
        ],
      },
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      7,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      ["TAG-1"],
    );
    const request = new FakeInboundRequest("GetLocalListVersion", {});

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ listVersion: 7 }]);
    expect(request.rejections).toEqual([]);
  });

  test("uses current LocalAuthListEnabled configuration for GetLocalListVersion", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "LocalAuthListMaxLength",
            value: "3",
            valueType: "integer",
            minValue: 0,
            readonly: true,
          },
        ],
      },
    });
    const change = new FakeInboundRequest("ChangeConfiguration", {
      key: "LocalAuthListEnabled",
      value: "true",
    });
    const read = new FakeInboundRequest("GetLocalListVersion", {});

    await protocolRuntime.handleInboundRequest(change);
    await protocolRuntime.handleInboundRequest(read);

    expect(change.responses).toEqual([{ status: "Accepted" }]);
    expect(read.responses).toEqual([{ listVersion: 0 }]);
    expect(read.rejections).toEqual([]);
  });

  test("returns NotSupported for SendLocalList when local auth list is unsupported", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListUnsupportedConfiguration(),
    });
    const request = new FakeInboundRequest("SendLocalList", {
      listVersion: 1,
      updateType: "Full",
      localAuthorizationList: [
        {
          idTag: "TAG-1",
          idTagInfo: { status: "Accepted" },
        },
      ],
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "NotSupported" }]);
    expect(request.rejections).toEqual([]);
    expect(runtimeContext(protocolRuntime).localAuthorizationList.version).toBe(0);
    expect(runtimeContext(protocolRuntime).localAuthorizationList.listEntries())
      .toEqual([]);
  });

  test("handles Full SendLocalList by replacing entries and updating version", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration(),
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      1,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      ["OLD"],
    );
    const request = new FakeInboundRequest("SendLocalList", {
      listVersion: 2,
      updateType: "Full",
      localAuthorizationList: [
        {
          idTag: "TAG-1",
          idTagInfo: { status: "Accepted" },
        },
        {
          idTag: "TAG-2",
          idTagInfo: {
            status: "Blocked",
            expiryDate: "2026-06-01T00:00:00.000Z",
            parentIdTag: "GROUP-1",
          },
        },
      ],
    });
    const read = new FakeInboundRequest("GetLocalListVersion", {});

    await protocolRuntime.handleInboundRequest(request);
    await protocolRuntime.handleInboundRequest(read);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(request.rejections).toEqual([]);
    expect(read.responses).toEqual([{ listVersion: 2 }]);
    expect(context.localAuthorizationList.listEntries()).toEqual([
      "TAG-1",
      "TAG-2",
    ]);
    expect(context.localAuthorizationList.getEntry("TAG-2")).toEqual({
      credentialId: "TAG-2",
      status: "blocked",
      validUntil: new Date("2026-06-01T00:00:00.000Z"),
      groupCredentialId: "GROUP-1",
    });
  });

  test("handles empty Full SendLocalList by clearing entries", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration(),
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      2,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      ["TAG-1"],
    );
    const request = new FakeInboundRequest("SendLocalList", {
      listVersion: 3,
      updateType: "Full",
      localAuthorizationList: [],
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(context.localAuthorizationList.version).toBe(3);
    expect(context.localAuthorizationList.listEntries()).toEqual([]);
  });

  test("handles Differential SendLocalList by applying additions and removals", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration(),
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      4,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      ["KEEP", "REMOVE"],
    );
    const request = new FakeInboundRequest("SendLocalList", {
      listVersion: 5,
      updateType: "Differential",
      localAuthorizationList: [
        {
          idTag: "ADD",
          idTagInfo: { status: "Accepted" },
        },
        {
          idTag: "REMOVE",
        },
      ],
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(context.localAuthorizationList.version).toBe(5);
    expect(context.localAuthorizationList.listEntries()).toEqual([
      "KEEP",
      "ADD",
    ]);
  });

  test("applies repeated Full SendLocalList entries in request order", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration(),
    });
    const context = runtimeContext(protocolRuntime);
    const request = new FakeInboundRequest("SendLocalList", {
      listVersion: 1,
      updateType: "Full",
      localAuthorizationList: [
        { idTag: "TAG-1", idTagInfo: { status: "Accepted" } },
        { idTag: "TAG-2", idTagInfo: { status: "Accepted" } },
        { idTag: "TAG-1", idTagInfo: { status: "Blocked" } },
      ],
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(context.localAuthorizationList.listEntries()).toEqual([
      "TAG-2",
      "TAG-1",
    ]);
  });

  test("rejects stale Differential SendLocalList with VersionMismatch", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration(),
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      5,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      ["KEEP"],
    );
    const sameVersion = new FakeInboundRequest("SendLocalList", {
      listVersion: 5,
      updateType: "Differential",
      localAuthorizationList: [
        {
          idTag: "ADD",
          idTagInfo: { status: "Accepted" },
        },
      ],
    });
    const olderVersion = new FakeInboundRequest("SendLocalList", {
      listVersion: 4,
      updateType: "Differential",
      localAuthorizationList: [
        {
          idTag: "ADD",
          idTagInfo: { status: "Accepted" },
        },
      ],
    });

    await protocolRuntime.handleInboundRequest(sameVersion);
    await protocolRuntime.handleInboundRequest(olderVersion);

    expect(sameVersion.responses).toEqual([{ status: "VersionMismatch" }]);
    expect(olderVersion.responses).toEqual([{ status: "VersionMismatch" }]);
    expect(context.localAuthorizationList.version).toBe(5);
    expect(context.localAuthorizationList.listEntries()).toEqual(["KEEP"]);
  });

  test("rejects invalid SendLocalList requests without changing state", async () => {
    const { protocolRuntime } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration({
        localMaxLength: 1,
        sendMaxLength: 2,
      }),
    });
    const context = runtimeContext(protocolRuntime);
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      7,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      ["KEEP"],
    );
    const requests = [
      new FakeInboundRequest("SendLocalList", {
        listVersion: -1,
        updateType: "Full",
        localAuthorizationList: [],
      }),
      new FakeInboundRequest("SendLocalList", {
        listVersion: 8,
        updateType: "Full",
        localAuthorizationList: [
          { idTag: "A", idTagInfo: { status: "Accepted" } },
          { idTag: "B", idTagInfo: { status: "Accepted" } },
          { idTag: "C", idTagInfo: { status: "Accepted" } },
        ],
      }),
      new FakeInboundRequest("SendLocalList", {
        listVersion: 8,
        updateType: "Full",
        localAuthorizationList: [
          { idTag: "A" },
        ],
      }),
      new FakeInboundRequest("SendLocalList", {
        listVersion: 8,
        updateType: "Differential",
        localAuthorizationList: [
          { idTag: "ADD", idTagInfo: { status: "Accepted" } },
        ],
      }),
    ];

    for (const request of requests) {
      await protocolRuntime.handleInboundRequest(request);
      expect(request.responses).toEqual([{ status: "Failed" }]);
      expect(request.rejections).toEqual([]);
      expect(context.localAuthorizationList.version).toBe(7);
      expect(context.localAuthorizationList.listEntries()).toEqual(["KEEP"]);
    }
  });

  test("keeps SendLocalList limited to local list state", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration(),
    });
    const events = collectRuntimeEvents(protocolRuntime);
    const request = new FakeInboundRequest("SendLocalList", {
      listVersion: 1,
      updateType: "Full",
      localAuthorizationList: [
        {
          idTag: "TAG-1",
          idTagInfo: { status: "Accepted" },
        },
      ],
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(session.requests).toEqual([]);
    expect(events).toEqual([]);
  });

  test("clears cached authorization grants without clearing local authorization list", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([], {
      configurationCatalog: localAuthorizationListConfiguration(),
    });
    const events = collectRuntimeEvents(protocolRuntime);
    const context = runtimeContext(protocolRuntime);
    context.authorizationGrants.set(
      "CACHE-1\u00001",
      new AuthorizationGrant({
        credentialId: "CACHE-1",
        status: "accepted",
        allowedEvseIds: [1],
        source: "cache",
        isCacheEntry: true,
        lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );
    context.authorizationGrants.set(
      "ONLINE-1\u00001",
      new AuthorizationGrant({
        credentialId: "ONLINE-1",
        status: "accepted",
        allowedEvseIds: [1],
        source: "online",
        lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );
    context.authorizationCache.set(
      "CACHE-2\u00001",
      new AuthorizationGrant({
        credentialId: "CACHE-2",
        status: "accepted",
        allowedEvseIds: [1],
        source: "cache",
        isCacheEntry: true,
        lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );
    context.localAuthorizationList = context.localAuthorizationList.replaceEntries(
      2,
      new Date("2026-01-01T00:00:00.000Z"),
      "ocpp16",
      ["LOCAL-1"],
    );
    const request = new FakeInboundRequest("ClearCache", {});

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(request.rejections).toEqual([]);
    expect([...context.authorizationGrants.keys()]).toEqual(["ONLINE-1\u00001"]);
    expect([...context.authorizationCache.keys()]).toEqual([]);
    expect(context.localAuthorizationList.version).toBe(2);
    expect(context.localAuthorizationList.listEntries()).toEqual(["LOCAL-1"]);
    expect(session.requests).toEqual([]);
    expect(events).toEqual([]);
  });

  test("handles ChangeConfiguration before protocol registration and exposes the updated value", async () => {
    const { protocolRuntime } = createProtocolRuntime([]);
    const change = new FakeInboundRequest("ChangeConfiguration", {
      key: "MeterValueSampleInterval",
      value: "15",
    });
    const read = new FakeInboundRequest("GetConfiguration", {
      key: ["MeterValueSampleInterval"],
    });

    await protocolRuntime.handleInboundRequest(change);
    await protocolRuntime.handleInboundRequest(read);

    expect(change.responses).toEqual([{ status: "Accepted" }]);
    expect(change.rejections).toEqual([]);
    expect(read.responses).toEqual([
      {
        configurationKey: [
          {
            key: "MeterValueSampleInterval",
            readonly: false,
            value: "15",
          },
        ],
      },
    ]);
  });

  test("maps ChangeConfiguration statuses and preserves rejected values", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "RebootConfig",
            value: "off",
            rebootRequired: true,
          },
          {
            key: "BoundedInteger",
            value: "1",
            valueType: "integer",
            minValue: 1,
            maxValue: 3,
          },
        ],
      },
    });
    const unknown = new FakeInboundRequest("ChangeConfiguration", {
      key: "MissingConfig",
      value: "enabled",
    });
    const readonly = new FakeInboundRequest("ChangeConfiguration", {
      key: "NumberOfConnectors",
      value: "2",
    });
    const invalidBoolean = new FakeInboundRequest("ChangeConfiguration", {
      key: "AuthorizeRemoteTxRequests",
      value: "maybe",
    });
    const outOfRange = new FakeInboundRequest("ChangeConfiguration", {
      key: "BoundedInteger",
      value: "4",
    });
    const rebootRequired = new FakeInboundRequest("ChangeConfiguration", {
      key: "RebootConfig",
      value: "on",
    });

    await protocolRuntime.handleInboundRequest(unknown);
    await protocolRuntime.handleInboundRequest(readonly);
    await protocolRuntime.handleInboundRequest(invalidBoolean);
    await protocolRuntime.handleInboundRequest(outOfRange);
    await protocolRuntime.handleInboundRequest(rebootRequired);

    expect(unknown.responses).toEqual([{ status: "NotSupported" }]);
    expect(readonly.responses).toEqual([{ status: "Rejected" }]);
    expect(invalidBoolean.responses).toEqual([{ status: "Rejected" }]);
    expect(outOfRange.responses).toEqual([{ status: "Rejected" }]);
    expect(rebootRequired.responses).toEqual([{ status: "RebootRequired" }]);
    expect(getConfigurationValue(protocolRuntime, "NumberOfConnectors")).toBe("1");
    expect(getConfigurationValue(protocolRuntime, "AuthorizeRemoteTxRequests"))
      .toBe("false");
    expect(getConfigurationValue(protocolRuntime, "BoundedInteger")).toBe("1");
    expect(getConfigurationValue(protocolRuntime, "RebootConfig")).toBe("on");
    expect(session.requests).toEqual([]);
  });

  });

  describe("runtime configuration effects", () => {
  test("rejects zero HeartbeatInterval and keeps the running heartbeat loop unchanged", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", {}),
    ]);
    await boot(protocolRuntime);
    protocolRuntime.startHeartbeatLoop();
    const change = new FakeInboundRequest("ChangeConfiguration", {
      key: "HeartbeatInterval",
      value: "0",
    });

    await protocolRuntime.handleInboundRequest(change);
    vi.advanceTimersByTime(30_000);
    await flushMicrotasks();

    expect(change.responses).toEqual([{ status: "Rejected" }]);
    expect(getConfigurationValue(protocolRuntime, "HeartbeatInterval"))
      .toBe("30");
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Heartbeat",
    ]);
  });

  test("restarts the running heartbeat loop after HeartbeatInterval changes", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", {}),
    ]);
    await boot(protocolRuntime);
    protocolRuntime.startHeartbeatLoop();
    const change = new FakeInboundRequest("ChangeConfiguration", {
      key: "HeartbeatInterval",
      value: "5",
    });

    await protocolRuntime.handleInboundRequest(change);
    vi.advanceTimersByTime(4_999);
    await flushMicrotasks();
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
    ]);

    vi.advanceTimersByTime(1);
    await flushMicrotasks();

    expect(change.responses).toEqual([{ status: "Accepted" }]);
    expect(session.requests.map((request) => request.action)).toEqual([
      "BootNotification",
      "Heartbeat",
    ]);
  });

  test("restarts active MeterValues loops after MeterValueSampleInterval changes", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "MeterValueSampleInterval",
            value: "10",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
      chargingPoint: createChargingPoint({
        maxVoltage: 120,
        maxCurrent: 60,
      }),
    });
    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const change = new FakeInboundRequest("ChangeConfiguration", {
      key: "MeterValueSampleInterval",
      value: "2",
    });

    await protocolRuntime.handleInboundRequest(change);
    vi.advanceTimersByTime(1_999);
    await flushMicrotasks();
    expect(session.requests.filter((request) => request.action === "MeterValues"))
      .toHaveLength(0);

    vi.advanceTimersByTime(1);
    await flushMicrotasks();

    expect(change.responses).toEqual([{ status: "Accepted" }]);
    const meterRequest = session.requests.find((request) =>
      request.action === "MeterValues"
    );
    expect((meterRequest?.payload as {
      meterValue: Array<{ sampledValue: Array<{ value: string }> }>;
    }).meterValue[0]?.sampledValue[0]?.value).toBe("104");
  });

  test("stops active MeterValues loops when MeterValueSampleInterval changes to zero", async () => {
    vi.useFakeTimers();
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "MeterValueSampleInterval",
            value: "2",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
    });
    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const change = new FakeInboundRequest("ChangeConfiguration", {
      key: "MeterValueSampleInterval",
      value: "0",
    });

    await protocolRuntime.handleInboundRequest(change);
    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();

    expect(change.responses).toEqual([{ status: "Accepted" }]);
    expect(session.requests.some((request) => request.action === "MeterValues"))
      .toBe(false);
  });

  test("accepts ChangeAvailability for an idle connector and reports unavailable", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ]);
    await boot(protocolRuntime);
    const request = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 1,
      type: "Inoperative",
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(request.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);
    expect(session.requests[1]?.payload).toMatchObject({
      connectorId: 1,
      status: "Unavailable",
    });
    const [evse] = listRuntimeEvses(protocolRuntime);
    const [connector] = evse?.listConnectors() ?? [];
    expect(evse?.availability).toBe("inoperative");
    expect(connector?.availability).toBe("inoperative");
    expect(connector?.status).toBe("unavailable");
  });

  test("accepts ChangeAvailability for a plugged connector without active transaction", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
    ]);
    await boot(protocolRuntime);
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
    const request = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 1,
      type: "Inoperative",
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(session.requests[2]?.payload).toMatchObject({
      connectorId: 1,
      status: "Unavailable",
    });
    const [evse] = listRuntimeEvses(protocolRuntime);
    const [connector] = evse?.listConnectors() ?? [];
    expect(evse?.availability).toBe("inoperative");
    expect(evse?.requestedAvailability).toBeNull();
    expect(connector?.availability).toBe("inoperative");
    expect(connector?.requestedAvailability).toBeNull();
    expect(connector?.plugState).toBe("plugged");
    expect(connector?.vehiclePresence).toBe("detected");
    expect(connector?.status).toBe("unavailable");
  });

  test("schedules ChangeAvailability until the active transaction stops", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const request = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 1,
      type: "Inoperative",
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Scheduled" }]);
    let [evse] = listRuntimeEvses(protocolRuntime);
    let [connector] = evse?.listConnectors() ?? [];
    expect(evse?.availability).toBe("operative");
    expect(evse?.requestedAvailability).toBe("inoperative");
    expect(connector?.availability).toBe("operative");
    expect(connector?.requestedAvailability).toBe("inoperative");
    expect(connector?.status).toBe("occupied");

    await protocolRuntime.stopTransaction({
      transactionId: "1001",
      reason: "remote",
      meterStopWh: 100,
    });

    [evse] = listRuntimeEvses(protocolRuntime);
    [connector] = evse?.listConnectors() ?? [];
    expect(evse?.availability).toBe("inoperative");
    expect(evse?.requestedAvailability).toBeNull();
    expect(connector?.availability).toBe("inoperative");
    expect(connector?.requestedAvailability).toBeNull();
    expect(connector?.plugState).toBe("plugged");
    expect(connector?.vehiclePresence).toBe("detected");
    expect(connector?.status).toBe("unavailable");
    expect(session.requests.at(-1)?.payload).toMatchObject({
      connectorId: 1,
      status: "Unavailable",
    });
  });

  test("accepts operative ChangeAvailability while busy and clears pending availability", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ]);

    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const inoperative = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 1,
      type: "Inoperative",
    });
    await protocolRuntime.handleInboundRequest(inoperative);
    expect(inoperative.responses).toEqual([{ status: "Scheduled" }]);

    const operative = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 1,
      type: "Operative",
    });
    await protocolRuntime.handleInboundRequest(operative);

    expect(operative.responses).toEqual([{ status: "Accepted" }]);
    let [evse] = listRuntimeEvses(protocolRuntime);
    let [connector] = evse?.listConnectors() ?? [];
    expect(evse?.requestedAvailability).toBeNull();
    expect(connector?.requestedAvailability).toBeNull();
    expect(connector?.availability).toBe("operative");
    expect(evse?.availability).toBe("operative");
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
    ]);
  });

  test("accepts ChangeAvailability for a reserved connector and clears the reservation", async () => {
    const chargingPoint = createChargingPoint().updateEvse(1, (evse) =>
      evse.reserve("reservation-1", new Date("2026-01-01T00:00:00.000Z"))
    );
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ], {
      chargingPoint,
    });
    await boot(protocolRuntime);
    const request = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 1,
      type: "Inoperative",
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    const [evse] = listRuntimeEvses(protocolRuntime);
    const [connector] = evse?.listConnectors() ?? [];
    expect(evse?.activeReservationId).toBeNull();
    expect(evse?.availability).toBe("inoperative");
    expect(connector?.availability).toBe("inoperative");
    expect(session.requests[1]?.payload).toMatchObject({
      connectorId: 1,
      status: "Unavailable",
    });
  });

  test("schedules mixed charging point ChangeAvailability while applying non-transaction targets immediately", async () => {
    const chargingPoint = createMultiEvseChargingPoint([
      { evseId: 1, connectorId: 1 },
      { evseId: 2, connectorId: 2 },
      { evseId: 3, connectorId: 3 },
    ]).updateEvse(2, (evse) =>
      evse.reserve("reservation-2", new Date("2026-01-01T00:00:00.000Z"))
    );
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StatusNotification", {}),
      response("StopTransaction", {}),
      response("StatusNotification", {}),
    ], {
      chargingPoint,
    });
    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime);
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    await protocolRuntime.plugConnector({ evseId: 3, connectorId: 3 });
    const request = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 0,
      type: "Inoperative",
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Scheduled" }]);
    expect(session.requests.slice(5, 8).map((item) => item.payload)).toEqual([
      expect.objectContaining({ connectorId: 0, status: "Unavailable" }),
      expect.objectContaining({ connectorId: 2, status: "Unavailable" }),
      expect.objectContaining({ connectorId: 3, status: "Unavailable" }),
    ]);
    let state = runtimeState(protocolRuntime);
    expect(state.chargingPoint.availability).toBe("inoperative");
    let [busyEvse, reservedEvse, pluggedEvse] = state.chargingPoint.evses;
    let [busyConnector] = busyEvse?.listConnectors() ?? [];
    let [reservedConnector] = reservedEvse?.listConnectors() ?? [];
    let [pluggedConnector] = pluggedEvse?.listConnectors() ?? [];
    expect(busyEvse?.availability).toBe("operative");
    expect(busyEvse?.requestedAvailability).toBe("inoperative");
    expect(busyConnector?.availability).toBe("operative");
    expect(busyConnector?.requestedAvailability).toBe("inoperative");
    expect(reservedEvse?.activeReservationId).toBeNull();
    expect(reservedEvse?.availability).toBe("inoperative");
    expect(reservedConnector?.availability).toBe("inoperative");
    expect(pluggedEvse?.availability).toBe("inoperative");
    expect(pluggedConnector?.availability).toBe("inoperative");
    expect(pluggedConnector?.plugState).toBe("plugged");
    expect(pluggedConnector?.vehiclePresence).toBe("detected");

    await protocolRuntime.stopTransaction({
      transactionId: "1001",
      reason: "remote",
      meterStopWh: 100,
    });

    state = runtimeState(protocolRuntime);
    [busyEvse] = state.chargingPoint.evses;
    [busyConnector] = busyEvse?.listConnectors() ?? [];
    expect(busyEvse?.availability).toBe("inoperative");
    expect(busyEvse?.requestedAvailability).toBeNull();
    expect(busyConnector?.availability).toBe("inoperative");
    expect(busyConnector?.requestedAvailability).toBeNull();
    expect(busyConnector?.plugState).toBe("plugged");
    expect(busyConnector?.vehiclePresence).toBe("detected");
    expect(session.requests.at(-1)?.payload).toMatchObject({
      connectorId: 1,
      status: "Unavailable",
    });
  });

  test("rejects ChangeAvailability before registration or for unknown connectors", async () => {
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
    ]);
    const beforeBoot = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 1,
      type: "Inoperative",
    });

    await protocolRuntime.handleInboundRequest(beforeBoot);
    await boot(protocolRuntime);
    const unknownConnector = new FakeInboundRequest("ChangeAvailability", {
      connectorId: 99,
      type: "Inoperative",
    });
    await protocolRuntime.handleInboundRequest(unknownConnector);

    expect(beforeBoot.responses).toEqual([{ status: "Rejected" }]);
    expect(beforeBoot.rejections).toEqual([]);
    expect(unknownConnector.responses).toEqual([{ status: "Rejected" }]);
    expect(unknownConnector.rejections).toEqual([]);
  });

  });

  describe("trigger messages", () => {
  test("handles TriggerMessage Heartbeat after registration", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", {
        currentTime: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    await boot(protocolRuntime);
    const request = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "Heartbeat",
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(request.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "Heartbeat",
    ]);
  });

  test("handles TriggerMessage BootNotification before registration", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ]);
    const request = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "BootNotification",
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(request.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
    ]);
    expect(getConfigurationValue(protocolRuntime, "HeartbeatInterval"))
      .toBe("30");
  });

  test("handles TriggerMessage StatusNotification for a connector", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
    ]);
    await boot(protocolRuntime);
    const request = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "StatusNotification",
      connectorId: 1,
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(request.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "StatusNotification",
    ]);
    expect(session.requests[1]?.payload).toMatchObject({
      connectorId: 1,
      status: "Available",
      errorCode: "NoError",
    });
  });

  test("rejects TriggerMessage StatusNotification for an unknown connector", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ]);
    await boot(protocolRuntime);
    const request = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "StatusNotification",
      connectorId: 99,
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Rejected" }]);
    expect(request.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("handles TriggerMessage MeterValues for an active connector transaction", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
      response("MeterValues", {}),
    ]);
    await boot(protocolRuntime);
    seedAcceptedAuthorization(protocolRuntime, { idTag: "TAG-1" });
    await plugConnector(protocolRuntime);
    await protocolRuntime.startLocalTransaction({
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 100,
    });
    const request = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "MeterValues",
      connectorId: 1,
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(request.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "StatusNotification",
      "StartTransaction",
      "StatusNotification",
      "MeterValues",
    ]);
    expect(session.requests[4]?.payload).toMatchObject({
      connectorId: 1,
      meterValue: [
        {
          sampledValue: [
            {
              value: "100",
              context: "Trigger",
              measurand: "Energy.Active.Import.Register",
              unit: "Wh",
            },
            {
              value: "0",
              context: "Trigger",
              measurand: "Power.Active.Import",
              unit: "W",
            },
            {
              value: "0",
              context: "Trigger",
              measurand: "Current.Import",
              unit: "A",
            },
            {
              value: "0",
              context: "Trigger",
              measurand: "Voltage",
              unit: "V",
            },
          ],
        },
      ],
    });
    expect(session.requests[4]?.payload).not.toHaveProperty("transactionId");
  });

  test("handles TriggerMessage MeterValues without an active transaction", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
      response("MeterValues", {}),
    ]);
    await boot(protocolRuntime);
    const request = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "MeterValues",
      connectorId: 1,
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(request.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
      "MeterValues",
    ]);
    expect(session.requests[1]?.payload).toMatchObject({
      connectorId: 1,
      meterValue: [
        {
          sampledValue: [
            {
              value: "0",
              context: "Trigger",
              measurand: "Energy.Active.Import.Register",
              unit: "Wh",
            },
            {
              value: "0",
              context: "Trigger",
              measurand: "Power.Active.Import",
              unit: "W",
            },
            {
              value: "0",
              context: "Trigger",
              measurand: "Current.Import",
              unit: "A",
            },
            {
              value: "0",
              context: "Trigger",
              measurand: "Voltage",
              unit: "V",
            },
          ],
        },
      ],
    });
    expect(session.requests[1]?.payload).not.toHaveProperty("transactionId");
  });

  test("rejects TriggerMessage MeterValues for an unknown connector", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ]);
    await boot(protocolRuntime);
    const request = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "MeterValues",
      connectorId: 99,
    });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([{ status: "Rejected" }]);
    expect(request.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("returns NotImplemented for TriggerMessage requests without runtime support", async () => {
    const { protocolRuntime, session } = createProtocolRuntime([
      bootAccepted(),
    ]);
    await boot(protocolRuntime);
    const diagnostics = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "DiagnosticsStatusNotification",
    });
    const firmware = new FakeInboundRequest("TriggerMessage", {
      requestedMessage: "FirmwareStatusNotification",
    });

    await protocolRuntime.handleInboundRequest(diagnostics);
    await protocolRuntime.handleInboundRequest(firmware);

    expect(diagnostics.responses).toEqual([{ status: "NotImplemented" }]);
    expect(firmware.responses).toEqual([{ status: "NotImplemented" }]);
    expect(diagnostics.rejections).toEqual([]);
    expect(firmware.rejections).toEqual([]);
    expect(session.requests.map((item) => item.action)).toEqual([
      "BootNotification",
    ]);
  });

  test("rejects unsupported inbound actions", async () => {
    const { protocolRuntime } = createProtocolRuntime([]);
    const request = new FakeInboundRequest("Reset", { type: "Soft" });

    await protocolRuntime.handleInboundRequest(request);

    expect(request.responses).toEqual([]);
    expect(request.rejections).toEqual([
      {
        errorCode: "NotSupported",
        message: "Reset 暂不支持",
        details: undefined,
      },
    ]);
  });

  test("writes inbound command diagnostics for supported and unsupported commands", async () => {
    const diagnostics: Ocpp16RuntimeDiagnostic[] = [];
    const { protocolRuntime } = createProtocolRuntime([], { diagnostics });
    const supported = new FakeInboundRequest("ClearCache", {}, "command-1");
    const unsupported = new FakeInboundRequest("Reset", { type: "Soft" }, "command-2");

    await protocolRuntime.handleInboundRequest(supported);
    await protocolRuntime.handleInboundRequest(unsupported);

    const commandDiagnostics = diagnostics.filter((diagnostic) =>
      diagnostic.context?.category === "command"
    );
    const supportedStarted = commandDiagnostics.find((diagnostic) =>
      diagnostic.context?.name === "ClearCache" &&
      diagnostic.context.phase === "started"
    );
    const supportedCompleted = commandDiagnostics.find((diagnostic) =>
      diagnostic.context?.name === "ClearCache" &&
      diagnostic.context.phase === "completed"
    );

    expect(supportedStarted).toMatchObject({
      level: "info",
      code: "OCPP16_COMMAND_STARTED",
      message: "OCPP 1.6 command started",
      context: {
        category: "command",
        phase: "started",
        name: "ClearCache",
        messageId: "command-1",
        input: {},
      },
    });
    expect(supportedCompleted).toMatchObject({
      level: "info",
      code: "OCPP16_COMMAND_COMPLETED",
      message: "OCPP 1.6 command completed",
      context: {
        category: "command",
        phase: "completed",
        name: "ClearCache",
        messageId: "command-1",
        input: {},
        responsePayload: { status: "Accepted" },
        durationMs: 0,
      },
    });
    expect(supportedCompleted?.context?.operationId).toBe(
      supportedStarted?.context?.operationId,
    );
    expect(commandDiagnostics).toContainEqual(expect.objectContaining({
      level: "warn",
      code: "OCPP16_COMMAND_REJECTED",
      context: expect.objectContaining({
        category: "command",
        phase: "rejected",
        name: "Reset",
        messageId: "command-2",
        input: { type: "Soft" },
        responsePayload: {
          errorCode: "NotSupported",
          message: "Reset 暂不支持",
        },
      }),
    }));
  });

  test("writes failed command diagnostics when the handler rejects the request", async () => {
    const diagnostics: Ocpp16RuntimeDiagnostic[] = [];
    const { protocolRuntime } = createProtocolRuntime([], {
      diagnostics,
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "GetConfigurationMaxKeys",
            value: "2",
            valueType: "integer",
            minValue: 1,
            readonly: true,
          },
        ],
      },
    });
    const payload = {
      key: ["HeartbeatInterval", "NumberOfConnectors", "CustomConfig"],
    };
    const request = new FakeInboundRequest(
      "GetConfiguration",
      payload,
      "command-failed-1",
    );

    await protocolRuntime.handleInboundRequest(request);

    const started = diagnostics.find((diagnostic) =>
      diagnostic.context?.category === "command" &&
      diagnostic.context.name === "GetConfiguration" &&
      diagnostic.context.phase === "started"
    );
    const failed = diagnostics.find((diagnostic) =>
      diagnostic.context?.category === "command" &&
      diagnostic.context.name === "GetConfiguration" &&
      diagnostic.context.phase === "failed"
    );

    expect(failed).toMatchObject({
      level: "error",
      code: "OCPP16_COMMAND_FAILED",
      message: "OCPP 1.6 command failed",
      context: {
        category: "command",
        phase: "failed",
        name: "GetConfiguration",
        messageId: "command-failed-1",
        input: payload,
        responsePayload: {
          errorCode: "OccurrenceConstraintViolation",
          message: "GetConfiguration.req key 数量超过 GetConfigurationMaxKeys",
          details: {
            requestedKeys: 3,
            maxKeys: 2,
          },
        },
        durationMs: 0,
      },
    });
    expect(failed?.context?.operationId).toBe(started?.context?.operationId);
  });

  test("separates accepted remote command diagnostics from follow-up action diagnostics", async () => {
    const diagnostics: Ocpp16RuntimeDiagnostic[] = [];
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("StatusNotification", {}),
      response("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      response("StatusNotification", {}),
    ], { diagnostics });
    await boot(protocolRuntime);
    await protocolRuntime.plugConnector({ evseId: 1, connectorId: 1 });
    const request = new FakeInboundRequest("RemoteStartTransaction", {
      idTag: "TAG-1",
      connectorId: 1,
    }, "remote-start-1");

    await protocolRuntime.handleInboundRequest(request);

    const commandCompletedIndex = diagnostics.findIndex((diagnostic) =>
      diagnostic.context?.category === "command" &&
      diagnostic.context.name === "RemoteStartTransaction" &&
      diagnostic.context.phase === "completed"
    );
    const startActionStartedIndex = diagnostics.findIndex((diagnostic) =>
      diagnostic.context?.category === "action" &&
      diagnostic.context.name === "StartTransaction" &&
      diagnostic.context.phase === "started"
    );

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(commandCompletedIndex).toBeGreaterThan(-1);
    expect(startActionStartedIndex).toBeGreaterThan(-1);
    expect(commandCompletedIndex).toBeLessThan(startActionStartedIndex);
    expect(diagnostics[commandCompletedIndex]).toMatchObject({
      code: "OCPP16_COMMAND_COMPLETED",
      context: {
        category: "command",
        phase: "completed",
        name: "RemoteStartTransaction",
        messageId: "remote-start-1",
        input: {
          idTag: "TAG-1",
          connectorId: 1,
        },
        responsePayload: { status: "Accepted" },
      },
    });
  });

  test("writes heartbeat and rejected authorize action diagnostics", async () => {
    const diagnostics: Ocpp16RuntimeDiagnostic[] = [];
    const { protocolRuntime } = createProtocolRuntime([
      bootAccepted(),
      response("Heartbeat", { currentTime: "2026-01-01T00:00:00.000Z" }),
      response("Authorize", {
        idTagInfo: {
          status: "Invalid",
        },
      }),
    ], { diagnostics });
    await boot(protocolRuntime);

    await protocolRuntime.sendHeartbeat();
    await protocolRuntime.authorize({ connectorId: 1, idTag: "CARD001" });

    const actionDiagnostics = diagnostics.filter((diagnostic) =>
      diagnostic.context?.category === "action"
    );
    expect(actionDiagnostics).toContainEqual(expect.objectContaining({
      code: "OCPP16_ACTION_STARTED",
      context: expect.objectContaining({
        category: "action",
        phase: "started",
        name: "Heartbeat",
      }),
    }));
    expect(actionDiagnostics).toContainEqual(expect.objectContaining({
      level: "info",
      code: "OCPP16_ACTION_COMPLETED",
      context: expect.objectContaining({
        category: "action",
        phase: "completed",
        name: "Heartbeat",
        result: expect.objectContaining({ status: "Accepted" }),
        durationMs: 0,
      }),
    }));
    expect(actionDiagnostics).toContainEqual(expect.objectContaining({
      level: "warn",
      code: "OCPP16_ACTION_REJECTED",
      message: "OCPP 1.6 action rejected",
      context: expect.objectContaining({
        category: "action",
        phase: "rejected",
        name: "Authorize",
        input: { connectorId: 1, idTag: "CARD001" },
        result: expect.objectContaining({
          outcome: "Rejected",
          idTag: "CARD001",
        }),
        durationMs: 0,
      }),
    }));
  });

  });

  describe("lifecycle cleanup", () => {
  test("removes the session inbound listener on dispose", () => {
    const session = new FakeSession([]);
    const protocolRuntime = new Ocpp16Runtime({
      session,
      chargingPoint: createChargingPoint(),
    });
    const request = new FakeInboundRequest("ChangeAvailability", {});

    protocolRuntime.dispose();
    session.emitInboundRequest(request);

    expect(request.rejections).toEqual([]);
  });
  });
});

function createMultiEvseChargingPoint(
  connectors: Array<{ evseId: number; connectorId: number }>,
): ChargingPoint {
  return new ChargingPoint({
    id: "cp-1",
    vendor: "Volt",
    model: "Sim",
    serialNumber: "CP001",
    firmwareVersion: "1.0.0",
    evses: connectors.map((item) =>
      new EVSE({
        id: item.evseId,
        connectors: [
          new Connector({
            id: item.connectorId,
            type: "GBT",
            format: "socket",
            powerType: "ac",
          }),
        ],
      })
    ),
  });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
