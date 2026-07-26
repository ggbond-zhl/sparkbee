import type {
  AuthorizationRuntimeStatus,
  ChargingPointActorEvent,
  ChargingPointActorStatus,
  ChargingPointAvailabilityStatus,
  ChargingPointEventStreamMessage,
  ChargingPointSessionStatus,
  ChargingPointStatusEvent,
  ConnectorRuntimeStatus,
  EVSERuntimeStatus,
  ProtocolMessageEvent,
  ProtocolEvent,
  RuntimeAvailability,
  RuntimeSnapshotResponse,
  SessionStatusEvent,
  TransactionRuntimeStatus,
} from "@spark-bee/contracts";
import { formatRuntimeAvailabilityDetail } from "@/features/charging-points/model/runtimeAvailabilityPresentation";

export type {
  AuthorizationRuntimeSource,
  AuthorizationRuntimeStatus,
  ChargingPointActorEvent,
  ChargingPointActorEventError,
  ChargingPointActorStatus,
  ChargingPointAvailabilityEvent,
  ChargingPointAvailabilityStatus,
  ChargingPointEventStreamMessage,
  ChargingPointLifecycleEvent,
  ChargingPointSessionStatus,
  ChargingPointStatusEvent,
  ConnectorAvailabilityEvent,
  ConnectorRuntimeStatus,
  ConnectorStatusEvent,
  EVSERuntimeStatus,
  EVSEStatusEvent,
  ProtocolMessageEvent,
  RuntimeAvailability,
  SessionOfflineReason,
  SessionStatusEvent,
  TransactionMeterValueEvent,
  TransactionRuntimeStatus,
  TransactionStatusEvent,
} from "@spark-bee/contracts";

export type HeaderTone = "neutral" | "success" | "waiting" | "warning" | "destructive";

type RuntimeSessionStatusState = Omit<
  SessionStatusEvent,
  "id" | "sequence" | "protocol"
>;
type RuntimeChargingPointStatusState = Omit<
  ChargingPointStatusEvent,
  "id" | "sequence" | "protocol"
>;

export interface ConnectorRuntimeSnapshot {
  evseId: number;
  connectorId: number;
  currentStatus: ConnectorRuntimeStatus;
  occurredAt: string;
}

export interface ChargingPointAvailabilitySnapshot {
  currentAvailability: RuntimeAvailability;
  requestedAvailability?: RuntimeAvailability;
  occurredAt: string;
}

export interface ConnectorRuntimeAvailabilitySnapshot
  extends ChargingPointAvailabilitySnapshot {
  evseId: number;
  connectorId: number;
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
  powerW?: number;
  currentA?: number;
  voltageV?: number;
  sampledAt?: string;
  occurredAt: string;
}

export interface ChargingPointRuntimeIssue {
  label: string;
  tone: Extract<HeaderTone, "warning" | "destructive">;
  occurredAt: string;
}

export interface ChargingPointRuntimeEventState {
  sessionStatus: RuntimeSessionStatusState | null;
  chargingPointStatus: RuntimeChargingPointStatusState | null;
  chargingPointAvailability: ChargingPointAvailabilitySnapshot | null;
  evseStatuses: Record<string, EVSERuntimeSnapshot>;
  connectorStatuses: Record<string, ConnectorRuntimeSnapshot>;
  connectorAvailabilities: Record<string, ConnectorRuntimeAvailabilitySnapshot>;
  transactionStatuses: Record<string, TransactionRuntimeSnapshot>;
  lastHeartbeatAt: Date | null;
  recentIssue: ChargingPointRuntimeIssue | null;
}

export interface RuntimeEventLogEntry {
  id: string;
  occurredAt: string;
  eventType: Exclude<
    ChargingPointEventStreamMessage["event"],
    "snapshot" | "protocol.message" | "deleted"
  >;
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
    chargingPointAvailability: null,
    evseStatuses: {},
    connectorStatuses: {},
    connectorAvailabilities: {},
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
    case "deleted":
      return createChargingPointRuntimeEventState();
    case "chargingPoint.lifecycle":
      if (message.data.currentStatus === "stopped") {
        return createChargingPointRuntimeEventState();
      }

      return message.data.error === undefined
        ? state
        : withIssue(state, {
            label: `运行状态切换失败: ${message.data.error.message}`,
            tone: "destructive",
            occurredAt: message.data.occurredAt,
          });
    case "chargingPoint.boot":
      return state;
    case "session.status": {
      const nextState = { ...state, sessionStatus: message.data };
      if (message.data.error !== undefined) {
        return withIssue(nextState, {
          label: `${formatSessionStatus(message.data.currentStatus)}: ${message.data.error.message}`,
          tone: message.data.currentStatus === "reconnecting" ? "warning" : "destructive",
          occurredAt: message.data.occurredAt,
        });
      }

      if (message.data.currentStatus !== "offline" || message.data.reason === undefined) {
        return nextState;
      }

      if (message.data.reason === "intentional") {
        return nextState;
      }

      return withIssue(nextState, {
        label: message.data.reason === "reconnect_exhausted"
          ? "会话重连耗尽"
          : "会话意外断开",
        tone: message.data.reason === "reconnect_exhausted" ? "destructive" : "warning",
        occurredAt: message.data.occurredAt,
      });
    }
    case "chargingPoint.status": {
      const nextState = { ...state, chargingPointStatus: message.data };
      if (message.data.error !== undefined) {
        return withIssue(nextState, {
          label: `桩状态异常: ${message.data.error.message}`,
          tone: "destructive",
          occurredAt: message.data.occurredAt,
        });
      }

      return message.data.currentStatus === "faulted"
        ? withIssue(nextState, {
            label: "桩状态故障",
            tone: "destructive",
            occurredAt: message.data.occurredAt,
          })
        : nextState;
    }
    case "chargingPoint.availability":
      return {
        ...state,
        chargingPointAvailability: {
          currentAvailability: message.data.currentAvailability,
          ...(message.data.requestedAvailability === undefined
            ? {}
            : { requestedAvailability: message.data.requestedAvailability }),
          occurredAt: message.data.occurredAt,
        },
      };
    case "evse.status": {
      const nextState: ChargingPointRuntimeEventState = {
        ...state,
        evseStatuses: {
          ...state.evseStatuses,
          [String(message.data.resource.evseId)]: {
            evseId: message.data.resource.evseId,
            currentStatus: message.data.currentStatus,
            occurredAt: message.data.occurredAt,
          },
        },
      };
      if (message.data.error !== undefined) {
        return withIssue(nextState, {
          label: `EVSE ${message.data.resource.evseId} 异常: ${message.data.error.message}`,
          tone: "destructive",
          occurredAt: message.data.occurredAt,
        });
      }

      return message.data.currentStatus === "faulted"
        ? withIssue(nextState, {
            label: `EVSE ${message.data.resource.evseId} 故障`,
            tone: "destructive",
            occurredAt: message.data.occurredAt,
          })
        : nextState;
    }
    case "connector.status": {
      const { connectorId, evseId } = message.data.resource;
      const key = connectorKey(evseId, connectorId);
      const nextState: ChargingPointRuntimeEventState = {
        ...state,
        connectorStatuses: {
          ...state.connectorStatuses,
          [key]: {
            evseId,
            connectorId,
            currentStatus: message.data.currentStatus,
            occurredAt: message.data.occurredAt,
          },
        },
      };
      if (message.data.error !== undefined) {
        return withIssue(nextState, {
          label: `${formatConnectorLabel(connectorId)} 异常: ${message.data.error.message}`,
          tone: "destructive",
          occurredAt: message.data.occurredAt,
        });
      }

      return message.data.currentStatus === "faulted"
        ? withIssue(nextState, {
            label: `${formatConnectorLabel(connectorId)} 故障`,
            tone: "destructive",
            occurredAt: message.data.occurredAt,
          })
        : nextState;
    }
    case "connector.availability": {
      const { connectorId, evseId } = message.data.resource;
      return {
        ...state,
        connectorAvailabilities: {
          ...state.connectorAvailabilities,
          [connectorKey(evseId, connectorId)]: {
            evseId,
            connectorId,
            currentAvailability: message.data.currentAvailability,
            ...(message.data.requestedAvailability === undefined
              ? {}
              : { requestedAvailability: message.data.requestedAvailability }),
            occurredAt: message.data.occurredAt,
          },
        },
      };
    }
    case "authorization.status":
      return state;
    case "configuration.changed":
      return state;
    case "transaction-delivery.changed":
      return state;
    case "transaction.status": {
      const { connectorId, evseId } = message.data.resource;
      const transactionId = message.data.resource.transactionId ??
        connectorKey(evseId, connectorId);
      const previous = state.transactionStatuses[transactionId];
      const nextState: ChargingPointRuntimeEventState = {
        ...state,
        transactionStatuses: {
          ...state.transactionStatuses,
          [transactionId]: {
            transactionId,
            evseId,
            connectorId,
            currentStatus: message.data.currentStatus,
            ...(message.data.reason === undefined ? {} : { reason: message.data.reason }),
            ...(previous?.meterWh === undefined ? {} : { meterWh: previous.meterWh }),
            ...(previous?.powerW === undefined ? {} : { powerW: previous.powerW }),
            ...(previous?.currentA === undefined ? {} : { currentA: previous.currentA }),
            ...(previous?.voltageV === undefined ? {} : { voltageV: previous.voltageV }),
            ...(previous?.sampledAt === undefined ? {} : { sampledAt: previous.sampledAt }),
            occurredAt: message.data.occurredAt,
          },
        },
      };
      if (message.data.error !== undefined) {
        return withIssue(nextState, {
          label: `交易失败: ${message.data.error.message}`,
          tone: "destructive",
          occurredAt: message.data.occurredAt,
        });
      }

      return message.data.currentStatus === "failed"
        ? withIssue(nextState, {
            label: message.data.reason === undefined
              ? "交易失败"
              : `交易失败: ${message.data.reason}`,
            tone: "destructive",
            occurredAt: message.data.occurredAt,
          })
        : nextState;
    }
    case "transaction.meterValue": {
      const { connectorId, evseId, transactionId } = message.data.resource;
      const previous = state.transactionStatuses[transactionId];
      return {
        ...state,
        transactionStatuses: {
          ...state.transactionStatuses,
          [transactionId]: {
            transactionId,
            evseId,
            connectorId,
            currentStatus: previous?.currentStatus ?? "active",
            ...(previous?.reason === undefined ? {} : { reason: previous.reason }),
            meterWh: message.data.meterWh,
            powerW: message.data.powerW,
            currentA: message.data.currentA,
            voltageV: message.data.voltageV,
            sampledAt: message.data.sampledAt,
            occurredAt: message.data.occurredAt,
          },
        },
      };
    }
    case "protocol.message":
      return message.data.direction === "received" && message.data.action === "Heartbeat"
        ? { ...state, lastHeartbeatAt: new Date(message.data.occurredAt) }
        : state;
  }
}

export function reduceChargingPointRuntimeEventFeedState(
  state: ChargingPointRuntimeEventFeedState,
  message: ChargingPointEventStreamMessage,
): ChargingPointRuntimeEventFeedState {
  if (message.event === "snapshot" || message.event === "deleted") {
    return state;
  }

  if (message.event === "protocol.message") {
    return {
      ...state,
      protocolMessages: prepend(
        state.protocolMessages,
        toProtocolMessageLogEntry(message.data),
      ),
    };
  }

  return {
    ...state,
    events: prepend(state.events, toRuntimeEventLogEntry(message)),
  };
}

export function mergeChargingPointRuntimeEventFeedHistory(
  state: ChargingPointRuntimeEventFeedState,
  history: {
    events: ProtocolEvent[];
    protocolMessages: ProtocolMessageEvent[];
  },
): ChargingPointRuntimeEventFeedState {
  return {
    events: mergeLogEntries(
      state.events,
      history.events.map((event) => toRuntimeEventLogEntry({
        event: event.type,
        data: event,
      } as Exclude<
        ChargingPointEventStreamMessage,
        { event: "snapshot" } | { event: "protocol.message" } | { event: "deleted" }
      >)),
    ),
    protocolMessages: mergeLogEntries(
      state.protocolMessages,
      history.protocolMessages.map(toProtocolMessageLogEntry),
    ),
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
    chargingPointAvailability: snapshot.chargingPointAvailability,
    evseStatuses: Object.fromEntries(
      snapshot.evseStatuses.map((status) => [String(status.evseId), status]),
    ),
    connectorStatuses: Object.fromEntries(
      snapshot.connectorStatuses.map((status) => [
        connectorKey(status.evseId, status.connectorId),
        status,
      ]),
    ),
    connectorAvailabilities: Object.fromEntries(
      snapshot.connectorAvailabilities.map((availability) => [
        connectorKey(availability.evseId, availability.connectorId),
        availability,
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
    { event: "snapshot" } | { event: "protocol.message" } | { event: "deleted" }
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
    { event: "snapshot" } | { event: "protocol.message" } | { event: "deleted" }
  >,
) {
  switch (message.event) {
    case "chargingPoint.lifecycle":
      return `运行状态: ${formatActorStatus(message.data.currentStatus)}`;
    case "chargingPoint.boot":
      if (message.data.status === "Pending") {
        return message.data.retryAfterSec === undefined
          ? "BootNotification 待接受"
          : `BootNotification 待接受，${message.data.retryAfterSec} 秒后重试`;
      }

      return message.data.status === "Accepted"
        ? "BootNotification 已接受"
        : "BootNotification 已拒绝";
    case "session.status":
      return formatSessionStatus(message.data.currentStatus);
    case "chargingPoint.status":
      return `桩状态: ${formatAvailabilityStatus(message.data.currentStatus)}`;
    case "chargingPoint.availability":
      return `整桩可用性: ${formatRuntimeAvailabilityDetail(message.data)}`;
    case "evse.status":
      return `EVSE ${message.data.resource.evseId}: ${
        formatEVSEStatus(message.data.currentStatus)
      }`;
    case "connector.status":
      return `${formatConnectorLabel(message.data.resource.connectorId)}: ${
        formatConnectorStatus(message.data.currentStatus)
      }`;
    case "connector.availability":
      return `${formatConnectorLabel(message.data.resource.connectorId)} 可用性: ${
        formatRuntimeAvailabilityDetail(message.data)
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
    case "configuration.changed":
      return `协议配置 ${message.data.resource.key} 已更新`;
    case "transaction-delivery.changed":
      return `${formatDeliveryMessageType(message.data.messageType)}: ${
        formatDeliveryStatus(message.data.currentStatus)
      }`;
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
    return formatConnectorLabel(resource.connectorId);
  }

  if (resource.scope === "authorization") {
    return resource.connectorId === undefined || resource.evseId === undefined
      ? `鉴权 ${resource.idTag}`
      : formatConnectorLabel(resource.connectorId);
  }

  if (resource.scope === "transaction") {
    return resource.transactionId === undefined
      ? formatConnectorLabel(resource.connectorId)
      : `交易 ${resource.transactionId}`;
  }

  if (resource.scope === "configuration") {
    return `配置 ${resource.key}`;
  }

  if (resource.scope === "transactionDelivery") {
    return `交易交付 ${resource.deliverySequence}`;
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

function withIssue(
  state: ChargingPointRuntimeEventState,
  recentIssue: ChargingPointRuntimeIssue,
): ChargingPointRuntimeEventState {
  return { ...state, recentIssue };
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

function formatDeliveryMessageType(
  messageType: "start" | "meter_value" | "stop",
) {
  if (messageType === "start") return "StartTransaction";
  if (messageType === "meter_value") return "MeterValues";
  return "StopTransaction";
}

function formatDeliveryStatus(
  status: "pending" | "in_flight" | "retry_wait" | "delivered" | "failed",
) {
  if (status === "pending") return "待交付";
  if (status === "in_flight") return "发送中";
  if (status === "retry_wait") return "等待重试";
  if (status === "delivered") return "已交付";
  return "最终失败";
}

function prepend<TItem>(items: TItem[], item: TItem) {
  return [item, ...items];
}

function mergeLogEntries<TEntry extends { id: string; occurredAt: string }>(
  current: TEntry[],
  history: TEntry[],
): TEntry[] {
  const entries = new Map<string, TEntry>();
  for (const entry of [...current, ...history]) {
    if (!entries.has(entry.id)) entries.set(entry.id, entry);
  }
  return [...entries.values()].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt) ||
    right.id.localeCompare(left.id)
  );
}

function createLogEntryId(
  eventType: ChargingPointEventStreamMessage["event"],
  event: { id?: string; occurredAt?: string; messageId?: string },
) {
  if (event.id !== undefined) return event.id;
  return `${eventType}:${event.occurredAt ?? ""}:${event.messageId ?? ""}:${
    JSON.stringify(event).length
  }`;
}

function connectorKey(evseId: number, connectorId: number) {
  return `${evseId}/${connectorId}`;
}

function formatConnectorLabel(connectorId: number) {
  return `枪口 ${connectorId}`;
}
