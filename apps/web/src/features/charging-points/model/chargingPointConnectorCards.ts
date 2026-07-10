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
  TransactionRuntimeStatus,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";
import {
  formatConnectorFormat,
  formatConnectorPowerType,
  formatConnectorType,
} from "@/features/charging-points/model/connectorDisplay";

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
  const issue = toConnectorIssue(connector, connectorStatus, transaction);

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
    value: formatTransactionStatus(transaction.currentStatus),
    tone: toTransactionTone(transaction.currentStatus),
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

function formatRuntimeAvailabilityDetail(
  availability: ConnectorRuntimeAvailabilitySnapshot,
) {
  const currentLabel = formatRuntimeAvailability(availability.currentAvailability);
  return availability.requestedAvailability === undefined
    ? currentLabel
    : `${currentLabel} · 待切换为${formatRuntimeAvailability(
        availability.requestedAvailability,
      )}`;
}

function formatRuntimeAvailability(
  availability: ConnectorRuntimeAvailabilitySnapshot["currentAvailability"],
) {
  return availability === "operative" ? "可用" : "不可用";
}

function toRuntimeAvailabilityTone(
  availability: ConnectorRuntimeAvailabilitySnapshot["currentAvailability"],
): HeaderTone {
  return availability === "operative" ? "success" : "warning";
}

function selectConnectorTransaction(
  runtimeEventState: ChargingPointRuntimeEventState,
  evseId: number,
  connectorId: number,
): TransactionRuntimeSnapshot | null {
  const transactions = Object.values(runtimeEventState.transactionStatuses)
    .filter((transaction) =>
      transaction.evseId === evseId &&
      transaction.connectorId === connectorId &&
      transaction.currentStatus !== "rejected"
    );
  const activeTransaction = transactions.find(isActiveTransaction);
  if (activeTransaction !== undefined) {
    return activeTransaction;
  }

  return transactions.sort((left, right) =>
    Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
  )[0] ?? null;
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
  transaction: TransactionRuntimeSnapshot | null,
) {
  if (connectorStatus === "faulted") {
    return {
      label: `枪口 ${connector.connectorId} 故障`,
      tone: "destructive" as const,
    };
  }

  if (transaction?.currentStatus === "failed") {
    return {
      label: transaction.reason === undefined
        ? "交易失败"
        : `交易失败: ${transaction.reason}`,
      tone: "destructive" as const,
    };
  }

  if (transaction?.currentStatus === "rejected") {
    return {
      label: transaction.reason === undefined
        ? "交易被拒绝"
        : `交易被拒绝: ${transaction.reason}`,
      tone: "warning" as const,
    };
  }

  return null;
}

function toTransactionTone(status: TransactionRuntimeStatus): HeaderTone {
  if (
    status === "starting" ||
    status === "active" ||
    status === "suspended" ||
    status === "ending"
  ) {
    return "waiting";
  }

  if (status === "failed") {
    return "destructive";
  }

  if (status === "rejected") {
    return "warning";
  }

  return "neutral";
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

function connectorKey(evseId: number, connectorId: number) {
  return `${evseId}/${connectorId}`;
}
