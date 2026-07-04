import type {
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";

import type {
  ChargingPointRuntimeEventState,
  ConnectorRuntimeStatus,
  HeaderTone,
  TransactionRuntimeSnapshot,
  TransactionRuntimeStatus,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";

export type ConnectorCardActionKind =
  | "plug"
  | "unplug"
  | "startCharging"
  | "stopCharging";

export interface ConnectorCardStatusItem {
  label: string;
  value: string;
  tone?: HeaderTone;
}

export interface ConnectorCardAction {
  kind: ConnectorCardActionKind;
  label: string;
  transactionId?: string;
}

export interface ConnectorCardModel {
  connectorId: string;
  title: string;
  description: string;
  statusBadge: {
    label: string;
    tone: HeaderTone;
  };
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
  const transaction = selectConnectorTransaction(
    runtimeEventState,
    connector.evseId,
    connector.connectorId,
  );
  const statusBadge = toConnectorStatusBadge(runtimeStatus, connectorStatus);
  const plugStatus = toPlugStatus(runtimeStatus, connectorStatus);
  const transactionStatus = toTransactionStatus(transaction);
  const meterValue = transaction?.meterWh === undefined
    ? "--"
    : formatMeterWh(transaction.meterWh);
  const issue = toConnectorIssue(connector, connectorStatus, transaction);

  return {
    connectorId: connector.id,
    title: `枪口 ${connector.connectorId}`,
    description: `EVSE ${connector.evseId} · ${connector.type} · ${formatPowerType(connector.powerType)}`,
    statusBadge,
    fields: [
      {
        label: "枪口状态",
        value: statusBadge.label,
        tone: statusBadge.tone,
      },
      plugStatus,
      transactionStatus,
      {
        label: "最近表值",
        value: meterValue,
      },
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

function toConnectorStatusBadge(
  runtimeStatus: RuntimeOperationResponse | undefined,
  connectorStatus: ConnectorRuntimeStatus | undefined,
) {
  if (runtimeStatus?.status === "stopped") {
    return {
      label: "未运行",
      tone: "neutral" as const,
    };
  }

  if (connectorStatus === undefined) {
    return {
      label: runtimeStatus?.status === "running" ? "等待同步" : "未同步",
      tone: runtimeStatus?.status === "running" ? "waiting" as const : "neutral" as const,
    };
  }

  if (connectorStatus === "available") {
    return {
      label: "可用",
      tone: "success" as const,
    };
  }

  if (connectorStatus === "occupied") {
    return {
      label: "占用",
      tone: "waiting" as const,
    };
  }

  if (connectorStatus === "unavailable") {
    return {
      label: "不可用",
      tone: "warning" as const,
    };
  }

  return {
    label: "故障",
    tone: "destructive" as const,
  };
}

function toPlugStatus(
  runtimeStatus: RuntimeOperationResponse | undefined,
  connectorStatus: ConnectorRuntimeStatus | undefined,
): ConnectorCardStatusItem {
  if (runtimeStatus?.status !== "running") {
    return {
      label: "插枪状态",
      value: "未运行",
      tone: "neutral",
    };
  }

  if (connectorStatus === "available") {
    return {
      label: "插枪状态",
      value: "未插枪",
      tone: "success",
    };
  }

  if (connectorStatus === "occupied") {
    return {
      label: "插枪状态",
      value: "已插枪",
      tone: "waiting",
    };
  }

  return {
    label: "插枪状态",
    value: "--",
    tone: connectorStatus === "faulted" ? "destructive" : "neutral",
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

function selectConnectorTransaction(
  runtimeEventState: ChargingPointRuntimeEventState,
  evseId: number,
  connectorId: number,
): TransactionRuntimeSnapshot | null {
  const transactions = Object.values(runtimeEventState.transactionStatuses)
    .filter((transaction) =>
      transaction.evseId === evseId && transaction.connectorId === connectorId
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

function formatPowerType(powerType: ConnectorResponse["powerType"]) {
  if (powerType === "ac") {
    return "交流";
  }

  if (powerType === "dc") {
    return "直流";
  }

  return "未知供电";
}

function formatMeterWh(meterWh: number) {
  return `${meterWh.toFixed(3)} Wh`;
}

function connectorKey(evseId: number, connectorId: number) {
  return `${evseId}/${connectorId}`;
}
