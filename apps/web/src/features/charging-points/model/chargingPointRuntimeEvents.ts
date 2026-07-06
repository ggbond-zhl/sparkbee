import type { RuntimeSnapshotResponse } from "@spark-bee/contracts";

export type HeaderTone = "neutral" | "success" | "waiting" | "warning" | "destructive";

export type ChargingPointActorStatus = "starting" | "running" | "stopped";
export type ChargingPointSessionStatus = "online" | "reconnecting" | "offline";
export type ChargingPointAvailabilityStatus =
  | "available"
  | "unavailable"
  | "faulted";
export type ConnectorRuntimeStatus =
  | "available"
  | "occupied"
  | "unavailable"
  | "faulted";
export type EVSERuntimeStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "unavailable"
  | "faulted";
export type AuthorizationRuntimeStatus =
  | "accepted"
  | "blocked"
  | "expired"
  | "invalid"
  | "concurrent-transaction";
export type AuthorizationRuntimeSource =
  | "online"
  | "local-list"
  | "cache"
  | "default-policy";
export type TransactionRuntimeStatus =
  | "starting"
  | "active"
  | "suspended"
  | "ending"
  | "ended"
  | "rejected"
  | "failed";
export type SessionOfflineReason =
  | "intentional"
  | "unexpected_disconnect"
  | "reconnect_exhausted";

export interface ChargingPointActorEventError {
  code: string;
  message: string;
}

interface RuntimeEventBase<TType extends string, TResource> {
  type: TType;
  chargingPointId: string;
  resource: TResource;
  occurredAt: string;
}

export interface ChargingPointLifecycleEvent
  extends RuntimeEventBase<
    "chargingPoint.lifecycle",
    { scope: "chargingPoint" }
  > {
  previousStatus: ChargingPointActorStatus | null;
  currentStatus: ChargingPointActorStatus;
  error?: ChargingPointActorEventError;
}

export interface SessionStatusEvent
  extends RuntimeEventBase<"session.status", { scope: "session" }> {
  previousStatus: ChargingPointSessionStatus | null;
  currentStatus: ChargingPointSessionStatus;
  connectionUrl: string;
  attempt?: number;
  reason?: SessionOfflineReason;
  error?: ChargingPointActorEventError;
}

export interface ChargingPointStatusEvent
  extends RuntimeEventBase<
    "chargingPoint.status",
    { scope: "chargingPoint" }
  > {
  previousStatus: ChargingPointAvailabilityStatus | null;
  currentStatus: ChargingPointAvailabilityStatus;
  error?: ChargingPointActorEventError;
}

export interface EVSEStatusEvent
  extends RuntimeEventBase<
    "evse.status",
    { scope: "evse"; evseId: number }
  > {
  previousStatus: EVSERuntimeStatus | null;
  currentStatus: EVSERuntimeStatus;
  error?: ChargingPointActorEventError;
}

export interface ConnectorStatusEvent
  extends RuntimeEventBase<
    "connector.status",
    { scope: "connector"; evseId: number; connectorId: number }
  > {
  previousStatus: ConnectorRuntimeStatus | null;
  currentStatus: ConnectorRuntimeStatus;
  error?: ChargingPointActorEventError;
}

export interface AuthorizationStatusEvent
  extends RuntimeEventBase<
    "authorization.status",
    {
      scope: "authorization";
      idTag: string;
      evseId?: number;
      connectorId?: number;
    }
  > {
  status: AuthorizationRuntimeStatus;
  source: AuthorizationRuntimeSource;
  protocolStatus?: string;
}

export interface TransactionStatusEvent
  extends RuntimeEventBase<
    "transaction.status",
    {
      scope: "transaction";
      evseId: number;
      connectorId: number;
      transactionId?: string;
    }
  > {
  previousStatus: TransactionRuntimeStatus | null;
  currentStatus: TransactionRuntimeStatus;
  reason?: string;
  error?: ChargingPointActorEventError;
}

export interface TransactionMeterValueEvent
  extends RuntimeEventBase<
    "transaction.meterValue",
    {
      scope: "transaction";
      evseId: number;
      connectorId: number;
      transactionId: string;
    }
  > {
  meterWh: number;
  sampledAt: string;
}

export interface ProtocolMessageEvent
  extends RuntimeEventBase<"protocol.message", { scope: "protocol" }> {
  direction: "sent" | "received";
  action?: string;
  messageId?: string;
  body?: unknown;
}

export type ChargingPointActorEvent =
  | ChargingPointLifecycleEvent
  | SessionStatusEvent
  | ChargingPointStatusEvent
  | EVSEStatusEvent
  | ConnectorStatusEvent
  | AuthorizationStatusEvent
  | TransactionStatusEvent
  | TransactionMeterValueEvent
  | ProtocolMessageEvent;

export type ChargingPointEventStreamMessage =
  | { event: "snapshot"; data: RuntimeSnapshotResponse }
  | { event: "chargingPoint.lifecycle"; data: ChargingPointLifecycleEvent }
  | { event: "session.status"; data: SessionStatusEvent }
  | { event: "chargingPoint.status"; data: ChargingPointStatusEvent }
  | { event: "evse.status"; data: EVSEStatusEvent }
  | { event: "connector.status"; data: ConnectorStatusEvent }
  | { event: "authorization.status"; data: AuthorizationStatusEvent }
  | { event: "transaction.status"; data: TransactionStatusEvent }
  | { event: "transaction.meterValue"; data: TransactionMeterValueEvent }
  | { event: "protocol.message"; data: ProtocolMessageEvent };

export interface ConnectorRuntimeSnapshot {
  evseId: number;
  connectorId: number;
  currentStatus: ConnectorRuntimeStatus;
  occurredAt: string;
}

export interface EVSERuntimeSnapshot {
  evseId: number;
  currentStatus: EVSERuntimeStatus;
  occurredAt: string;
}

export interface TransactionRuntimeSnapshot {
  transactionId: string;
  evseId: number;
  connectorId: number;
  currentStatus: TransactionRuntimeStatus;
  reason?: string;
  meterWh?: number;
  sampledAt?: string;
  occurredAt: string;
}

export interface ChargingPointRuntimeIssue {
  label: string;
  tone: Extract<HeaderTone, "warning" | "destructive">;
  occurredAt: string;
}

export interface ChargingPointRuntimeEventState {
  sessionStatus: SessionStatusEvent | null;
  chargingPointStatus: ChargingPointStatusEvent | null;
  evseStatuses: Record<string, EVSERuntimeSnapshot>;
  connectorStatuses: Record<string, ConnectorRuntimeSnapshot>;
  transactionStatuses: Record<string, TransactionRuntimeSnapshot>;
  lastHeartbeatAt: Date | null;
  recentIssue: ChargingPointRuntimeIssue | null;
}

export interface RuntimeEventLogEntry {
  id: string;
  occurredAt: string;
  eventType: Exclude<ChargingPointEventStreamMessage["event"], "snapshot" | "protocol.message">;
  resource: string;
  summary: string;
  detail: unknown;
}

export interface ProtocolMessageLogEntry {
  id: string;
  occurredAt: string;
  direction: "sent" | "received";
  action: string;
  messageId: string;
  summary: string;
  detail: unknown;
}

export interface ChargingPointRuntimeEventFeedState {
  events: RuntimeEventLogEntry[];
  protocolMessages: ProtocolMessageLogEntry[];
}

export function createChargingPointRuntimeEventState(): ChargingPointRuntimeEventState {
  return {
    sessionStatus: null,
    chargingPointStatus: null,
    evseStatuses: {},
    connectorStatuses: {},
    transactionStatuses: {},
    lastHeartbeatAt: null,
    recentIssue: null,
  };
}

export function createChargingPointRuntimeEventFeedState(): ChargingPointRuntimeEventFeedState {
  return {
    events: [],
    protocolMessages: [],
  };
}

export function reduceChargingPointRuntimeEventState(
  state: ChargingPointRuntimeEventState,
  message: ChargingPointEventStreamMessage,
): ChargingPointRuntimeEventState {
  switch (message.event) {
    case "snapshot":
      return createChargingPointRuntimeEventStateFromSnapshot(message.data);
    case "chargingPoint.lifecycle":
      return reduceLifecycleEvent(state, message.data);
    case "session.status":
      return reduceSessionStatusEvent(state, message.data);
    case "chargingPoint.status":
      return reduceChargingPointStatusEvent(state, message.data);
    case "evse.status":
      return reduceEVSEStatusEvent(state, message.data);
    case "connector.status":
      return reduceConnectorStatusEvent(state, message.data);
    case "authorization.status":
      return state;
    case "transaction.status":
      return reduceTransactionStatusEvent(state, message.data);
    case "transaction.meterValue":
      return reduceTransactionMeterValueEvent(state, message.data);
    case "protocol.message":
      return reduceProtocolMessageEvent(state, message.data);
  }
}

export function reduceChargingPointRuntimeEventFeedState(
  state: ChargingPointRuntimeEventFeedState,
  message: ChargingPointEventStreamMessage,
): ChargingPointRuntimeEventFeedState {
  if (message.event === "snapshot") {
    return state;
  }

  if (message.event === "protocol.message") {
    return {
      ...state,
      protocolMessages: prependAndLimit(
        state.protocolMessages,
        toProtocolMessageLogEntry(message.data),
      ),
    };
  }

  return {
    ...state,
    events: prependAndLimit(state.events, toRuntimeEventLogEntry(message)),
  };
}

function createChargingPointRuntimeEventStateFromSnapshot(
  snapshot: RuntimeSnapshotResponse,
): ChargingPointRuntimeEventState {
  return {
    sessionStatus: snapshot.sessionStatus === null
      ? null
      : {
          type: "session.status",
          chargingPointId: snapshot.chargingPointId,
          resource: { scope: "session" },
          occurredAt: snapshot.sessionStatus.occurredAt,
          previousStatus: null,
          currentStatus: snapshot.sessionStatus.currentStatus,
          connectionUrl: snapshot.sessionStatus.connectionUrl,
          ...(snapshot.sessionStatus.attempt === undefined
            ? {}
            : { attempt: snapshot.sessionStatus.attempt }),
          ...(snapshot.sessionStatus.reason === undefined
            ? {}
            : { reason: snapshot.sessionStatus.reason }),
        },
    chargingPointStatus: snapshot.chargingPointStatus === null
      ? null
      : {
          type: "chargingPoint.status",
          chargingPointId: snapshot.chargingPointId,
          resource: { scope: "chargingPoint" },
          occurredAt: snapshot.chargingPointStatus.occurredAt,
          previousStatus: null,
          currentStatus: snapshot.chargingPointStatus.currentStatus,
        },
    evseStatuses: Object.fromEntries(
      snapshot.evseStatuses.map((status) => [String(status.evseId), status]),
    ),
    connectorStatuses: Object.fromEntries(
      snapshot.connectorStatuses.map((status) => [
        connectorKey(status.evseId, status.connectorId),
        status,
      ]),
    ),
    transactionStatuses: Object.fromEntries(
      snapshot.transactionStatuses.map((status) => [status.transactionId, status]),
    ),
    lastHeartbeatAt: snapshot.lastHeartbeatAt === null
      ? null
      : new Date(snapshot.lastHeartbeatAt),
    recentIssue: snapshot.recentIssue,
  };
}

function reduceLifecycleEvent(
  state: ChargingPointRuntimeEventState,
  event: ChargingPointLifecycleEvent,
): ChargingPointRuntimeEventState {
  const nextState = event.currentStatus === "stopped"
    ? {
        ...clearVolatileRuntimeState(state),
        sessionStatus: {
          type: "session.status" as const,
          chargingPointId: event.chargingPointId,
          resource: { scope: "session" as const },
          occurredAt: event.occurredAt,
          previousStatus: state.sessionStatus?.currentStatus ?? null,
          currentStatus: "offline" as const,
          connectionUrl: state.sessionStatus?.connectionUrl ?? "",
          reason: "intentional" as const,
        },
      }
    : state;

  return event.error === undefined
    ? nextState
    : withIssue(nextState, {
        label: `运行状态切换失败: ${event.error.message}`,
        tone: "destructive",
        occurredAt: event.occurredAt,
      });
}

function reduceSessionStatusEvent(
  state: ChargingPointRuntimeEventState,
  event: SessionStatusEvent,
): ChargingPointRuntimeEventState {
  let nextState: ChargingPointRuntimeEventState = {
    ...state,
    sessionStatus: event,
  };

  if (event.error !== undefined) {
    nextState = withIssue(nextState, {
      label: `${formatSessionStatus(event.currentStatus)}: ${event.error.message}`,
      tone: event.currentStatus === "reconnecting" ? "warning" : "destructive",
      occurredAt: event.occurredAt,
    });
  }

  if (event.currentStatus === "offline" && event.reason !== undefined) {
    nextState = withIssueForOfflineReason(nextState, event);
  }

  return nextState;
}

function reduceChargingPointStatusEvent(
  state: ChargingPointRuntimeEventState,
  event: ChargingPointStatusEvent,
): ChargingPointRuntimeEventState {
  const nextState: ChargingPointRuntimeEventState = {
    ...state,
    chargingPointStatus: event,
  };

  if (event.error !== undefined) {
    return withIssue(nextState, {
      label: `桩状态异常: ${event.error.message}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  if (event.currentStatus === "faulted") {
    return withIssue(nextState, {
      label: "桩状态故障",
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  return nextState;
}

function reduceEVSEStatusEvent(
  state: ChargingPointRuntimeEventState,
  event: EVSEStatusEvent,
): ChargingPointRuntimeEventState {
  const nextState: ChargingPointRuntimeEventState = {
    ...state,
    evseStatuses: {
      ...state.evseStatuses,
      [String(event.resource.evseId)]: {
        evseId: event.resource.evseId,
        currentStatus: event.currentStatus,
        occurredAt: event.occurredAt,
      },
    },
  };

  if (event.error !== undefined) {
    return withIssue(nextState, {
      label: `EVSE ${event.resource.evseId} 异常: ${event.error.message}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  if (event.currentStatus === "faulted") {
    return withIssue(nextState, {
      label: `EVSE ${event.resource.evseId} 故障`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  return nextState;
}

function reduceConnectorStatusEvent(
  state: ChargingPointRuntimeEventState,
  event: ConnectorStatusEvent,
): ChargingPointRuntimeEventState {
  const key = connectorKey(event.resource.evseId, event.resource.connectorId);
  const nextState: ChargingPointRuntimeEventState = {
    ...state,
    connectorStatuses: {
      ...state.connectorStatuses,
      [key]: {
        evseId: event.resource.evseId,
        connectorId: event.resource.connectorId,
        currentStatus: event.currentStatus,
        occurredAt: event.occurredAt,
      },
    },
  };

  if (event.error !== undefined) {
    return withIssue(nextState, {
      label: `枪口 ${key} 异常: ${event.error.message}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  if (event.currentStatus === "faulted") {
    return withIssue(nextState, {
      label: `枪口 ${key} 故障`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  return nextState;
}

function reduceTransactionStatusEvent(
  state: ChargingPointRuntimeEventState,
  event: TransactionStatusEvent,
): ChargingPointRuntimeEventState {
  const key = transactionKey(event);
  const previous = state.transactionStatuses[key];
  const nextState: ChargingPointRuntimeEventState = {
    ...state,
    transactionStatuses: {
      ...state.transactionStatuses,
      [key]: {
        transactionId: key,
        evseId: event.resource.evseId,
        connectorId: event.resource.connectorId,
        currentStatus: event.currentStatus,
        reason: event.reason,
        meterWh: previous?.meterWh,
        sampledAt: previous?.sampledAt,
        occurredAt: event.occurredAt,
      },
    },
  };

  if (event.error !== undefined) {
    return withIssue(nextState, {
      label: `交易失败: ${event.error.message}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  if (event.currentStatus === "failed") {
    return withIssue(nextState, {
      label: event.reason === undefined ? "交易失败" : `交易失败: ${event.reason}`,
      tone: "destructive",
      occurredAt: event.occurredAt,
    });
  }

  return nextState;
}

function reduceTransactionMeterValueEvent(
  state: ChargingPointRuntimeEventState,
  event: TransactionMeterValueEvent,
): ChargingPointRuntimeEventState {
  const key = event.resource.transactionId;
  const previous = state.transactionStatuses[key];

  return {
    ...state,
    transactionStatuses: {
      ...state.transactionStatuses,
      [key]: {
        transactionId: key,
        evseId: event.resource.evseId,
        connectorId: event.resource.connectorId,
        currentStatus: previous?.currentStatus ?? "active",
        reason: previous?.reason,
        meterWh: event.meterWh,
        sampledAt: event.sampledAt,
        occurredAt: event.occurredAt,
      },
    },
  };
}

function reduceProtocolMessageEvent(
  state: ChargingPointRuntimeEventState,
  event: ProtocolMessageEvent,
): ChargingPointRuntimeEventState {
  if (event.action !== "Heartbeat" || event.direction !== "received") {
    return state;
  }

  return {
    ...state,
    lastHeartbeatAt: new Date(event.occurredAt),
  };
}

function clearVolatileRuntimeState(
  state: ChargingPointRuntimeEventState,
): ChargingPointRuntimeEventState {
  return {
    ...state,
    sessionStatus: null,
    chargingPointStatus: null,
    evseStatuses: {},
    connectorStatuses: {},
    transactionStatuses: {},
  };
}

function withIssue(
  state: ChargingPointRuntimeEventState,
  issue: ChargingPointRuntimeIssue,
): ChargingPointRuntimeEventState {
  return {
    ...state,
    recentIssue: issue,
  };
}

function withIssueForOfflineReason(
  state: ChargingPointRuntimeEventState,
  event: SessionStatusEvent,
) {
  if (event.reason === "intentional") {
    return state;
  }

  return withIssue(state, {
    label: event.reason === "reconnect_exhausted"
      ? "会话重连耗尽"
      : "会话意外断开",
    tone: event.reason === "reconnect_exhausted" ? "destructive" : "warning",
    occurredAt: event.occurredAt,
  });
}

function formatSessionStatus(status: ChargingPointSessionStatus) {
  if (status === "online") {
    return "会话在线";
  }

  if (status === "reconnecting") {
    return "会话重连中";
  }

  return "会话离线";
}

function toRuntimeEventLogEntry(
  message: Exclude<
    ChargingPointEventStreamMessage,
    { event: "snapshot" } | { event: "protocol.message" }
  >,
): RuntimeEventLogEntry {
  return {
    id: createLogEntryId(message.event, message.data),
    occurredAt: message.data.occurredAt,
    eventType: message.event,
    resource: formatResource(message.data.resource),
    summary: formatRuntimeEventSummary(message),
    detail: message.data,
  };
}

function toProtocolMessageLogEntry(event: ProtocolMessageEvent): ProtocolMessageLogEntry {
  const action = event.action ?? "--";
  const messageId = event.messageId ?? "--";

  return {
    id: createLogEntryId("protocol.message", event),
    occurredAt: event.occurredAt,
    direction: event.direction,
    action,
    messageId,
    summary: `${event.direction === "received" ? "收到" : "发送"} ${action}`,
    detail: event.body ?? event,
  };
}

function formatRuntimeEventSummary(
  message: Exclude<
    ChargingPointEventStreamMessage,
    { event: "snapshot" } | { event: "protocol.message" }
  >,
) {
  switch (message.event) {
    case "chargingPoint.lifecycle":
      return `运行状态: ${formatActorStatus(message.data.currentStatus)}`;
    case "session.status":
      return formatSessionStatus(message.data.currentStatus);
    case "chargingPoint.status":
      return `桩状态: ${formatAvailabilityStatus(message.data.currentStatus)}`;
    case "evse.status":
      return `EVSE ${message.data.resource.evseId}: ${
        formatEVSEStatus(message.data.currentStatus)
      }`;
    case "connector.status":
      return `枪口 ${
        connectorKey(message.data.resource.evseId, message.data.resource.connectorId)
      }: ${
        formatConnectorStatus(message.data.currentStatus)
      }`;
    case "authorization.status":
      return `idTag ${message.data.resource.idTag}: ${
        formatAuthorizationStatus(message.data.status)
      }`;
    case "transaction.status":
      return `交易 ${message.data.resource.transactionId ?? "--"}: ${
        formatTransactionStatus(message.data.currentStatus)
      }`;
    case "transaction.meterValue":
      return `交易 ${message.data.resource.transactionId}: ${
        message.data.meterWh.toFixed(3)
      } Wh`;
  }
}

function formatResource(resource: ChargingPointActorEvent["resource"]) {
  if (resource.scope === "chargingPoint") {
    return "整桩";
  }

  if (resource.scope === "session") {
    return "会话";
  }

  if (resource.scope === "evse") {
    return `EVSE ${resource.evseId}`;
  }

  if (resource.scope === "connector") {
    return `枪口 ${connectorKey(resource.evseId, resource.connectorId)}`;
  }

  if (resource.scope === "authorization") {
    return resource.connectorId === undefined || resource.evseId === undefined
      ? `鉴权 ${resource.idTag}`
      : `枪口 ${connectorKey(resource.evseId, resource.connectorId)}`;
  }

  if (resource.scope === "transaction") {
    return resource.transactionId === undefined
      ? `枪口 ${connectorKey(resource.evseId, resource.connectorId)}`
      : `交易 ${resource.transactionId}`;
  }

  return "协议";
}

function formatActorStatus(status: ChargingPointActorStatus) {
  if (status === "starting") {
    return "启动中";
  }

  if (status === "running") {
    return "运行中";
  }

  return "已停止";
}

function formatAvailabilityStatus(status: ChargingPointAvailabilityStatus) {
  if (status === "available") {
    return "可用";
  }

  if (status === "unavailable") {
    return "不可用";
  }

  return "故障";
}

function formatEVSEStatus(status: EVSERuntimeStatus) {
  if (status === "reserved") {
    return "已预约";
  }

  return formatConnectorStatus(status);
}

function formatConnectorStatus(status: ConnectorRuntimeStatus | Exclude<EVSERuntimeStatus, "reserved">) {
  if (status === "available") {
    return "可用";
  }

  if (status === "occupied") {
    return "占用";
  }

  if (status === "unavailable") {
    return "不可用";
  }

  return "故障";
}

function formatAuthorizationStatus(status: AuthorizationRuntimeStatus) {
  if (status === "accepted") {
    return "已接受";
  }

  if (status === "blocked") {
    return "已阻止";
  }

  if (status === "expired") {
    return "已过期";
  }

  if (status === "invalid") {
    return "无效";
  }

  return "并发交易冲突";
}

function formatTransactionStatus(status: TransactionRuntimeStatus) {
  if (status === "starting") {
    return "启动中";
  }

  if (status === "active") {
    return "进行中";
  }

  if (status === "suspended") {
    return "已挂起";
  }

  if (status === "ending") {
    return "停止中";
  }

  if (status === "ended") {
    return "已结束";
  }

  if (status === "rejected") {
    return "已拒绝";
  }

  return "失败";
}

function prependAndLimit<TItem>(items: TItem[], item: TItem) {
  return [item, ...items].slice(0, 200);
}

function createLogEntryId(
  eventType: ChargingPointEventStreamMessage["event"],
  event: { occurredAt?: string; messageId?: string },
) {
  return `${eventType}:${event.occurredAt ?? ""}:${event.messageId ?? ""}:${
    JSON.stringify(event).length
  }`;
}

function connectorKey(evseId: number, connectorId: number) {
  return `${evseId}/${connectorId}`;
}

function transactionKey(event: TransactionStatusEvent) {
  return event.resource.transactionId ??
    connectorKey(event.resource.evseId, event.resource.connectorId);
}
