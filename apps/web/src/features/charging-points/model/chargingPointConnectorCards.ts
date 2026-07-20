import type {
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";

import type {
  ChargingPointRuntimeEventState,
  ConnectorRuntimeAvailabilitySnapshot,
  ConnectorRuntimeStatus,
  HeaderTone,
  TransactionRuntimeSnapshot,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";
import {
  formatConnectorFormat,
  formatConnectorPowerType,
  formatConnectorType,
} from "@/features/charging-points/model/connectorDisplay";
import {
  formatRuntimeAvailabilityDetail,
  toRuntimeAvailabilityTone,
} from "@/features/charging-points/model/runtimeAvailabilityPresentation";

export type ConnectorCardActionKind =
  | "plug"
  | "unplug"
  | "startCharging"
  | "stopCharging";

export interface ConnectorCardStatusItem {
  label: string;
  value: string;
  tone?: HeaderTone;
  span?: "full";
}

export interface ConnectorCardAction {
  kind: ConnectorCardActionKind;
  label: string;
  transactionId?: string;
  requiresConfirmation?: boolean;
}

export interface ConnectorCardModel {
  connector: ConnectorResponse;
  connectorId: string;
  title: string;
  description: string;
  fields: ConnectorCardStatusItem[];
  actions: ConnectorCardAction[];
  issue: {
    label: string;
    tone: Extract<HeaderTone, "warning" | "destructive">;
  } | null;
}

export function buildConnectorCardModels({
  connectors,
  runtimeStatus,
  runtimeEventState,
}: {
  connectors: ConnectorResponse[];
  runtimeStatus: RuntimeOperationResponse | undefined;
  runtimeEventState: ChargingPointRuntimeEventState;
}): ConnectorCardModel[] {
  return connectors
    .slice()
    .sort((left, right) =>
      left.sortOrder - right.sortOrder ||
      left.evseId - right.evseId ||
      left.connectorId - right.connectorId
    )
    .map((connector) =>
      buildConnectorCardModel({
        connector,
        runtimeStatus,
        runtimeEventState,
      })
    );
}

function buildConnectorCardModel({
  connector,
  runtimeStatus,
  runtimeEventState,
}: {
  connector: ConnectorResponse;
  runtimeStatus: RuntimeOperationResponse | undefined;
  runtimeEventState: ChargingPointRuntimeEventState;
}): ConnectorCardModel {
  const connectorStatus =
    runtimeEventState.connectorStatuses[connectorKey(connector.evseId, connector.connectorId)]
      ?.currentStatus;
  const connectorAvailability =
    runtimeEventState.connectorAvailabilities[
      connectorKey(connector.evseId, connector.connectorId)
    ];
  const transaction = selectConnectorTransaction(
    runtimeEventState,
    connector.evseId,
    connector.connectorId,
  );
  const connectorStatusField = toConnectorStatusField(runtimeStatus, connectorStatus);
  const transactionStatus = toTransactionStatus(transaction);
  const availability = toConnectorAvailability(runtimeStatus, connectorAvailability);
  const issue = toConnectorIssue(connector, connectorStatus);

  return {
    connector,
    connectorId: connector.id,
    title: `枪口 ${connector.connectorId}`,
    description: `EVSE ${connector.evseId} · ${formatConnectorType(connector.type)} · ${formatConnectorFormat(connector.format)} · ${formatConnectorPowerType(connector.powerType)}`,
    fields: [
      connectorStatusField,
      transactionStatus,
      availability,
    ],
    actions: toConnectorActions(runtimeStatus, connectorStatus, transaction),
    issue,
  };
}

function toConnectorActions(
  runtimeStatus: RuntimeOperationResponse | undefined,
  connectorStatus: ConnectorRuntimeStatus | undefined,
  transaction: TransactionRuntimeSnapshot | null,
): ConnectorCardAction[] {
  if (runtimeStatus?.status !== "running") {
    return [];
  }

  if (transaction?.currentStatus === "ending") {
    return [];
  }

  const activeTransaction = transaction === null || !isActiveTransaction(transaction)
    ? null
    : transaction;
  if (activeTransaction !== null) {
    return [
      {
        kind: "stopCharging",
        label: "停止充电",
        transactionId: activeTransaction.transactionId,
      },
      {
        kind: "unplug",
        label: "拔枪",
        requiresConfirmation: true,
      },
    ];
  }

  if (connectorStatus === "available") {
    return [{ kind: "plug", label: "插枪" }];
  }

  if (connectorStatus === "occupied") {
    return [
      { kind: "unplug", label: "拔枪" },
      { kind: "startCharging", label: "启动充电" },
    ];
  }

  return [];
}

function toConnectorStatusField(
  runtimeStatus: RuntimeOperationResponse | undefined,
  connectorStatus: ConnectorRuntimeStatus | undefined,
): ConnectorCardStatusItem {
  if (runtimeStatus?.status !== "running") {
    return {
      label: "枪口状态",
      value: runtimeStatus === undefined ? "未同步" : "未运行",
      tone: "neutral",
      span: "full",
    };
  }

  if (connectorStatus === "available") {
    return {
      label: "枪口状态",
      value: "可用 / 未插枪",
      tone: "success",
      span: "full",
    };
  }

  if (connectorStatus === "occupied") {
    return {
      label: "枪口状态",
      value: "占用 / 已插枪",
      tone: "waiting",
      span: "full",
    };
  }

  if (connectorStatus === "unavailable") {
    return {
      label: "枪口状态",
      value: "不可用",
      tone: "warning",
      span: "full",
    };
  }

  return {
    label: "枪口状态",
    value: connectorStatus === undefined ? "等待同步" : "故障",
    tone: connectorStatus === undefined ? "waiting" : "destructive",
    span: "full",
  };
}

function toTransactionStatus(
  transaction: TransactionRuntimeSnapshot | null,
): ConnectorCardStatusItem {
  if (transaction === null) {
    return {
      label: "交易状态",
      value: "无交易",
      tone: "neutral",
    };
  }

  return {
    label: "交易状态",
    value: "进行中",
    tone: "waiting",
  };
}

function toConnectorAvailability(
  runtimeStatus: RuntimeOperationResponse | undefined,
  connectorAvailability: ConnectorRuntimeAvailabilitySnapshot | undefined,
): ConnectorCardStatusItem {
  if (runtimeStatus === undefined) {
    return {
      label: "可用性",
      value: "未同步",
      tone: "neutral",
    };
  }

  if (runtimeStatus.status !== "running") {
    return {
      label: "可用性",
      value: "未运行",
      tone: "neutral",
    };
  }

  if (connectorAvailability === undefined) {
    return {
      label: "可用性",
      value: "等待同步",
      tone: "waiting",
    };
  }

  return {
    label: "可用性",
    value: formatRuntimeAvailabilityDetail(connectorAvailability),
    tone: connectorAvailability.requestedAvailability === undefined
      ? toRuntimeAvailabilityTone(connectorAvailability.currentAvailability)
      : "warning",
  };
}

function selectConnectorTransaction(
  runtimeEventState: ChargingPointRuntimeEventState,
  evseId: number,
  connectorId: number,
): TransactionRuntimeSnapshot | null {
  return Object.values(runtimeEventState.transactionStatuses).find((transaction) =>
    transaction.evseId === evseId &&
    transaction.connectorId === connectorId &&
    isActiveTransaction(transaction)
  ) ?? null;
}

function isActiveTransaction(transaction: TransactionRuntimeSnapshot) {
  return (
    transaction.currentStatus === "starting" ||
    transaction.currentStatus === "active" ||
    transaction.currentStatus === "suspended" ||
    transaction.currentStatus === "ending"
  );
}

function toConnectorIssue(
  connector: ConnectorResponse,
  connectorStatus: ConnectorRuntimeStatus | undefined,
) {
  if (connectorStatus === "faulted") {
    return {
      label: `枪口 ${connector.connectorId} 故障`,
      tone: "destructive" as const,
    };
  }

  return null;
}

function connectorKey(evseId: number, connectorId: number) {
  return `${evseId}/${connectorId}`;
}
