import type {
  ActiveTransactionSamplesResponse,
  ChargingPointDetailResponse,
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";

import {
  buildConnectorCardModels,
  type ConnectorCardModel,
} from "./chargingPointConnectorCards";
import {
  buildActiveChargingSampleSeriesByConnector,
  chargingSampleConnectorKey,
  type ChargingSamplePoint,
} from "./chargingPointChargingSamples";
import {
  buildChargingPointDetailHeaderModel,
  type ChargingPointDetailHeaderModel,
  type RuntimeStatusQueryState,
} from "./chargingPointDetailHeader";
import type {
  ChargingPointRuntimeEventFeedState,
  ChargingPointRuntimeEventState,
  ProtocolMessageLogEntry,
  RuntimeEventLogEntry,
} from "./chargingPointRuntimeEvents";
import type { ObservationTimeFilter } from "./chargingPointObservationFilters";

interface ConnectorWorkbenchItem {
  model: ConnectorCardModel;
  samples: ChargingSamplePoint[];
}

interface ChargingPointEditorWorkbench {
  open: boolean;
  openEditor(): void;
  setOpen(open: boolean): void;
  save(updatedItem: ChargingPointDetailResponse): Promise<void>;
}

interface ConnectorEditorWorkbench {
  target: ConnectorResponse | null;
  open(connector: ConnectorResponse): void;
  setOpen(open: boolean): void;
  save(savedConnector: ConnectorResponse): Promise<void>;
}

export interface ChargingPointObservationWorkbench {
  events: RuntimeEventLogEntry[];
  protocolMessages: ProtocolMessageLogEntry[];
  messageTimeFilter: ObservationTimeFilter;
  eventTimeFilter: ObservationTimeFilter;
  messageTypeFilter: string;
  eventTypeFilter: string;
  messageDirectionFilter: "all" | "sent" | "received";
  setMessageTimeFilter(value: ObservationTimeFilter): void;
  setEventTimeFilter(value: ObservationTimeFilter): void;
  setMessageTypeFilter(value: string): void;
  setEventTypeFilter(value: string): void;
  setMessageDirectionFilter(value: "all" | "sent" | "received"): void;
  messageHistory: ObservationHistoryPagination;
  eventHistory: ObservationHistoryPagination;
}

interface ObservationHistoryPagination {
  capacity: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore(): void;
}

export interface ReadyChargingPointWorkbench {
  status: "ready";
  detail: ChargingPointDetailResponse;
  headerModel: ChargingPointDetailHeaderModel;
  connectorItems: ConnectorWorkbenchItem[];
  observation: ChargingPointObservationWorkbench;
  runtime: {
    pending: boolean;
    applyPrimaryAction(): void;
  };
  connectors: {
    pending: boolean;
    plug(connectorId: string): void;
    unplug(connectorId: string): void;
    startTransaction(connectorId: string, idTag: string): void;
    stopTransaction(connectorId: string, transactionId: string): void;
  };
  configuration: {
    locked: boolean;
    lockedReason?: string;
    connectorEditLockedReason?: string;
  };
  chargingPointEditor: ChargingPointEditorWorkbench;
  connectorEditor: ConnectorEditorWorkbench;
}

export type ChargingPointWorkbench =
  | { status: "loading" }
  | { status: "error" }
  | ReadyChargingPointWorkbench;

export interface CreateReadyChargingPointWorkbenchInput {
  detail: ChargingPointDetailResponse;
  runtimeStatus?: RuntimeOperationResponse;
  runtimeStatusQueryState: RuntimeStatusQueryState;
  runtimeEventState: ChargingPointRuntimeEventState;
  eventFeedState: ChargingPointRuntimeEventFeedState;
  observation?: ChargingPointObservationWorkbench;
  activeTransactionSamples: ActiveTransactionSamplesResponse;
  pending: {
    runtime: boolean;
    connectors: boolean;
  };
  actions: {
    startRuntime(): void;
    stopRuntime(): void;
    plug(connectorId: string): void;
    unplug(connectorId: string): void;
    startTransaction(connectorId: string, idTag: string): void;
    stopTransaction(connectorId: string, transactionId: string): void;
  };
  chargingPointEditor: ChargingPointEditorWorkbench;
  connectorEditor: ConnectorEditorWorkbench;
}

export function createReadyChargingPointWorkbench(
  input: CreateReadyChargingPointWorkbenchInput,
): ReadyChargingPointWorkbench {
  const headerModel = buildChargingPointDetailHeaderModel({
    detail: input.detail,
    runtimeStatus: input.runtimeStatus,
    statusQueryState: input.runtimeStatusQueryState,
    lastHeartbeatAt: null,
    runtimeEventState: input.runtimeEventState,
  });
  const chargingSamplesByConnector = buildActiveChargingSampleSeriesByConnector({
    persisted: input.activeTransactionSamples,
    events: input.eventFeedState.events,
    transactionStatuses: input.runtimeEventState.transactionStatuses,
  });
  const connectorItems = buildConnectorCardModels({
    connectors: input.detail.connectors,
    runtimeStatus: input.runtimeStatus,
    runtimeEventState: input.runtimeEventState,
  }).map((model) => ({
    model,
    samples: chargingSamplesByConnector.get(
      chargingSampleConnectorKey(
        model.connector.evseId,
        model.connector.connectorId,
      ),
    ) ?? [],
  }));
  const configurationLocked =
    input.runtimeStatusQueryState !== "success" ||
    input.runtimeStatus?.status !== "stopped";
  const lockedReason = configurationLocked
    ? input.runtimeStatusQueryState === "success"
      ? "桩实例未停止时仅可修改名称和说明；连接配置需停止后修改。"
      : "运行状态未确认，仅可修改名称和说明；连接配置需停止后修改。"
    : undefined;
  const connectorEditLockedReason = configurationLocked
    ? input.runtimeStatusQueryState === "success"
      ? "请先停止桩实例再编辑枪口配置。"
      : "运行状态未确认，暂不可编辑枪口配置。"
    : undefined;

  return {
    status: "ready",
    detail: input.detail,
    headerModel,
    connectorItems,
    observation: input.observation ?? createDefaultObservation(input.eventFeedState),
    runtime: {
      pending: input.pending.runtime,
      applyPrimaryAction: headerModel.primaryAction.kind === "start"
        ? input.actions.startRuntime
        : input.actions.stopRuntime,
    },
    connectors: {
      pending: input.pending.connectors,
      plug: input.actions.plug,
      unplug: input.actions.unplug,
      startTransaction: input.actions.startTransaction,
      stopTransaction: input.actions.stopTransaction,
    },
    configuration: {
      locked: configurationLocked,
      lockedReason,
      connectorEditLockedReason,
    },
    chargingPointEditor: input.chargingPointEditor,
    connectorEditor: input.connectorEditor,
  };
}

function createDefaultObservation(
  eventFeedState: ChargingPointRuntimeEventFeedState,
): ChargingPointObservationWorkbench {
  const pagination = {
    capacity: 200,
    hasMore: false,
    loadingMore: false,
    loadMore: () => undefined,
  };

  return {
    events: eventFeedState.events,
    protocolMessages: eventFeedState.protocolMessages,
    messageTimeFilter: "all",
    eventTimeFilter: "all",
    messageTypeFilter: "all",
    eventTypeFilter: "all",
    messageDirectionFilter: "all",
    setMessageTimeFilter: () => undefined,
    setEventTimeFilter: () => undefined,
    setMessageTypeFilter: () => undefined,
    setEventTypeFilter: () => undefined,
    setMessageDirectionFilter: () => undefined,
    messageHistory: pagination,
    eventHistory: pagination,
  };
}
