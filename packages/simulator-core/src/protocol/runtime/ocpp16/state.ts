import { randomUUID } from "node:crypto";

import {
  AuthorizationGrant,
  ChargingPoint,
  LocalAuthorizationList,
  type Transaction,
  type Connector,
} from "../../../model";
import {
  DEFAULT_HEARTBEAT_RECONNECT_THRESHOLD,
  DEFAULT_HEARTBEAT_TIME_DRIFT_THRESHOLD_MS,
  DEFAULT_HEARTBEAT_UNSTABLE_THRESHOLD,
  normalizeNullableNonNegativeInteger,
  normalizePositiveInteger,
} from "./constants";
import type {
  Ocpp16HeartbeatLoopOptions,
  Ocpp16RuntimeEvent,
  Ocpp16RuntimeOptions,
  Ocpp16RegistrationStatus,
} from "./types";
import { ConfigurationStore } from "./ConfigurationStore/index";
import { ProtocolRuntimeError } from "./errors";
import { createProtocolClock } from "./protocolClock";
import { MemoryOfflineTransactionOutbox } from "./OfflineTransactionOutbox";
import type { OfflineTransactionOutbox } from "./OfflineTransactionOutbox";

export interface Ocpp16RuntimeThresholds {
  heartbeatUnstableThreshold: number;
  heartbeatReconnectThreshold: number;
  heartbeatTimeDriftThresholdMs: number | null;
}

export interface Ocpp16RuntimeContext {
  session: Ocpp16RuntimeOptions["session"];
  clock: () => Date;
  isProtocolClockSynced: () => boolean;
  syncProtocolClock: (currentTime: Date) => void;
  idGenerator: () => string;
  emitRuntimeEvent: (event: Ocpp16RuntimeEvent) => void;
  thresholds: Ocpp16RuntimeThresholds;
  registrationStatus: Ocpp16RegistrationStatus | "Unregistered";
  chargingPoint: ChargingPoint;
  configurationStore: ConfigurationStore;
  localAuthorizationList: LocalAuthorizationList;
  authorizationGrants: Map<string, AuthorizationGrant>;
  authorizationCache: Map<string, AuthorizationGrant>;
  authorizationAttemptSequences: Map<string, number>;
  transactions: Map<string, Transaction>;
  ocppTransactionIds: Map<string, number>;
  offlineTransactionOutbox: OfflineTransactionOutbox;
  offlineTransactionReplayInProgress: boolean;
  heartbeatTimerId: ReturnType<typeof setInterval> | null;
  heartbeatLoopOptions: Ocpp16HeartbeatLoopOptions | null;
  meterValueLoops: Map<string, {
    timerId: ReturnType<typeof setInterval>;
    isReporting: boolean;
    intervalSec: number;
  }>;
}

export function createOcpp16RuntimeContext(
  options: Ocpp16RuntimeOptions,
  emitRuntimeEvent: (event: Ocpp16RuntimeEvent) => void = () => {},
): Ocpp16RuntimeContext {
  const chargingPoint = options.chargingPoint instanceof ChargingPoint
    ? options.chargingPoint
    : new ChargingPoint(options.chargingPoint);
  ensureOcpp16EvseConnectorProjection(chargingPoint);
  const protocolClock = options.protocolClock ??
    createProtocolClock(options.clock ?? (() => new Date()));
  const clock = () => protocolClock.now();
  const configurationStore = new ConfigurationStore(
    chargingPoint.id,
    options.configurationCatalog,
  );
  configurationStore.sync(
    "NumberOfConnectors",
    String(chargingPoint.listEvses().length),
    clock(),
  );
  const localAuthorizationList = new LocalAuthorizationList({
    chargingPointId: chargingPoint.id,
    version: 0,
    updatedAt: clock(),
    source: "ocpp16",
  });
  const transactions = new Map<string, Transaction>();
  const authorizationGrants = new Map<string, AuthorizationGrant>();
  const authorizationCache = new Map<string, AuthorizationGrant>();
  const authorizationAttemptSequences = new Map<string, number>();
  const ocppTransactionIds = new Map<string, number>();
  const meterValueLoops = new Map<string, {
    timerId: ReturnType<typeof setInterval>;
    isReporting: boolean;
    intervalSec: number;
  }>();

  return {
    session: options.session,
    clock,
    isProtocolClockSynced: () => protocolClock.isSynced(),
    syncProtocolClock: (currentTime) => protocolClock.sync(currentTime),
    idGenerator: options.idGenerator ?? randomUUID,
    emitRuntimeEvent,
    thresholds: createThresholds(options),
    registrationStatus: "Unregistered",
    chargingPoint,
    configurationStore,
    localAuthorizationList,
    authorizationGrants,
    authorizationCache,
    authorizationAttemptSequences,
    transactions,
    ocppTransactionIds,
    offlineTransactionOutbox:
      options.offlineTransactionOutbox ?? new MemoryOfflineTransactionOutbox(),
    offlineTransactionReplayInProgress: false,
    heartbeatTimerId: null,
    heartbeatLoopOptions: null,
    meterValueLoops,
  };
}

export function shouldSyncProtocolClock(
  context: Ocpp16RuntimeContext,
  currentTime: Date,
): boolean {
  const driftThresholdMs = context.thresholds.heartbeatTimeDriftThresholdMs;
  if (!context.isProtocolClockSynced() || driftThresholdMs === null) {
    return true;
  }

  return Math.abs(currentTime.getTime() - context.clock().getTime()) <=
    driftThresholdMs;
}

function ensureOcpp16EvseConnectorProjection(chargingPoint: ChargingPoint): void {
  const connectorEvseIds = new Map<number, number>();

  for (const evse of chargingPoint.listEvses()) {
    const connectors = evse.listConnectors();
    if (connectors.length !== 1) {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        `OCPP 1.6 EVSE ${evse.id} 必须有且仅有一个 Connector，当前为 ${connectors.length} 个`,
      );
    }

    const [connector] = connectors as [Connector];
    const existingEvseId = connectorEvseIds.get(connector.id);
    if (existingEvseId !== undefined) {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        `OCPP 1.6 connectorId ${connector.id} 在 EVSE ${existingEvseId} 与 EVSE ${evse.id} 中重复`,
      );
    }

    connectorEvseIds.set(connector.id, evse.id);
  }
}

function createThresholds(
  options: Ocpp16RuntimeOptions,
): Ocpp16RuntimeThresholds {
  return {
    heartbeatUnstableThreshold: normalizePositiveInteger(
      options.heartbeatUnstableThreshold,
      DEFAULT_HEARTBEAT_UNSTABLE_THRESHOLD,
      "heartbeatUnstableThreshold",
    ),
    heartbeatReconnectThreshold: normalizePositiveInteger(
      options.heartbeatReconnectThreshold,
      DEFAULT_HEARTBEAT_RECONNECT_THRESHOLD,
      "heartbeatReconnectThreshold",
    ),
    heartbeatTimeDriftThresholdMs: normalizeNullableNonNegativeInteger(
      options.heartbeatTimeDriftThresholdMs,
      DEFAULT_HEARTBEAT_TIME_DRIFT_THRESHOLD_MS,
      "heartbeatTimeDriftThresholdMs",
    ),
  };
}
