import { EventEmitter } from "node:events";
import { afterEach, describe, expect, vi, test } from "vitest";

import { Ocpp16ChargingPointActor } from "../../../src/chargingPointActor/ocpp16/Ocpp16ChargingPointActor";
import { ChargingPointActorError } from "../../../src/chargingPointActor/errors";
import type {
  ChargingPointActorRuntimeLogRecord,
  ChargingPointActorRuntimeLogSink,
  ChargingPointActorEvent,
  ChargingPointActorEventType,
} from "../../../src/chargingPointActor/index.ts";
import {
  SessionError,
  type ISession,
  type OutboundRequestResult,
  type ProtocolMessageEvent,
  type SessionLogEntry,
  type SessionConnectionState,
  type SessionEvents,
} from "../../../src/protocol/session/types.ts";
import type {
  Ocpp16Runtime,
  Ocpp16RuntimeEvent,
  Ocpp16RuntimeEventListener,
  Ocpp16RuntimeOptions,
} from "../../../src/protocol/runtime";
import { ProtocolRuntimeError } from "../../../src/protocol/runtime/ocpp16/errors";
import {
  FakeInboundRequest as RuntimeFakeInboundRequest,
  FakeSession as RuntimeFakeSession,
  bootAccepted as runtimeBootAccepted,
  createChargingPoint,
  error as runtimeError,
  response as runtimeResponse,
} from "../protocolRuntime/ocpp16/helpers";

const ALL_CHARGING_POINT_ACTOR_EVENT_TYPES = [
  "chargingPoint.lifecycle",
  "chargingPoint.boot",
  "session.status",
  "chargingPoint.availability",
  "chargingPoint.status",
  "evse.status",
  "connector.availability",
  "connector.status",
  "authorization.status",
  "transaction.status",
  "transaction.meterValue",
  "protocol.message",
] satisfies ChargingPointActorEventType[];

class FakeSession implements ISession {
  private readonly emitter = new EventEmitter();
  state: SessionConnectionState = "offline";
  connected = false;
  connectCalls = 0;
  disconnectCalls = 0;
  connectError: Error | null = null;
  stateAfterConnectError: SessionConnectionState = "offline";
  emitOnlineDuringConnect = false;

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.connectError !== null) {
      this.state = this.stateAfterConnectError;
      throw this.connectError;
    }

    this.connected = true;
    this.state = "online";
    if (this.emitOnlineDuringConnect) {
      this.emitOnline();
    }
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.connected = false;
    this.state = "offline";
  }

  isConnected(): boolean {
    return this.connected;
  }

  request(_action: string, _payload: unknown): Promise<OutboundRequestResult> {
    throw new Error("request should not be called by actor lifecycle tests");
  }

  on<K extends keyof SessionEvents>(event: K, listener: SessionEvents[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof SessionEvents>(
    event: K,
    listener: SessionEvents[K],
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emitReconnecting(attempt = 1, error?: SessionError): void {
    this.state = "reconnecting";
    this.emitter.emit("reconnecting", attempt, error);
  }

  emitOnline(): void {
    this.connected = true;
    this.state = "online";
    this.emitter.emit("online");
  }

  emitOffline(): void {
    this.connected = false;
    this.state = "offline";
    this.emitter.emit("offline", "unexpected_disconnect");
  }

  emitProtocolMessage(event: ProtocolMessageEvent): void {
    this.emitter.emit("protocolMessage", event);
  }

  emitSessionError(runtimeLog: SessionLogEntry): void {
    this.emitter.emit("sessionError", runtimeLog);
  }
}

class DeferredConnectSession extends FakeSession {
  private resolveConnect: (() => void) | null = null;

  override async connect(): Promise<void> {
    this.connectCalls += 1;
    await new Promise<void>((resolve) => {
      this.resolveConnect = resolve;
    });
    this.connected = true;
    this.state = "online";
    if (this.emitOnlineDuringConnect) {
      this.emitOnline();
    }
  }

  completeConnect(): void {
    this.resolveConnect?.();
  }
}

class FakeProtocolRuntime {
  readonly calls: string[] = [];
  disposed = false;
  runtimeStopped = false;
  private readonly runtimeEventListeners = new Set<Ocpp16RuntimeEventListener>();
  private evseStatus: "available" | "occupied" = "available";
  private chargingPointAvailability: "operative" | "inoperative" = "operative";
  private readonly connectorAvailabilities = new Map<string, "operative" | "inoperative">([
    ["1/1", "operative"],
  ]);
  private readonly connectorStatuses = new Map<string, "available" | "occupied">([
    ["1/1", "available"],
  ]);
  private readonly transactionStates = new Map<string, "active" | "ended">();
  private readonly transactionResources = new Map<string, {
    evseId: number;
    connectorId: number;
    ocppTransactionId: number | null;
  }>();
  bootStatus: "Accepted" | "Pending" | "Rejected" = "Accepted";
  bootResults: Array<{
    status: "Accepted" | "Pending" | "Rejected";
    currentTime: Date;
    interval: number;
  }> = [];
  startLocalTransactionInput: { connectorId: number; idTag: string } | null = null;
  authorizeInput: { connectorId: number; idTag: string } | null = null;
  authorizeResult: Awaited<ReturnType<Ocpp16Runtime["authorize"]>> = {
    outcome: "Accepted",
    idTag: "CARD001",
    authorizationStatus: "Accepted",
    expiryDate: null,
    parentIdTag: null,
    source: "online",
    sentAt: new Date("2026-01-01T00:00:00.000Z"),
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
    consecutiveFailures: 0,
    platformCommunicationStatus: "online",
    shouldReconnect: false,
  };
  startTransactionResult: Awaited<
    ReturnType<Ocpp16Runtime["startLocalTransaction"]>
  > = {
    status: "Accepted",
    transactionId: "1001",
    ocppTransactionId: 1001,
    startTransactionResult: {
      outcome: "Accepted",
      connectorId: 1,
      idTag: "CARD001",
      ocppTransactionId: 1001,
      authorizationStatus: "Accepted",
      expiryDate: null,
      parentIdTag: null,
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
      receivedAt: new Date("2026-01-01T00:00:00.000Z"),
      consecutiveFailures: 0,
      platformCommunicationStatus: "online",
      shouldReconnect: false,
    },
    statusNotificationResults: [],
  };

  async boot() {
    this.calls.push("boot");
    const queuedResult = this.bootResults.shift();
    if (queuedResult !== undefined) {
      return queuedResult;
    }

    return {
      status: this.bootStatus,
      currentTime: new Date("2026-01-01T00:00:00.000Z"),
      interval: 30,
    };
  }

  async reportChargingPointStatus() {
    this.calls.push("reportChargingPointStatus");
    this.emitRuntimeEvent({
      type: "chargingPoint.status",
      resource: { scope: "chargingPoint" },
      previousStatus: null,
      currentStatus: "available",
      occurredAt: now(),
    });
    return {
      outcome: "Accepted" as const,
      connectorId: 0,
      connectorStatus: "Available" as const,
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
      receivedAt: new Date("2026-01-01T00:00:00.000Z"),
      unexpectedResponseFields: [],
      consecutiveFailures: 0 as const,
      platformCommunicationStatus: "online" as const,
      shouldReconnect: false as const,
    };
  }

  async reportConnectorStatus(input: { connectorId: number }) {
    this.calls.push(`reportConnectorStatus:${input.connectorId}`);
    const ref = this.findConnectorRef(input.connectorId);
    this.emitRuntimeEvent({
      type: "connector.status",
      resource: {
        scope: "connector",
        evseId: ref.evseId,
        connectorId: ref.connectorId,
      },
      previousStatus: null,
      currentStatus: this.connectorStatuses.get(`${ref.evseId}/${ref.connectorId}`) ??
        "available",
      occurredAt: now(),
    });
    return {
      outcome: "Accepted" as const,
      connectorId: input.connectorId,
      connectorStatus: "Available" as const,
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
      receivedAt: new Date("2026-01-01T00:00:00.000Z"),
      unexpectedResponseFields: [],
      consecutiveFailures: 0 as const,
      platformCommunicationStatus: "online" as const,
      shouldReconnect: false as const,
    };
  }

  publishChargingPointAvailabilitySnapshot() {
    this.calls.push("publishChargingPointAvailabilitySnapshot");
    this.emitRuntimeEvent({
      type: "chargingPoint.availability",
      resource: { scope: "chargingPoint" },
      previousAvailability: null,
      currentAvailability: this.chargingPointAvailability,
      occurredAt: now(),
    });
  }

  publishConnectorAvailabilitySnapshot(input: {
    evseId: number;
    connectorId: number;
  }) {
    this.calls.push(
      `publishConnectorAvailabilitySnapshot:${input.evseId}/${input.connectorId}`,
    );
    this.emitRuntimeEvent({
      type: "connector.availability",
      resource: {
        scope: "connector",
        evseId: input.evseId,
        connectorId: input.connectorId,
      },
      previousAvailability: null,
      currentAvailability: this.connectorAvailabilities.get(
        `${input.evseId}/${input.connectorId}`,
      ) ?? "operative",
      occurredAt: now(),
    });
  }

  listConnectorRefs() {
    return [...this.connectorStatuses.keys()].map((key) => {
      const [evseId, connectorId] = key.split("/").map(Number);
      return { evseId: evseId ?? 0, connectorId: connectorId ?? 0 };
    });
  }

  setConnectorStatus(
    evseId: number,
    connectorId: number,
    status: "available" | "occupied",
  ): void {
    this.connectorStatuses.set(`${evseId}/${connectorId}`, status);
    if (!this.connectorAvailabilities.has(`${evseId}/${connectorId}`)) {
      this.connectorAvailabilities.set(`${evseId}/${connectorId}`, "operative");
    }
  }

  startHeartbeatLoop(): void {
    this.calls.push("startHeartbeatLoop");
    this.runtimeStopped = false;
  }

  stopRuntime(): void {
    this.calls.push("stopRuntime");
    this.runtimeStopped = true;
  }

  plugConnector(input: { evseId: number; connectorId: number } = {
    evseId: 1,
    connectorId: 1,
  }) {
    this.calls.push("plugConnector");
    const previousConnectorStatus =
      this.connectorStatuses.get(`${input.evseId}/${input.connectorId}`) ??
        "available";
    const previousEvseStatus = this.evseStatus;
    this.connectorStatuses.set(`${input.evseId}/${input.connectorId}`, "occupied");
    this.evseStatus = "occupied";
    this.emitRuntimeEvent({
      type: "connector.status",
      resource: {
        scope: "connector",
        evseId: input.evseId,
        connectorId: input.connectorId,
      },
      previousStatus: previousConnectorStatus,
      currentStatus: "occupied",
      occurredAt: now(),
    });
    if (previousEvseStatus !== this.evseStatus) {
      this.emitRuntimeEvent({
        type: "evse.status",
        resource: { scope: "evse", evseId: input.evseId },
        previousStatus: previousEvseStatus,
        currentStatus: this.evseStatus,
        occurredAt: now(),
      });
    }
    return {
      evseId: input.evseId,
      connectorId: input.connectorId,
      ocppConnectorId: input.connectorId,
      plugState: "plugged" as const,
      vehiclePresence: "detected" as const,
      connectorStatus: "occupied" as const,
    };
  }

  unplugConnector(input: { evseId: number; connectorId: number } = {
    evseId: 1,
    connectorId: 1,
  }) {
    this.calls.push("unplugConnector");
    const previousConnectorStatus =
      this.connectorStatuses.get(`${input.evseId}/${input.connectorId}`) ??
        "occupied";
    const previousEvseStatus = this.evseStatus;
    this.connectorStatuses.set(`${input.evseId}/${input.connectorId}`, "available");
    this.evseStatus = "available";
    this.emitRuntimeEvent({
      type: "connector.status",
      resource: {
        scope: "connector",
        evseId: input.evseId,
        connectorId: input.connectorId,
      },
      previousStatus: previousConnectorStatus,
      currentStatus: "available",
      occurredAt: now(),
    });
    if (previousEvseStatus !== this.evseStatus) {
      this.emitRuntimeEvent({
        type: "evse.status",
        resource: { scope: "evse", evseId: input.evseId },
        previousStatus: previousEvseStatus,
        currentStatus: this.evseStatus,
        occurredAt: now(),
      });
    }
    return {
      evseId: input.evseId,
      connectorId: input.connectorId,
      ocppConnectorId: input.connectorId,
      plugState: "unplugged" as const,
      vehiclePresence: "absent" as const,
      connectorStatus: "available" as const,
    };
  }

  authorize(input: { connectorId: number; idTag: string }) {
    this.calls.push("authorize");
    this.authorizeInput = input;
    if (this.authorizeResult.outcome !== "Failed") {
      this.emitRuntimeEvent({
        type: "authorization.status",
        resource: {
          scope: "authorization",
          idTag: input.idTag,
          evseId: 1,
          connectorId: input.connectorId,
        },
        status: mapAuthorizationStatus(this.authorizeResult.authorizationStatus),
        source: "online",
        protocolStatus: this.authorizeResult.authorizationStatus,
        occurredAt: now(),
      });
    }
    return Promise.resolve(this.authorizeResult);
  }

  startLocalTransaction(input: { connectorId: number; idTag: string }) {
    this.calls.push("startLocalTransaction");
    this.startLocalTransactionInput = input;
    if (this.startTransactionResult.status === "Accepted") {
      this.transactionStates.set(
        this.startTransactionResult.transactionId,
        "active",
      );
      this.transactionResources.set(this.startTransactionResult.transactionId, {
        evseId: 1,
        connectorId: 1,
        ocppTransactionId: this.startTransactionResult.ocppTransactionId ?? null,
      });
      this.evseStatus = "occupied";
      this.emitRuntimeEvent({
        type: "authorization.status",
        resource: {
          scope: "authorization",
          idTag: input.idTag,
          evseId: 1,
          connectorId: input.connectorId,
        },
        status: "accepted",
        source: "online",
        protocolStatus: "Accepted",
        occurredAt: now(),
      });
      this.emitRuntimeEvent({
        type: "transaction.status",
        resource: {
          scope: "transaction",
          evseId: 1,
          connectorId: 1,
          transactionId: this.startTransactionResult.transactionId,
        },
        previousStatus: null,
        currentStatus: "active",
        occurredAt: now(),
      });
    } else {
      if (this.startTransactionResult.authorizationStatus !== undefined) {
        this.emitRuntimeEvent({
          type: "authorization.status",
          resource: {
            scope: "authorization",
            idTag: input.idTag,
            evseId: 1,
            connectorId: input.connectorId,
          },
          status: mapAuthorizationStatus(
            this.startTransactionResult.authorizationStatus,
          ),
          source: "online",
          protocolStatus: this.startTransactionResult.authorizationStatus,
          occurredAt: now(),
        });
      }
      this.emitRuntimeEvent({
        type: "transaction.status",
        resource: { scope: "transaction", evseId: 1, connectorId: input.connectorId },
        previousStatus: null,
        currentStatus: "rejected",
        reason: this.startTransactionResult.reason,
        occurredAt: now(),
      });
    }
    return Promise.resolve(this.startTransactionResult);
  }

  reportMeterValue(input: { transactionId: string }) {
    this.calls.push("reportMeterValue");
    this.emitRuntimeEvent({
      type: "transaction.meterValue",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: input.transactionId,
      },
      meterWh: 100,
      powerW: 7200,
      currentA: 32,
      voltageV: 225,
      sampledAt: now(),
      occurredAt: now(),
    });
    return Promise.resolve({
      outcome: "Accepted" as const,
      transactionId: input.transactionId,
      connectorId: 1,
      ocppTransactionId: 1001,
      meterWh: 100,
      powerW: 7200,
      currentA: 32,
      voltageV: 225,
      sampledAt: new Date("2026-01-01T00:00:00.000Z"),
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
      receivedAt: new Date("2026-01-01T00:00:00.000Z"),
      unexpectedResponseFields: [],
      consecutiveFailures: 0 as const,
      platformCommunicationStatus: "online" as const,
      shouldReconnect: false as const,
    });
  }

  stopTransaction(input: { transactionId?: string }) {
    this.calls.push("stopTransaction");
    const transactionId = input.transactionId ?? "1001";
    const previousStatus = this.transactionStates.get(transactionId) ?? null;
    this.transactionStates.set(transactionId, "ended");
    this.emitRuntimeEvent({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId,
      },
      previousStatus,
      currentStatus: "ended",
      reason: "local",
      occurredAt: now(),
    });
    return Promise.resolve({
      outcome: "Accepted" as const,
      transactionId,
      ocppTransactionId: 1001,
      meterStop: 100,
      stoppedAt: new Date("2026-01-01T00:00:00.000Z"),
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
      receivedAt: new Date("2026-01-01T00:00:00.000Z"),
      idTagInfoStatus: null,
      responseIssue: null,
      unexpectedResponseFields: [],
      consecutiveFailures: 0 as const,
      platformCommunicationStatus: "online" as const,
      shouldReconnect: false as const,
      statusNotificationResults: [],
    });
  }

  getChargingPointStatus() {
    return "available" as const;
  }

  getEvseStatus() {
    return this.evseStatus;
  }

  getConnectorStatus(input: { evseId: number; connectorId: number }) {
    return this.connectorStatuses.get(`${input.evseId}/${input.connectorId}`);
  }

  getTransactionState(transactionId: string) {
    return this.transactionStates.get(transactionId);
  }

  getTransactionResource(transactionId: string) {
    return this.transactionResources.get(transactionId);
  }

  on(_event: "runtimeEvent", listener: Ocpp16RuntimeEventListener): this {
    this.runtimeEventListeners.add(listener);
    return this;
  }

  off(_event: "runtimeEvent", listener: Ocpp16RuntimeEventListener): this {
    this.runtimeEventListeners.delete(listener);
    return this;
  }

  dispose(): void {
    this.calls.push("dispose");
    this.disposed = true;
    this.runtimeStopped = true;
  }

  private emitRuntimeEvent(event: Ocpp16RuntimeEvent): void {
    for (const listener of [...this.runtimeEventListeners]) {
      listener(event);
    }
  }

  private findConnectorRef(connectorId: number): {
    evseId: number;
    connectorId: number;
  } {
    for (const key of this.connectorStatuses.keys()) {
      const [evseId, keyConnectorId] = key.split("/").map(Number);
      if (keyConnectorId === connectorId) {
        return { evseId: evseId ?? 0, connectorId };
      }
    }

    return { evseId: 1, connectorId };
  }
}

function now(): Date {
  return new Date("2026-01-01T00:00:00.000Z");
}

function mapAuthorizationStatus(
  status: "Accepted" | "Blocked" | "Expired" | "Invalid" | "ConcurrentTx",
) {
  switch (status) {
    case "Accepted":
      return "accepted";
    case "Blocked":
      return "blocked";
    case "Expired":
      return "expired";
    case "ConcurrentTx":
      return "concurrent-transaction";
    case "Invalid":
    default:
      return "invalid";
  }
}

function createHarness(dependencies: {
  runtimeLogSink?: ChargingPointActorRuntimeLogSink;
} = {}) {
  const session = new FakeSession();
  const protocolRuntime = new FakeProtocolRuntime();
  const actor = new Ocpp16ChargingPointActor(
    {
      id: "cp-1",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost/cp-1",
      chargingPoint: createChargingPoint(),
      runtimeLogSink: dependencies.runtimeLogSink,
    },
    {
      session,
      ocpp16Runtime: protocolRuntime as unknown as Ocpp16Runtime,
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      idGenerator: () => "event-1",
    },
  );

  return { actor, session, protocolRuntime };
}

function createRuntimeHarness(
  replies: ConstructorParameters<typeof RuntimeFakeSession>[0],
  dependencies: {
    configurationCatalog?: Ocpp16RuntimeOptions["configurationCatalog"];
    runtimeLogSink?: ChargingPointActorRuntimeLogSink;
  } = {},
) {
  const session = new RuntimeFakeSession(replies);
  const actor = new Ocpp16ChargingPointActor(
    {
      id: "cp-1",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost/cp-1",
      chargingPoint: createChargingPoint(),
      runtimeLogSink: dependencies.runtimeLogSink,
    },
    {
      session,
      configurationCatalog: dependencies.configurationCatalog,
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      idGenerator: () => "event-1",
    },
  );

  return { actor, session };
}

function collectChargingPointActorEvents(
  actor: Ocpp16ChargingPointActor,
  types: ChargingPointActorEventType[],
): ChargingPointActorEvent[] {
  const events: ChargingPointActorEvent[] = [];
  actor.events.subscribe((event) => {
    if (types.includes(event.type)) {
      events.push(event);
    }
  });

  return events;
}

describe("Ocpp16ChargingPointActor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("moves to starting before the initial connection completes", async () => {
    const session = new DeferredConnectSession();
    const protocolRuntime = new FakeProtocolRuntime();
    const actor = new Ocpp16ChargingPointActor(
      {
        id: "cp-1",
        protocol: "OCPP16J",
        centralSystemUrl: "ws://localhost/cp-1",
        chargingPoint: createChargingPoint(),
      },
      {
        session,
        ocpp16Runtime: protocolRuntime as unknown as Ocpp16Runtime,
        clock: () => new Date("2026-01-01T00:00:00.000Z"),
        idGenerator: () => "event-1",
      },
    );

    const startPromise = actor.start();
    await Promise.resolve();

    expect(actor.status).toBe("starting");

    session.completeConnect();
    await expect(startPromise).resolves.toMatchObject({
      chargingPointActorStatus: "running",
    });
    expect(actor.status).toBe("running");
  });

  test("writes runtime log records for actor lifecycle transitions", async () => {
    const runtimeLogs: ChargingPointActorRuntimeLogRecord[] = [];
    const { actor } = createHarness({
      runtimeLogSink: {
        write: (record) => {
          runtimeLogs.push(record);
        },
      },
    });

    await actor.start();
    await actor.stop();

    expect(runtimeLogs).toEqual([
      expect.objectContaining({
        id: "event-1",
        sequence: 1,
        chargingPointId: "cp-1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        level: "info",
        code: "CHARGING_POINT_ACTOR_STATUS_CHANGED",
        message: "Charging point actor status changed",
        context: {
          previousStatus: "stopped",
          currentStatus: "starting",
        },
      }),
      expect.objectContaining({
        sequence: 2,
        level: "info",
        code: "CHARGING_POINT_ACTOR_STATUS_CHANGED",
        context: {
          previousStatus: "starting",
          currentStatus: "running",
        },
      }),
      expect.objectContaining({
        sequence: 3,
        level: "info",
        code: "CHARGING_POINT_ACTOR_STATUS_CHANGED",
        context: {
          previousStatus: "running",
          currentStatus: "stopped",
        },
      }),
    ]);
  });

  test("isolates runtime log sink failures from actor operations", async () => {
    const unhandledRejections: unknown[] = [];
    const handleUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", handleUnhandledRejection);
    const { actor } = createHarness({
      runtimeLogSink: {
        write: (record) => {
          if (record.sequence === 1) {
            throw new Error("runtime log write failed");
          }

          return Promise.reject(new Error("async runtime log write failed"));
        },
      },
    });

    try {
      await expect(actor.start()).resolves.toMatchObject({
        chargingPointActorStatus: "running",
      });
      await flushMacrotasks();

      expect(actor.status).toBe("running");
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", handleUnhandledRejection);
    }
  });

  test("writes session errors as runtime log records without raw protocol bodies", () => {
    const runtimeLogs: ChargingPointActorRuntimeLogRecord[] = [];
    const { session } = createHarness({
      runtimeLogSink: {
        write: (record) => {
          runtimeLogs.push(record);
        },
      },
    });

    session.emitSessionError({
      source: "decode",
      action: "BootNotification",
      messageId: "message-1",
      raw: "[2,\"message-1\",\"BootNotification\",{}]",
      error: new SessionError("DECODE_ERROR", "Invalid inbound message"),
    });

    expect(runtimeLogs).toEqual([
      expect.objectContaining({
        sequence: 1,
        chargingPointId: "cp-1",
        level: "error",
        code: "DECODE_ERROR",
        message: "Charging point session reported session error",
        context: {
          source: "decode",
          action: "BootNotification",
          messageId: "message-1",
          error: {
            code: "DECODE_ERROR",
            message: "Invalid inbound message",
          },
        },
      }),
    ]);
  });

  test("writes session connection changes as runtime log records", () => {
    const runtimeLogs: ChargingPointActorRuntimeLogRecord[] = [];
    const { session } = createHarness({
      runtimeLogSink: {
        write: (record) => {
          runtimeLogs.push(record);
        },
      },
    });

    session.emitOnline();
    session.emitReconnecting(2, new SessionError("CONNECT_FAILED", "Connection failed"));
    session.emitOffline();

    expect(runtimeLogs).toEqual([
      expect.objectContaining({
        sequence: 1,
        level: "info",
        code: "CHARGING_POINT_SESSION_ONLINE",
        message: "Charging point session went online",
      }),
      expect.objectContaining({
        sequence: 2,
        level: "warn",
        code: "CHARGING_POINT_SESSION_RECONNECTING",
        message: "Charging point session is reconnecting",
        context: {
          attempt: 2,
          error: {
            code: "CONNECT_FAILED",
            message: "Connection failed",
          },
        },
      }),
      expect.objectContaining({
        sequence: 3,
        level: "warn",
        code: "CHARGING_POINT_SESSION_OFFLINE",
        message: "Charging point session went offline",
        context: {
          reason: "unexpected_disconnect",
        },
      }),
    ]);
  });

  test("writes startup protocol actions as runtime log records", async () => {
    const runtimeLogs: ChargingPointActorRuntimeLogRecord[] = [];
    const { actor } = createRuntimeHarness(
      [
        runtimeBootAccepted(),
        runtimeResponse("StatusNotification", {}),
        runtimeResponse("StatusNotification", {}),
      ],
      {
        runtimeLogSink: {
          write: (record) => {
            runtimeLogs.push(record);
          },
        },
      },
    );

    await actor.start();

    const actionRuntimeLogs = runtimeLogs.filter((record) =>
      record.context?.category === "action"
    );
    const bootStarted = actionRuntimeLogs.find((record) =>
      record.context?.name === "BootNotification" &&
      record.context.phase === "started"
    );
    const bootCompleted = actionRuntimeLogs.find((record) =>
      record.context?.name === "BootNotification" &&
      record.context.phase === "completed"
    );

    expect(bootStarted).toMatchObject({
      level: "info",
      code: "OCPP16_ACTION_STARTED",
      message: "OCPP 1.6 action started",
      context: {
        category: "action",
        phase: "started",
        name: "BootNotification",
      },
    });
    expect(bootCompleted).toMatchObject({
      level: "info",
      code: "OCPP16_ACTION_COMPLETED",
      message: "OCPP 1.6 action completed",
      context: {
        category: "action",
        phase: "completed",
        name: "BootNotification",
        result: expect.objectContaining({ status: "Accepted" }),
        durationMs: 0,
      },
    });
    expect(bootCompleted?.context?.operationId).toBe(
      bootStarted?.context?.operationId,
    );
    expect(actionRuntimeLogs).toContainEqual(expect.objectContaining({
      code: "OCPP16_ACTION_STARTED",
      context: expect.objectContaining({
        category: "action",
        phase: "started",
        name: "StatusNotification",
      }),
    }));
    expect(actionRuntimeLogs).toContainEqual(expect.objectContaining({
      code: "OCPP16_ACTION_COMPLETED",
      context: expect.objectContaining({
        category: "action",
        phase: "completed",
        name: "StatusNotification",
        result: expect.objectContaining({ outcome: "Accepted" }),
      }),
    }));
  });

  test("uses direct connector id for StartTransaction", async () => {
    const { actor, protocolRuntime } = createHarness();
    protocolRuntime.setConnectorStatus(1, 7, "available");
    await actor.start();

    await actor.startTransaction({
      evseId: 1,
      connectorId: 7,
      idTag: "CARD001",
    });

    expect(protocolRuntime.startLocalTransactionInput).toMatchObject({
      connectorId: 7,
      idTag: "CARD001",
    });
  });

  test("uses direct connector id for Authorize and emits authorization status", async () => {
    const { actor, protocolRuntime } = createHarness();
    protocolRuntime.setConnectorStatus(1, 7, "available");
    const events = collectChargingPointActorEvents(actor, ["authorization.status"]);
    await actor.start();

    const result = await actor.authorize({
      evseId: 1,
      connectorId: 7,
      idTag: "CARD007",
    });

    expect(result).toEqual({ status: "accepted" });
    expect(protocolRuntime.authorizeInput).toEqual({
      connectorId: 7,
      idTag: "CARD007",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      resource: {
        scope: "authorization",
        idTag: "CARD007",
        evseId: 1,
        connectorId: 7,
      },
      status: "accepted",
      source: "online",
      protocolStatus: "Accepted",
    }));
  });

  test("authorize returns rejected results and emits rejected authorization status", async () => {
    const { actor, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, ["authorization.status"]);
    protocolRuntime.authorizeResult = {
      outcome: "Rejected",
      idTag: "CARD001",
      authorizationStatus: "Invalid",
      expiryDate: null,
      parentIdTag: null,
      source: "online",
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
      receivedAt: new Date("2026-01-01T00:00:00.000Z"),
      consecutiveFailures: 0,
      platformCommunicationStatus: "online",
      shouldReconnect: false,
    };
    await actor.start();

    const result = await actor.authorize({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "Authorize 被中心系统拒绝",
      authorizationStatus: "Invalid",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      resource: {
        scope: "authorization",
        idTag: "CARD001",
        evseId: 1,
        connectorId: 1,
      },
      status: "invalid",
      source: "online",
      protocolStatus: "Invalid",
    }));
  });

  test("start connects, boots, reports status, starts heartbeat, and emits events", async () => {
    const { actor, session, protocolRuntime } = createHarness();
    protocolRuntime.setConnectorStatus(2, 2, "available");
    const events = collectChargingPointActorEvents(actor, [
      "chargingPoint.lifecycle",
      "chargingPoint.availability",
      "chargingPoint.status",
      "connector.availability",
      "connector.status",
    ]);

    await expect(actor.start()).resolves.toEqual({
      chargingPointId: "cp-1",
      chargingPointActorStatus: "running",
      bootStatus: "Accepted",
    });

    expect(session.connectCalls).toBe(1);
    expect(protocolRuntime.calls).toEqual([
      "boot",
      "startHeartbeatLoop",
      "publishChargingPointAvailabilitySnapshot",
      "reportChargingPointStatus",
      "publishConnectorAvailabilitySnapshot:1/1",
      "reportConnectorStatus:1",
      "publishConnectorAvailabilitySnapshot:2/2",
      "reportConnectorStatus:2",
    ]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "chargingPoint.availability",
      chargingPointId: "cp-1",
      protocol: "OCPP16J",
      resource: { scope: "chargingPoint" },
      previousAvailability: null,
      currentAvailability: "operative",
      occurredAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "chargingPoint.status",
      chargingPointId: "cp-1",
      protocol: "OCPP16J",
      resource: { scope: "chargingPoint" },
      previousStatus: null,
      currentStatus: "available",
      occurredAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.availability",
      chargingPointId: "cp-1",
      protocol: "OCPP16J",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      previousAvailability: null,
      currentAvailability: "operative",
      occurredAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.status",
      chargingPointId: "cp-1",
      protocol: "OCPP16J",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      previousStatus: null,
      currentStatus: "available",
      occurredAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.status",
      chargingPointId: "cp-1",
      protocol: "OCPP16J",
      resource: { scope: "connector", evseId: 2, connectorId: 2 },
      previousStatus: null,
      currentStatus: "available",
      occurredAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "chargingPoint.lifecycle",
      chargingPointId: "cp-1",
      protocol: "OCPP16J",
      resource: { scope: "chargingPoint" },
      previousStatus: "starting",
      currentStatus: "running",
      occurredAt: "2026-01-01T00:00:00.000Z",
    }));
  });

  test("does not boot twice when the initial connection emits online", async () => {
    const { actor, session, protocolRuntime } = createHarness();
    session.emitOnlineDuringConnect = true;

    await expect(actor.start()).resolves.toEqual({
      chargingPointId: "cp-1",
      chargingPointActorStatus: "running",
      bootStatus: "Accepted",
    });
    await flushMicrotasks();

    expect(protocolRuntime.calls).toEqual([
      "boot",
      "startHeartbeatLoop",
      "publishChargingPointAvailabilitySnapshot",
      "reportChargingPointStatus",
      "publishConnectorAvailabilitySnapshot:1/1",
      "reportConnectorStatus:1",
    ]);
  });

  test("uses synchronized protocol clock for actor events", async () => {
    const session = new RuntimeFakeSession([
      runtimeResponse("BootNotification", {
        status: "Accepted",
        currentTime: "2026-01-01T00:00:02.000Z",
        interval: 30,
      }),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
    ]);
    const actor = new Ocpp16ChargingPointActor(
      {
        id: "cp-1",
        protocol: "OCPP16J",
        centralSystemUrl: "ws://localhost/cp-1",
        chargingPoint: createChargingPoint(),
      },
      {
        session,
        clock: () => new Date("2026-01-01T00:00:00.000Z"),
        idGenerator: () => "event-1",
      },
    );
    const events = collectChargingPointActorEvents(actor, [
      "chargingPoint.lifecycle",
      "chargingPoint.status",
      "connector.status",
    ]);

    await actor.start();

    expect(events).toContainEqual(expect.objectContaining({
      type: "chargingPoint.status",
      occurredAt: "2026-01-01T00:00:02.000Z",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "chargingPoint.lifecycle",
      currentStatus: "running",
      occurredAt: "2026-01-01T00:00:02.000Z",
    }));
  });

  test("start returns immediately when boot is pending and keeps retrying in the background", async () => {
    vi.useFakeTimers();
    const { actor, session, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, ["chargingPoint.lifecycle"]);
    protocolRuntime.bootResults = [
      {
        status: "Pending",
        currentTime: new Date("2026-01-01T00:00:00.000Z"),
        interval: 2,
      },
      {
        status: "Accepted",
        currentTime: new Date("2026-01-01T00:00:02.000Z"),
        interval: 30,
      },
    ];

    await expect(actor.start()).resolves.toEqual({
      chargingPointId: "cp-1",
      chargingPointActorStatus: "starting",
      bootStatus: "Pending",
      retryAfterSec: 2,
    });

    expect(session.connectCalls).toBe(1);
    expect(session.disconnectCalls).toBe(0);
    expect(protocolRuntime.calls).toEqual(["boot"]);
    expect(events).toEqual([
      expect.objectContaining({
        type: "chargingPoint.lifecycle",
        resource: { scope: "chargingPoint" },
        previousStatus: "stopped",
        currentStatus: "starting",
      }),
    ]);

    vi.advanceTimersByTime(1_999);
    await flushMicrotasks();
    expect(protocolRuntime.calls).toEqual(["boot"]);

    vi.advanceTimersByTime(1);
    await flushMicrotasks();

    expect(session.disconnectCalls).toBe(0);
    expect(protocolRuntime.calls).toEqual([
      "boot",
      "boot",
      "startHeartbeatLoop",
      "publishChargingPointAvailabilitySnapshot",
      "reportChargingPointStatus",
      "publishConnectorAvailabilitySnapshot:1/1",
      "reportConnectorStatus:1",
    ]);
  });

  test("allows local charging operations while boot retry is pending", async () => {
    const { actor, protocolRuntime } = createHarness();
    protocolRuntime.bootResults = [
      {
        status: "Pending",
        currentTime: new Date("2026-01-01T00:00:00.000Z"),
        interval: 30,
      },
    ];

    await actor.start();
    await expect(actor.plug({ evseId: 1, connectorId: 1 }))
      .resolves.toMatchObject({ plugState: "plugged" });
    await expect(actor.authorize({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    })).resolves.toEqual({ status: "accepted" });
    await expect(actor.startTransaction({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    })).resolves.toEqual({
      status: "accepted",
      transactionId: "1001",
    });

    expect(protocolRuntime.calls).toEqual([
      "boot",
      "plugConnector",
      "authorize",
      "startLocalTransaction",
    ]);
  });

  test("keeps the actor starting when the initial connection enters reconnecting", async () => {
    const { actor, session, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, ["chargingPoint.lifecycle"]);
    session.connectError = new Error("network down");
    session.stateAfterConnectError = "reconnecting";

    await expect(actor.start()).resolves.toEqual({
      chargingPointId: "cp-1",
      chargingPointActorStatus: "starting",
      bootStatus: "Pending",
      retryAfterSec: 0,
    });

    expect(session.disconnectCalls).toBe(0);
    expect(protocolRuntime.calls).toEqual([]);
    expect(events).toEqual([
      expect.objectContaining({
        previousStatus: "stopped",
        currentStatus: "starting",
      }),
    ]);
  });

  test("boots after the reconnecting initial connection becomes online", async () => {
    const { actor, session, protocolRuntime } = createHarness();
    session.connectError = new Error("network down");
    session.stateAfterConnectError = "reconnecting";

    await actor.start();
    session.connectError = null;
    session.emitOnline();
    await flushMicrotasks();

    expect(protocolRuntime.calls).toEqual([
      "boot",
      "startHeartbeatLoop",
      "publishChargingPointAvailabilitySnapshot",
      "reportChargingPointStatus",
      "publishConnectorAvailabilitySnapshot:1/1",
      "reportConnectorStatus:1",
    ]);
  });

  test("background boot retry moves actor from starting to running after accepted boot", async () => {
    vi.useFakeTimers();
    const { actor, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, [
      "chargingPoint.lifecycle",
      "chargingPoint.boot",
      "chargingPoint.status",
      "connector.status",
    ]);
    protocolRuntime.bootResults = [
      {
        status: "Pending",
        currentTime: new Date("2026-01-01T00:00:00.000Z"),
        interval: 2,
      },
      {
        status: "Accepted",
        currentTime: new Date("2026-01-01T00:00:02.000Z"),
        interval: 30,
      },
    ];

    await actor.start();
    await vi.advanceTimersByTimeAsync(2_000);
    await flushMicrotasks();

    expect(events.filter((event) => event.type === "chargingPoint.lifecycle"))
      .toEqual([
        expect.objectContaining({
          previousStatus: "stopped",
          currentStatus: "starting",
        }),
        expect.objectContaining({
          previousStatus: "starting",
          currentStatus: "running",
        }),
      ]);
    expect(events.filter((event) => event.type === "chargingPoint.boot"))
      .toEqual([
        expect.objectContaining({
          status: "Pending",
          retryAfterSec: 2,
        }),
        expect.objectContaining({
          status: "Accepted",
        }),
      ]);
    expect(events.find((event) =>
      event.type === "chargingPoint.boot" && event.status === "Accepted"
    )).not.toHaveProperty("retryAfterSec");
    expect(events).toContainEqual(expect.objectContaining({
      type: "chargingPoint.status",
      currentStatus: "available",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.status",
      currentStatus: "available",
    }));
  });

  test("triggered accepted boot completes startup and cancels the pending retry", async () => {
    vi.useFakeTimers();
    const { actor, session } = createRuntimeHarness([
      runtimeResponse("BootNotification", {
        status: "Pending",
        currentTime: "2026-01-01T00:00:00.000Z",
        interval: 10,
      }),
      runtimeResponse("BootNotification", {
        status: "Accepted",
        currentTime: "2026-01-01T00:00:01.000Z",
        interval: 10,
      }),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
    ]);
    const events = collectChargingPointActorEvents(actor, [
      "chargingPoint.lifecycle",
      "chargingPoint.boot",
    ]);
    const running = new Promise<void>((resolve) => {
      actor.events.subscribe((event) => {
        if (
          event.type === "chargingPoint.lifecycle" &&
          event.currentStatus === "running"
        ) {
          resolve();
        }
      });
    });

    await expect(actor.start()).resolves.toMatchObject({
      chargingPointActorStatus: "starting",
      bootStatus: "Pending",
      retryAfterSec: 10,
    });
    const request = new RuntimeFakeInboundRequest("TriggerMessage", {
      requestedMessage: "BootNotification",
    });
    session.emitInboundRequest(request);
    await running;

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(actor.status).toBe("running");
    expect(events.filter((event) => event.type === "chargingPoint.boot"))
      .toEqual([
        expect.objectContaining({ status: "Pending", retryAfterSec: 10 }),
        expect.objectContaining({ status: "Accepted" }),
      ]);

    await vi.advanceTimersByTimeAsync(10_000);
    await flushRemoteCommand();

    expect(session.requests.filter((item) => item.action === "BootNotification"))
      .toHaveLength(2);
  });

  test("background boot retry stops and disconnects after rejected boot", async () => {
    vi.useFakeTimers();
    const { actor, session, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, ["chargingPoint.lifecycle"]);
    protocolRuntime.bootResults = [
      {
        status: "Pending",
        currentTime: new Date("2026-01-01T00:00:00.000Z"),
        interval: 2,
      },
      {
        status: "Rejected",
        currentTime: new Date("2026-01-01T00:00:02.000Z"),
        interval: 30,
      },
    ];

    await actor.start();
    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();

    expect(session.disconnectCalls).toBe(1);
    expect(protocolRuntime.calls).toEqual([
      "boot",
      "boot",
      "stopRuntime",
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        type: "chargingPoint.lifecycle",
        previousStatus: "stopped",
        currentStatus: "starting",
      }),
      expect.objectContaining({
        type: "chargingPoint.lifecycle",
        previousStatus: "starting",
        currentStatus: "stopped",
        error: {
          code: "CHARGING_POINT_ACTOR_START_FAILED",
          message: "BootNotification Rejected",
        },
      }),
    ]);
  });

  test("stop cancels pending boot retry and moves actor back to stopped", async () => {
    vi.useFakeTimers();
    const { actor, session, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, ["chargingPoint.lifecycle"]);
    protocolRuntime.bootResults = [
      {
        status: "Pending",
        currentTime: new Date("2026-01-01T00:00:00.000Z"),
        interval: 2,
      },
      {
        status: "Accepted",
        currentTime: new Date("2026-01-01T00:00:02.000Z"),
        interval: 30,
      },
    ];

    await actor.start();
    await expect(actor.stop()).resolves.toEqual({
      chargingPointId: "cp-1",
      chargingPointActorStatus: "stopped",
    });
    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();

    expect(session.disconnectCalls).toBe(1);
    expect(protocolRuntime.calls).toEqual(["boot", "stopRuntime"]);
    expect(events).toEqual([
      expect.objectContaining({
        type: "chargingPoint.lifecycle",
        previousStatus: "stopped",
        currentStatus: "starting",
      }),
      expect.objectContaining({
        type: "chargingPoint.lifecycle",
        previousStatus: "starting",
        currentStatus: "stopped",
      }),
    ]);
  });

  test("start rejects duplicate calls while boot retry is pending", async () => {
    const { actor, session, protocolRuntime } = createHarness();
    protocolRuntime.bootResults = [
      {
        status: "Pending",
        currentTime: new Date("2026-01-01T00:00:00.000Z"),
        interval: 30,
      },
    ];

    await actor.start();

    await expect(actor.start()).rejects.toMatchObject({
      code: "CHARGING_POINT_ACTOR_ALREADY_RUNNING",
    });
    expect(session.connectCalls).toBe(1);
    expect(protocolRuntime.calls).toEqual(["boot"]);
  });

  test("transaction start is allowed while background boot is pending", async () => {
    const { actor, protocolRuntime } = createHarness();
    protocolRuntime.bootResults = [
      {
        status: "Pending",
        currentTime: new Date("2026-01-01T00:00:00.000Z"),
        interval: 2,
      },
    ];

    await actor.start();
    await expect(actor.startTransaction({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    })).resolves.toMatchObject({
      status: "accepted",
      transactionId: "1001",
    });
    expect(protocolRuntime.calls).toEqual(["boot", "startLocalTransaction"]);
  });

  test("start failure stops runtime without permanently disposing protocolRuntime", async () => {
    const { actor, session, protocolRuntime } = createHarness();
    protocolRuntime.bootStatus = "Rejected";
    const events = collectChargingPointActorEvents(actor, ["chargingPoint.lifecycle"]);

    await expect(actor.start()).rejects.toMatchObject({
      code: "CHARGING_POINT_ACTOR_START_FAILED",
    });

    expect(protocolRuntime.calls).toContain("stopRuntime");
    expect(protocolRuntime.disposed).toBe(false);
    expect(session.disconnectCalls).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: "chargingPoint.lifecycle",
      resource: { scope: "chargingPoint" },
      previousStatus: "starting",
      currentStatus: "stopped",
      error: {
        code: "CHARGING_POINT_ACTOR_START_FAILED",
        message: "BootNotification Rejected",
      },
    }));
  });

  test("stop is idempotent, disconnects running actor, and preserves restartability", async () => {
    const { actor, session, protocolRuntime } = createHarness();

    await expect(actor.stop()).resolves.toEqual({
      chargingPointId: "cp-1",
      chargingPointActorStatus: "stopped",
    });
    await actor.start();
    await actor.stop();
    await actor.start();

    expect(protocolRuntime.calls).toEqual([
      "boot",
      "startHeartbeatLoop",
      "publishChargingPointAvailabilitySnapshot",
      "reportChargingPointStatus",
      "publishConnectorAvailabilitySnapshot:1/1",
      "reportConnectorStatus:1",
      "stopRuntime",
      "boot",
      "startHeartbeatLoop",
      "publishChargingPointAvailabilitySnapshot",
      "reportChargingPointStatus",
      "publishConnectorAvailabilitySnapshot:1/1",
      "reportConnectorStatus:1",
    ]);
    expect(protocolRuntime.disposed).toBe(false);
    expect(session.disconnectCalls).toBe(1);
  });

  test("online operations delegate to protocolRuntime and emit events", async () => {
    const { actor, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, [
      "authorization.status",
      "connector.status",
      "evse.status",
      "transaction.status",
      "transaction.meterValue",
    ]);
    await actor.start();

    const plugResult = await actor.plug({ evseId: 1, connectorId: 1 });
    const authorizeResult = await actor.authorize({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    });
    const startResult = await actor.startTransaction({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    });
    const transactionId = startResult.status === "accepted"
      ? startResult.transactionId
      : "";
    const meterValueResult = await actor.reportMeterValue({
      transactionId,
      meterWh: 100,
    });
    const stopResult = await actor.stopTransaction({
      transactionId,
      reason: "local",
      meterStopWh: 100,
    });
    const unplugResult = await actor.unplug({ evseId: 1, connectorId: 1 });

    expect(protocolRuntime.calls).toContain("plugConnector");
    expect(protocolRuntime.calls).toContain("authorize");
    expect(protocolRuntime.calls).toContain("startLocalTransaction");
    expect(protocolRuntime.calls).toContain("reportMeterValue");
    expect(protocolRuntime.calls).toContain("stopTransaction");
    expect(protocolRuntime.calls).toContain("unplugConnector");
    expect(plugResult.connectorStatus).toBe("occupied");
    expect(authorizeResult).toEqual({ status: "accepted" });
    expect(startResult).toMatchObject({
      status: "accepted",
      transactionId: "1001",
    });
    expect(meterValueResult).toMatchObject({
      status: "accepted",
      transactionId: "1001",
      meterWh: 100,
    });
    expect(stopResult).toMatchObject({
      status: "accepted",
      transactionId: "1001",
      meterStopWh: 100,
    });
    expect(unplugResult.connectorStatus).toBe("available");
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
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      resource: {
        scope: "authorization",
        idTag: "CARD001",
        evseId: 1,
        connectorId: 1,
      },
      status: "accepted",
      source: "online",
      protocolStatus: "Accepted",
    }));
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
      meterWh: 100,
      sampledAt: "2026-01-01T00:00:00.000Z",
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
      type: "evse.status",
      resource: { scope: "evse", evseId: 1 },
      previousStatus: "occupied",
      currentStatus: "available",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.status",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      previousStatus: "occupied",
      currentStatus: "available",
    }));
  });

  test("emits public meter value events from periodic runtime sampling", async () => {
    vi.useFakeTimers();
    const { actor } = createRuntimeHarness([
      runtimeBootAccepted(),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("Authorize", {
        idTagInfo: { status: "Accepted" },
      }),
      runtimeResponse("StartTransaction", {
        transactionId: 1001,
        idTagInfo: { status: "Accepted" },
      }),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("MeterValues", {}),
    ], {
      configurationCatalog: {
        chargingPointId: "cp-1",
        protocolVersion: "OCPP16J",
        entries: [
          {
            key: "MeterValueSampleInterval",
            value: "1",
            valueType: "integer",
            minValue: 0,
          },
        ],
      },
    });

    await actor.start();
    await actor.plug({ evseId: 1, connectorId: 1 });
    await actor.authorize({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    });
    const start = await actor.startTransaction({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    });
    const events = collectChargingPointActorEvents(actor, ["transaction.meterValue"]);

    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();

    expect(start).toEqual({
      status: "accepted",
      transactionId: "1001",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.meterValue",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "1001",
      },
      meterWh: 0,
      sampledAt: "2026-01-01T00:00:00.000Z",
    }));
  });

  test("emits actor events when RemoteStartTransaction starts a transaction", async () => {
    const { actor, session } = createRuntimeHarness([
      runtimeBootAccepted(),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StartTransaction", {
        transactionId: 2001,
        idTagInfo: { status: "Accepted" },
      }),
      runtimeResponse("StatusNotification", {}),
    ]);

    await actor.start();
    await actor.plug({ evseId: 1, connectorId: 1 });
    const events = collectChargingPointActorEvents(actor, [
      "authorization.status",
      "connector.status",
      "transaction.status",
    ]);
    const request = new RuntimeFakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    session.emitInboundRequest(request);
    await flushRemoteCommand();

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      resource: {
        scope: "authorization",
        idTag: "REMOTE",
        evseId: 1,
        connectorId: 1,
      },
      status: "accepted",
      source: "online",
      protocolStatus: "Accepted",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "2001",
      },
      previousStatus: null,
      currentStatus: "active",
    }));
    expect(events.filter((event) => event.type === "connector.status"))
      .toEqual([]);
  });

  test("emits actor events when RemoteStopTransaction stops a transaction", async () => {
    const { actor, session } = createRuntimeHarness([
      runtimeBootAccepted(),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("Authorize", {
        idTagInfo: { status: "Accepted" },
      }),
      runtimeResponse("StartTransaction", {
        transactionId: 2001,
        idTagInfo: { status: "Accepted" },
      }),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StopTransaction", {}),
      runtimeResponse("StatusNotification", {}),
    ]);

    await actor.start();
    await actor.plug({ evseId: 1, connectorId: 1 });
    await actor.authorize({ evseId: 1, connectorId: 1, idTag: "REMOTE" });
    const startResult = await actor.startTransaction({
      evseId: 1,
      connectorId: 1,
      idTag: "REMOTE",
    });
    const events = collectChargingPointActorEvents(actor, [
      "transaction.status",
      "protocol.message",
    ]);
    const request = new RuntimeFakeInboundRequest("RemoteStopTransaction", {
      transactionId: startResult.status === "accepted"
        ? Number(startResult.transactionId)
        : 0,
    });

    session.emitInboundRequest(request);
    await flushRemoteCommand();

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
        transactionId: "2001",
      },
      previousStatus: "active",
      currentStatus: "ended",
      reason: "remote",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "protocol.message",
      direction: "received",
      action: "RemoteStopTransaction",
      body: { transactionId: 2001 },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "protocol.message",
      direction: "sent",
      action: "StopTransaction",
      body: expect.objectContaining({
        transactionId: 2001,
        reason: "Remote",
      }),
    }));
  });

  test("emits actor status events when ChangeAvailability changes a connector", async () => {
    const { actor, session } = createRuntimeHarness([
      runtimeBootAccepted(),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
    ]);

    await actor.start();
    const events = collectChargingPointActorEvents(actor, [
      "connector.availability",
      "evse.status",
      "connector.status",
    ]);
    const request = new RuntimeFakeInboundRequest("ChangeAvailability", {
      connectorId: 1,
      type: "Inoperative",
    });

    session.emitInboundRequest(request);
    await flushRemoteCommand();

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.availability",
      resource: {
        scope: "connector",
        evseId: 1,
        connectorId: 1,
      },
      previousAvailability: "operative",
      currentAvailability: "inoperative",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.status",
      resource: {
        scope: "connector",
        evseId: 1,
        connectorId: 1,
      },
      previousStatus: "available",
      currentStatus: "unavailable",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "evse.status",
      resource: { scope: "evse", evseId: 1 },
      previousStatus: "available",
      currentStatus: "unavailable",
    }));
  });

  test("emits actor availability events when ChangeAvailability changes the charging point", async () => {
    const { actor, session } = createRuntimeHarness([
      runtimeBootAccepted(),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
    ]);

    await actor.start();
    const events = collectChargingPointActorEvents(actor, [
      "chargingPoint.availability",
      "connector.availability",
    ]);
    const request = new RuntimeFakeInboundRequest("ChangeAvailability", {
      connectorId: 0,
      type: "Inoperative",
    });

    session.emitInboundRequest(request);
    await flushRemoteCommand();

    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "chargingPoint.availability",
      resource: { scope: "chargingPoint" },
      previousAvailability: "operative",
      currentAvailability: "inoperative",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.availability",
      resource: {
        scope: "connector",
        evseId: 1,
        connectorId: 1,
      },
      previousAvailability: "operative",
      currentAvailability: "inoperative",
    }));
  });

  test("emits authorization events for both remote Authorize and StartTransaction results", async () => {
    const { actor, session } = createRuntimeHarness([
      runtimeBootAccepted(),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("Authorize", {
        idTagInfo: { status: "Accepted" },
      }),
      runtimeResponse("StartTransaction", {
        transactionId: 2001,
        idTagInfo: { status: "Accepted" },
      }),
      runtimeResponse("StatusNotification", {}),
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

    await actor.start();
    await actor.plug({ evseId: 1, connectorId: 1 });
    const events = collectChargingPointActorEvents(actor, [
      "authorization.status",
      "transaction.status",
    ]);
    const request = new RuntimeFakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    session.emitInboundRequest(request);
    await flushRemoteCommand();

    const authorizationEvents = events.filter((event) =>
      event.type === "authorization.status"
    );
    expect(request.responses).toEqual([{ status: "Accepted" }]);
    expect(authorizationEvents).toHaveLength(2);
    expect(authorizationEvents).toEqual([
      expect.objectContaining({
        resource: {
          scope: "authorization",
          idTag: "REMOTE",
          evseId: 1,
          connectorId: 1,
        },
        status: "accepted",
        protocolStatus: "Accepted",
      }),
      expect.objectContaining({
        resource: {
          scope: "authorization",
          idTag: "REMOTE",
          evseId: 1,
          connectorId: 1,
        },
        status: "accepted",
        protocolStatus: "Accepted",
      }),
    ]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      currentStatus: "active",
    }));
  });

  test("emits a rejected transaction event when remote authorization fails", async () => {
    const { actor, session } = createRuntimeHarness([
      runtimeBootAccepted(),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeError("Authorize", "authorize timeout"),
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

    await actor.start();
    await actor.plug({ evseId: 1, connectorId: 1 });
    const events = collectChargingPointActorEvents(actor, [
      "authorization.status",
      "transaction.status",
    ]);
    const request = new RuntimeFakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    session.emitInboundRequest(request);
    await flushRemoteCommand();

    expect(request.responses).toEqual([{ status: "Rejected" }]);
    expect(events.filter((event) => event.type === "authorization.status"))
      .toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
      },
      previousStatus: null,
      currentStatus: "rejected",
      reason: "Authorize 请求失败",
      error: {
        code: "InternalError",
        message: "authorize timeout",
      },
    }));
  });

  test("emits authorization and rejected transaction events when remote authorization is rejected", async () => {
    const { actor, session } = createRuntimeHarness([
      runtimeBootAccepted(),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("StatusNotification", {}),
      runtimeResponse("Authorize", {
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

    await actor.start();
    await actor.plug({ evseId: 1, connectorId: 1 });
    const events = collectChargingPointActorEvents(actor, [
      "authorization.status",
      "transaction.status",
    ]);
    const request = new RuntimeFakeInboundRequest("RemoteStartTransaction", {
      connectorId: 1,
      idTag: "REMOTE",
    });
    session.emitInboundRequest(request);
    await flushRemoteCommand();

    expect(request.responses).toEqual([{ status: "Rejected" }]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      resource: {
        scope: "authorization",
        idTag: "REMOTE",
        evseId: 1,
        connectorId: 1,
      },
      status: "invalid",
      source: "online",
      protocolStatus: "Invalid",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
      },
      previousStatus: null,
      currentStatus: "rejected",
      reason: "Authorize 被中心系统拒绝",
    }));
  });

  test("emits session status events from CSMS connection changes", async () => {
    const { actor, session } = createHarness();
    const events = collectChargingPointActorEvents(actor, ["session.status"]);

    await actor.start();

    session.emitOnline();
    session.emitReconnecting(
      2,
      new SessionError(
        "CONNECT_FAILED",
        "建立底层链路失败",
        new Error("ECONNREFUSED"),
      ),
    );
    session.emitOffline();

    expect(events).toEqual([
      expect.objectContaining({
        type: "session.status",
        resource: { scope: "session" },
        previousStatus: "offline",
        currentStatus: "online",
        connectionUrl: "ws://localhost/cp-1",
      }),
      expect.objectContaining({
        type: "session.status",
        resource: { scope: "session" },
        previousStatus: "online",
        currentStatus: "reconnecting",
        attempt: 2,
        connectionUrl: "ws://localhost/cp-1",
        error: {
          code: "CONNECT_FAILED",
          message: "建立底层链路失败",
          cause: {
            name: "Error",
            message: "ECONNREFUSED",
          },
        },
      }),
      expect.objectContaining({
        type: "session.status",
        resource: { scope: "session" },
        previousStatus: "reconnecting",
        currentStatus: "offline",
        reason: "unexpected_disconnect",
        connectionUrl: "ws://localhost/cp-1",
      }),
    ]);
  });

  test("does not emit session status after dispose", async () => {
    const { actor, session } = createHarness();
    const events = collectChargingPointActorEvents(actor, ALL_CHARGING_POINT_ACTOR_EVENT_TYPES);

    await actor.start();
    await actor.dispose();
    const eventCountAfterDispose = events.length;

    session.emitReconnecting();
    session.emitOffline();

    expect(events).toHaveLength(eventCountAfterDispose);
  });

  test("emits protocol messages through the protocol event channel", () => {
    const { actor, session } = createHarness();
    const events = collectChargingPointActorEvents(actor, ["protocol.message"]);

    session.emitProtocolMessage({
      protocol: "OCPP16J",
      direction: "outbound",
      messageKind: "request",
      messageId: "message-1",
      action: "BootNotification",
      payload: { chargePointVendor: "SparkSim" },
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "protocol.message",
        chargingPointId: "cp-1",
        protocol: "OCPP16J",
        resource: { scope: "protocol" },
        direction: "sent",
        action: "BootNotification",
        messageId: "message-1",
        body: { chargePointVendor: "SparkSim" },
      }),
    ]);
  });

  test("event subscriptions can be unsubscribed", async () => {
    const { actor } = createHarness();
    const events: ChargingPointActorEvent[] = [];
    const unsubscribe = actor.events.subscribe((event) => {
      events.push(event);
    });

    unsubscribe();
    await actor.start();
    await actor.dispose();

    expect(events).toHaveLength(0);
  });

  test("isolates event listener failures from actor operations", async () => {
    const { actor } = createHarness();
    await actor.start();
    const events: ChargingPointActorEvent[] = [];
    actor.events.subscribe(() => {
      throw new Error("subscriber failed");
    });
    actor.events.subscribe((event) => {
      events.push(event);
    });

    await expect(actor.plug({ evseId: 1, connectorId: 1 })).resolves.toMatchObject({
      chargingPointId: "cp-1",
      evseId: 1,
      connectorId: 1,
      plugState: "plugged",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "connector.status",
      resource: { scope: "connector", evseId: 1, connectorId: 1 },
      previousStatus: "available",
      currentStatus: "occupied",
    }));
  });

  test("isolates async event listener failures from process unhandled rejections", async () => {
    const { actor } = createHarness();
    await actor.start();
    const events: ChargingPointActorEvent[] = [];
    const unhandledRejections: unknown[] = [];
    const handleUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", handleUnhandledRejection);

    try {
      actor.events.subscribe(async () => {
        throw new Error("async subscriber failed");
      });
      actor.events.subscribe((event) => {
        events.push(event);
      });

      await expect(actor.plug({ evseId: 1, connectorId: 1 })).resolves.toMatchObject({
        chargingPointId: "cp-1",
        evseId: 1,
        connectorId: 1,
        plugState: "plugged",
      });
      await flushMacrotasks();

      expect(unhandledRejections).toEqual([]);
      expect(events).toContainEqual(expect.objectContaining({
        type: "connector.status",
        resource: { scope: "connector", evseId: 1, connectorId: 1 },
        previousStatus: "available",
        currentStatus: "occupied",
      }));
    } finally {
      process.off("unhandledRejection", handleUnhandledRejection);
    }
  });

  test("does not expose protocol connector ids in actor operation results", async () => {
    const { actor } = createHarness();
    const events = collectChargingPointActorEvents(actor, [
      "connector.status",
      "transaction.status",
    ]);
    await actor.start();

    const plugResult = await actor.plug({ evseId: 1, connectorId: 1 });
    const startResult = await actor.startTransaction({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    });

    expect(plugResult).toMatchObject({
      evseId: 1,
      connectorId: 1,
    });
    expect("protocolConnectorId" in plugResult).toBe(false);
    expect("protocolDetails" in plugResult).toBe(false);
    expect(startResult).toMatchObject({
      status: "accepted",
      transactionId: "1001",
    });
    const connectorEvent = events.find((event) =>
      event.type === "connector.status" &&
      event.currentStatus === "occupied"
    );
    expect(connectorEvent?.resource).toMatchObject({
      scope: "connector",
      evseId: 1,
      connectorId: 1,
    });
    expect("protocolConnectorId" in (connectorEvent?.resource ?? {})).toBe(false);

    const transactionEvent = events.find((event) =>
      event.type === "transaction.status" &&
      event.currentStatus === "active"
    );
    expect(transactionEvent?.resource).toMatchObject({
      scope: "transaction",
      evseId: 1,
      connectorId: 1,
      transactionId: "1001",
    });
    expect("protocolConnectorId" in (transactionEvent?.resource ?? {})).toBe(false);
  });

  test("startTransaction rejects nonexistent connector pair before runtime start", async () => {
    const { actor, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, [
      "authorization.status",
      "transaction.status",
    ]);
    await actor.start();

    const result = await actor.startTransaction({
      evseId: 1,
      connectorId: 2,
      idTag: "CARD001",
      meterStartWh: 100,
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "枪口 1/2 不存在",
    });
    expect(protocolRuntime.startLocalTransactionInput).toBeNull();
    expect(protocolRuntime.calls).not.toContain("startLocalTransaction");
    expect(events).toEqual([]);
  });

  test("maps protocol connector action conflicts to actor invalid operations", async () => {
    const { actor, protocolRuntime } = createHarness();
    protocolRuntime.plugConnector = () => {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        "枪口 1/1 当前不可插枪",
      );
    };
    await actor.start();

    await expect(actor.plug({ evseId: 1, connectorId: 1 })).rejects.toMatchObject({
      code: "CHARGING_POINT_ACTOR_INVALID_OPERATION",
      message: "枪口 1/1 当前不可插枪",
    });
  });

  test("dispose releases embedded runtime resources and session listeners", async () => {
    const { actor, session, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, ["chargingPoint.lifecycle"]);
    await actor.start();

    await actor.dispose();
    const eventCountAfterDispose = events.length;
    session.emitOffline();

    expect(protocolRuntime.calls).toContain("dispose");
    expect(protocolRuntime.disposed).toBe(true);
    expect(session.disconnectCalls).toBe(1);
    expect(events).toHaveLength(eventCountAfterDispose);
  });

  test("startTransaction returns rejected results", async () => {
    const { actor, protocolRuntime } = createHarness();
    const events = collectChargingPointActorEvents(actor, [
      "authorization.status",
      "transaction.status",
    ]);
    protocolRuntime.startTransactionResult = {
      status: "Rejected",
      reason: "无效卡",
      authorizationStatus: "Invalid",
      statusNotificationResults: [],
    };
    await actor.start();

    const result = await actor.startTransaction({
      evseId: 1,
      connectorId: 1,
      idTag: "CARD001",
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "无效卡",
      authorizationStatus: "Invalid",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "authorization.status",
      resource: {
        scope: "authorization",
        idTag: "CARD001",
        evseId: 1,
        connectorId: 1,
      },
      status: "invalid",
      source: "online",
      protocolStatus: "Invalid",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "transaction.status",
      resource: {
        scope: "transaction",
        evseId: 1,
        connectorId: 1,
      },
      previousStatus: null,
      currentStatus: "rejected",
      reason: "无效卡",
    }));
  });

  test("online operations fail when actor is stopped", async () => {
    const { actor } = createHarness();

    await expect(
      actor.plug({ evseId: 1, connectorId: 1 }),
    ).rejects.toBeInstanceOf(ChargingPointActorError);
    await expect(
      actor.startTransaction({ evseId: 1, connectorId: 1, idTag: "CARD001" }),
    ).rejects.toMatchObject({ code: "CHARGING_POINT_ACTOR_NOT_RUNNING" });
  });
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function flushMacrotasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function flushRemoteCommand(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await flushMicrotasks();
  }
}
