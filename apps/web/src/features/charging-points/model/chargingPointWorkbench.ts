import type {
  ActiveTransactionSamplesResponse,
  ChargingPointDetailResponse,
  ConnectorResponse,
  RuntimeOperationResponse,
  TransactionDeliveryItem,
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
import {
  ALL_RUNTIME_LOG_TYPE_FILTER,
  buildObservationTypeFilterOptions,
  type ObservationTimeFilter,
  type ObservationTypeFilterOption,
} from "./chargingPointObservationFilters";
import type {
  TransactionDeliveryMessageTypeFilter,
  TransactionDeliveryStatusFilter,
} from "./transactionDeliveryObservation";

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

interface ObservationListWorkbench<TItem> {
  items: TItem[];
  totalItems: number;
  timeFilter: ObservationTimeFilter;
  typeFilter: string;
  typeOptions: ObservationTypeFilterOption[];
  setTimeFilter(value: ObservationTimeFilter): void;
  setTypeFilter(value: string): void;
  history: ObservationHistoryPagination;
}

export interface ChargingPointObservationWorkbench {
  protocolMessages: ObservationListWorkbench<ProtocolMessageLogEntry> & {
    directionFilter: "all" | "sent" | "received";
    setDirectionFilter(value: "all" | "sent" | "received"): void;
  };
  events: ObservationListWorkbench<RuntimeEventLogEntry>;
  transactionDeliveries: {
    items: TransactionDeliveryItem[];
    statusFilter: TransactionDeliveryStatusFilter;
    messageTypeFilter: TransactionDeliveryMessageTypeFilter;
    setStatusFilter(value: TransactionDeliveryStatusFilter): void;
    setMessageTypeFilter(value: TransactionDeliveryMessageTypeFilter): void;
    loading: boolean;
    error: boolean;
    history: ObservationHistoryPagination;
  };
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
    applySecondaryAction?(): void;
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
      ? "请先停止桩实例再编辑桩实例配置。"
      : "运行状态未确认，暂不可编辑桩实例配置。"
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
      ...(headerModel.secondaryAction === undefined
        ? {}
        : {
            applySecondaryAction: headerModel.secondaryAction.kind === "start"
              ? input.actions.startRuntime
              : input.actions.stopRuntime,
          }),
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
  const createPagination = (): ObservationHistoryPagination => ({
    capacity: 200,
    hasMore: false,
    loadingMore: false,
    loadMore: () => undefined,
  });

  return {
    protocolMessages: {
      items: eventFeedState.protocolMessages,
      totalItems: eventFeedState.protocolMessages.length,
      timeFilter: "all",
      typeFilter: ALL_RUNTIME_LOG_TYPE_FILTER,
      typeOptions: buildObservationTypeFilterOptions(
        eventFeedState.protocolMessages,
        (message) => message.action,
      ),
      directionFilter: "all",
      setTimeFilter: () => undefined,
      setTypeFilter: () => undefined,
      setDirectionFilter: () => undefined,
      history: createPagination(),
    },
    events: {
      items: eventFeedState.events,
      totalItems: eventFeedState.events.length,
      timeFilter: "all",
      typeFilter: ALL_RUNTIME_LOG_TYPE_FILTER,
      typeOptions: buildObservationTypeFilterOptions(
        eventFeedState.events,
        (event) => event.eventType,
      ),
      setTimeFilter: () => undefined,
      setTypeFilter: () => undefined,
      history: createPagination(),
    },
    transactionDeliveries: {
      items: [],
      statusFilter: "all",
      messageTypeFilter: "all",
      setStatusFilter: () => undefined,
      setMessageTypeFilter: () => undefined,
      loading: false,
      error: false,
      history: createPagination(),
    },
  };
}
