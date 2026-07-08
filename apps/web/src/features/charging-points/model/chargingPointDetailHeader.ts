import type {
  ChargingPointDetailResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";

import type {
  ChargingPointRuntimeEventState,
  HeaderTone,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";

interface HeaderStatusItem {
  label: string;
  tone: HeaderTone;
  description?: string;
}

interface HeaderPrimaryAction {
  kind: "start" | "stop";
  label: string;
  disabled: boolean;
  disabledReason?: string;
}

export interface HeaderMetricItem {
  label: string;
  value: string;
  tone?: HeaderTone;
  monospace?: boolean;
}

export interface ChargingPointDetailHeaderModel {
  connectorCountLabel: string;
  finalConnectionUrl: string | null;
  runtimeSummaryItems: HeaderMetricItem[];
  mainStatus: HeaderStatusItem;
  sessionStatus: HeaderStatusItem;
  chargingPointStatus: HeaderStatusItem;
  operability: HeaderStatusItem;
  bootSummary: string;
  connectorSummary: string;
  transactionSummary: string;
  recentIssue: HeaderStatusItem | null;
  lastHeartbeatLabel: string;
  primaryAction: HeaderPrimaryAction;
}

export type RuntimeStatusQueryState = "loading" | "error" | "success";

export function buildChargingPointDetailHeaderModel({
  detail,
  runtimeStatus,
  statusQueryState,
  lastHeartbeatAt,
  runtimeEventState,
}: {
  detail: ChargingPointDetailResponse;
  runtimeStatus: RuntimeOperationResponse | undefined;
  statusQueryState: RuntimeStatusQueryState;
  lastHeartbeatAt: Date | null;
  runtimeEventState?: ChargingPointRuntimeEventState;
}): ChargingPointDetailHeaderModel {
  const connectorCount = detail.connectors.length;
  const connectorCountLabel = `${connectorCount} 枪`;
  const effectiveLastHeartbeatAt =
    runtimeEventState?.lastHeartbeatAt ?? lastHeartbeatAt;
  const base = {
    connectorCountLabel,
    finalConnectionUrl: toFinalConnectionUrl(runtimeEventState),
    runtimeSummaryItems: toRuntimeSummaryItems(
      runtimeStatus,
      statusQueryState,
      runtimeEventState,
    ),
    lastHeartbeatLabel: formatLastHeartbeat(effectiveLastHeartbeatAt),
  };

  if (statusQueryState === "loading") {
    return {
      ...base,
      mainStatus: {
        label: "状态获取中",
        tone: "waiting",
      },
      sessionStatus: {
        label: "会话等待中",
        tone: "waiting",
      },
      chargingPointStatus: {
        label: "桩状态等待中",
        tone: "waiting",
      },
      operability: {
        label: "等待运行状态",
        tone: "waiting",
      },
      bootSummary: "等待运行状态",
      connectorSummary: `${connectorCountLabel} · 等待运行状态`,
      transactionSummary: "交易数据获取中",
      recentIssue: null,
      primaryAction: {
        kind: "start",
        label: "启动",
        disabled: true,
        disabledReason: "正在获取运行状态",
      },
    };
  }

  if (statusQueryState === "error" || runtimeStatus === undefined) {
    return {
      ...base,
      mainStatus: {
        label: "状态未知",
        tone: "warning",
      },
      sessionStatus: {
        label: "会话未知",
        tone: "warning",
      },
      chargingPointStatus: {
        label: "桩状态未知",
        tone: "warning",
      },
      operability: {
        label: "状态未知",
        tone: "warning",
      },
      bootSummary: "状态未知",
      connectorSummary: `${connectorCountLabel} · 状态未知`,
      transactionSummary: "交易状态未知",
      recentIssue: {
        label: "运行状态获取失败",
        tone: "warning",
      },
      primaryAction: {
        kind: "start",
        label: "启动",
        disabled: true,
        disabledReason: "运行状态未知",
      },
    };
  }

  const sessionStatus = toSessionStatusItem(runtimeStatus, runtimeEventState);
  const chargingPointStatus = toChargingPointStatusItem(
    runtimeStatus,
    runtimeEventState,
  );
  const recentIssue = toRecentIssue(runtimeEventState);

  if (runtimeStatus.status === "stopped") {
    const runnable = connectorCount > 0;

    return {
      ...base,
      mainStatus: {
        label: "已停止",
        tone: "neutral",
        description: "当前 SparkBee 服务进程中没有运行中的桩实例 Actor",
      },
      sessionStatus,
      chargingPointStatus,
      operability: runnable
        ? {
            label: "可启动",
            tone: "success",
          }
        : {
            label: "暂不可启动",
            tone: "warning",
            description: "缺少枪口，先添加至少 1 个枪口",
          },
      bootSummary: "未启动",
      connectorSummary: `共 ${connectorCountLabel}`,
      transactionSummary: "无运行交易",
      recentIssue,
      primaryAction: {
        kind: "start",
        label: "启动",
        disabled: !runnable,
        disabledReason: runnable ? undefined : "缺少枪口",
      },
    };
  }

  if (runtimeStatus.status === "starting") {
    return {
      ...base,
      mainStatus: {
        label: "启动中",
        tone: "waiting",
        description:
          "当前服务进程中 Actor 已创建，正在连接或处理首次 BootNotification",
      },
      sessionStatus,
      chargingPointStatus,
      operability: {
        label: "启动处理中",
        tone: "waiting",
      },
      bootSummary: toBootSummary(runtimeStatus, "等待 BootNotification"),
      connectorSummary: toConnectorSummary(
        connectorCount,
        connectorCountLabel,
        runtimeStatus,
        runtimeEventState,
      ),
      transactionSummary: toTransactionSummary(runtimeStatus, runtimeEventState),
      recentIssue,
      primaryAction: {
        kind: "stop",
        label: "停止",
        disabled: false,
      },
    };
  }

  return {
    ...base,
    mainStatus: {
      label: "运行中",
      tone: "success",
      description: "当前 SparkBee 服务进程中桩实例 Actor 已运行",
    },
    sessionStatus,
    chargingPointStatus,
    operability: {
      label: "已运行",
      tone: "success",
    },
    bootSummary: toBootSummary(runtimeStatus, "Boot 状态待同步"),
    connectorSummary: toConnectorSummary(
      connectorCount,
      connectorCountLabel,
      runtimeStatus,
      runtimeEventState,
    ),
    transactionSummary: toTransactionSummary(runtimeStatus, runtimeEventState),
    recentIssue,
    primaryAction: {
      kind: "stop",
      label: "停止",
      disabled: false,
    },
  };
}

function toBootSummary(
  runtimeStatus: RuntimeOperationResponse,
  fallback: string,
) {
  if (runtimeStatus.bootStatus === "Accepted") {
    return "Boot 已接受";
  }

  if (runtimeStatus.bootStatus === "Pending") {
    return runtimeStatus.retryAfterSec === undefined
      ? "Boot 待接受"
      : `Boot 待接受 · ${runtimeStatus.retryAfterSec} 秒后再次上报`;
  }

  return fallback;
}

function toRuntimeSummaryItems(
  runtimeStatus: RuntimeOperationResponse | undefined,
  statusQueryState: RuntimeStatusQueryState,
  runtimeEventState: ChargingPointRuntimeEventState | undefined,
): HeaderMetricItem[] {
  const sessionSummaryItem = toSessionLogEntry(
    runtimeStatus,
    statusQueryState,
    runtimeEventState,
  );
  const recentIssue = toRecentIssue(runtimeEventState);

  const runtimeLogs: HeaderMetricItem[] = [
    {
      label: "Boot",
      value: toBootSummaryItemValue(runtimeStatus, statusQueryState),
      tone: toBootSummaryTone(runtimeStatus, statusQueryState),
    },
    {
      label: "会话状态",
      value: sessionSummaryItem.value,
      tone: sessionSummaryItem.tone,
    },
    {
      label: "最近异常",
      value: recentIssue?.label ?? "无",
      tone: recentIssue?.tone,
    },
  ];
  return runtimeLogs;
}

function toFinalConnectionUrl(
  runtimeEventState: ChargingPointRuntimeEventState | undefined,
) {
  const connectionUrl = runtimeEventState?.sessionStatus?.connectionUrl;
  return connectionUrl === undefined || connectionUrl.length === 0
    ? null
    : connectionUrl;
}

function toSessionLogEntry(
  runtimeStatus: RuntimeOperationResponse | undefined,
  statusQueryState: RuntimeStatusQueryState,
  runtimeEventState: ChargingPointRuntimeEventState | undefined,
): Pick<HeaderMetricItem, "value" | "tone"> {
  if (runtimeStatus === undefined) {
    return {
      value: statusQueryState === "loading" ? "状态获取中" : "状态未知",
      tone: statusQueryState === "loading" ? "waiting" : "warning",
    };
  }

  const item = toSessionStatusItem(runtimeStatus, runtimeEventState);

  return {
    value: formatSessionLogEntryValue(
      item.label,
      runtimeEventState?.sessionStatus,
    ),
    tone: item.tone,
  };
}

function toBootSummaryItemValue(
  runtimeStatus: RuntimeOperationResponse | undefined,
  statusQueryState: RuntimeStatusQueryState,
) {
  if (statusQueryState === "loading") {
    return "等待运行状态";
  }

  if (runtimeStatus === undefined) {
    return "状态未知";
  }

  if (runtimeStatus.bootStatus === "Accepted") {
    return "已接受";
  }

  if (runtimeStatus.bootStatus === "Pending") {
    return runtimeStatus.retryAfterSec === undefined
      ? "待接受"
      : `待接受 · ${runtimeStatus.retryAfterSec} 秒后再次上报`;
  }

  if (runtimeStatus.status === "stopped") {
    return "未启动";
  }

  return runtimeStatus.status === "starting"
    ? "等待 BootNotification"
    : "状态待同步";
}

function toBootSummaryTone(
  runtimeStatus: RuntimeOperationResponse | undefined,
  statusQueryState: RuntimeStatusQueryState,
): HeaderTone {
  if (statusQueryState === "loading") {
    return "waiting";
  }

  if (runtimeStatus === undefined) {
    return "warning";
  }

  if (runtimeStatus.bootStatus === "Accepted") {
    return "success";
  }

  if (runtimeStatus.bootStatus === "Pending" || runtimeStatus.status === "starting") {
    return "waiting";
  }

  return "neutral";
}

function formatSessionLogEntryValue(
  label: string,
  sessionStatus: ChargingPointRuntimeEventState["sessionStatus"] | undefined,
) {
  const detail = formatSessionLogEntryDetail(sessionStatus);
  return detail === undefined ? label : `${label} · ${detail}`;
}

function formatSessionLogEntryDetail(
  sessionStatus: ChargingPointRuntimeEventState["sessionStatus"] | undefined,
) {
  if (sessionStatus === undefined || sessionStatus === null) {
    return undefined;
  }

  if (sessionStatus.currentStatus === "reconnecting") {
    return sessionStatus.attempt === undefined
      ? undefined
      : `第 ${sessionStatus.attempt} 次`;
  }

  if (sessionStatus.currentStatus === "offline") {
    return formatOfflineReason(sessionStatus.reason) ?? "未说明";
  }

  return undefined;
}

function toSessionStatusItem(
  runtimeStatus: RuntimeOperationResponse,
  runtimeEventState: ChargingPointRuntimeEventState | undefined,
): HeaderStatusItem {
  const sessionStatus = runtimeEventState?.sessionStatus;
  if (sessionStatus === undefined || sessionStatus === null) {
    if (runtimeStatus.status === "stopped") {
      return {
        label: "会话未建立",
        tone: "neutral",
      };
    }

    return {
      label: runtimeStatus.status === "starting" ? "会话连接中" : "会话等待中",
      tone: "waiting",
    };
  }

  if (sessionStatus.currentStatus === "online") {
    return {
      label: "会话在线",
      tone: "success",
      description: sessionStatus.connectionUrl,
    };
  }

  if (sessionStatus.currentStatus === "reconnecting") {
    return {
      label: "会话重连中",
      tone: "warning",
      description: sessionStatus.attempt === undefined
        ? sessionStatus.error?.message
        : `第 ${sessionStatus.attempt} 次重连${
            sessionStatus.error === undefined ? "" : `：${sessionStatus.error.message}`
          }`,
    };
  }

  return {
    label: "会话离线",
    tone: sessionStatus.reason === "reconnect_exhausted" ? "destructive" : "neutral",
    description: formatOfflineReason(sessionStatus.reason),
  };
}

function toChargingPointStatusItem(
  runtimeStatus: RuntimeOperationResponse,
  runtimeEventState: ChargingPointRuntimeEventState | undefined,
): HeaderStatusItem {
  const chargingPointStatus = runtimeEventState?.chargingPointStatus;
  if (chargingPointStatus === undefined || chargingPointStatus === null) {
    return {
      label: runtimeStatus.status === "stopped" ? "桩状态未同步" : "桩状态等待中",
      tone: runtimeStatus.status === "stopped" ? "neutral" : "waiting",
    };
  }

  if (chargingPointStatus.currentStatus === "available") {
    return {
      label: "桩可用",
      tone: "success",
    };
  }

  if (chargingPointStatus.currentStatus === "unavailable") {
    return {
      label: "桩不可用",
      tone: "warning",
    };
  }

  return {
    label: "桩故障",
    tone: "destructive",
    description: chargingPointStatus.error?.message,
  };
}

function toConnectorSummary(
  connectorCount: number,
  connectorCountLabel: string,
  runtimeStatus: RuntimeOperationResponse,
  runtimeEventState: ChargingPointRuntimeEventState | undefined,
) {
  if (runtimeStatus.status === "stopped") {
    return `共 ${connectorCountLabel}`;
  }

  const connectorStatuses = Object.values(
    runtimeEventState?.connectorStatuses ?? {},
  );
  if (connectorStatuses.length === 0) {
    return `${connectorCountLabel} · 等待运行状态`;
  }

  const counts = countByStatus(
    connectorStatuses.map((connector) => connector.currentStatus),
  );
  const parts = [
    formatCount("可用", counts.available),
    formatCount("占用", counts.occupied),
    formatCount("不可用", counts.unavailable),
    formatCount("故障", counts.faulted),
  ].filter((part): part is string => part !== null);
  const syncLabel = connectorStatuses.length < connectorCount
    ? `已同步 ${connectorStatuses.length}/${connectorCount}`
    : connectorCountLabel;

  return `${syncLabel} · ${parts.join(" / ")}`;
}

function toTransactionSummary(
  runtimeStatus: RuntimeOperationResponse,
  runtimeEventState: ChargingPointRuntimeEventState | undefined,
) {
  if (runtimeStatus.status === "stopped") {
    return "无运行交易";
  }

  const transactions = Object.values(runtimeEventState?.transactionStatuses ?? {});
  if (transactions.length === 0) {
    return runtimeStatus.status === "starting" ? "尚无交易数据" : "暂无交易数据";
  }

  const counts = countByStatus(
    transactions.map((transaction) => transaction.currentStatus),
  );
  const activeCount =
    (counts.starting ?? 0) +
    (counts.active ?? 0) +
    (counts.suspended ?? 0) +
    (counts.ending ?? 0);
  const parts = [
    activeCount > 0 ? `进行中 ${activeCount}` : null,
    formatCount("挂起", counts.suspended),
    formatCount("失败", counts.failed),
    formatCount("拒绝", counts.rejected),
    activeCount === 0 ? formatCount("已结束", counts.ended) : null,
  ].filter((part): part is string => part !== null);

  return activeCount === 0
    ? `无进行中 · ${parts.join(" / ")}`
    : parts.join(" / ");
}

function toRecentIssue(
  runtimeEventState: ChargingPointRuntimeEventState | undefined,
): HeaderStatusItem | null {
  if (runtimeEventState?.recentIssue === undefined || runtimeEventState.recentIssue === null) {
    return null;
  }

  return {
    label: runtimeEventState.recentIssue.label,
    tone: runtimeEventState.recentIssue.tone,
  };
}

function countByStatus<TStatus extends string>(statuses: TStatus[]) {
  return statuses.reduce<Partial<Record<TStatus, number>>>((counts, status) => ({
    ...counts,
    [status]: (counts[status] ?? 0) + 1,
  }), {});
}

function formatCount(label: string, count: number | undefined) {
  return count === undefined || count === 0 ? null : `${label} ${count}`;
}

function formatOfflineReason(reason: string | undefined) {
  if (reason === "intentional") {
    return "主动停止后会话关闭";
  }

  if (reason === "unexpected_disconnect") {
    return "底层连接意外断开";
  }

  if (reason === "reconnect_exhausted") {
    return "重连次数已耗尽";
  }

  return undefined;
}

function formatLastHeartbeat(lastHeartbeatAt: Date | null) {
  if (lastHeartbeatAt === null) {
    return "最后心跳 --";
  }

  return `最后心跳 ${lastHeartbeatAt.toLocaleTimeString("zh-CN", {
    hour12: false,
  })}`;
}
