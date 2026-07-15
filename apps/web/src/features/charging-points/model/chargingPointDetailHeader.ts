import type {
  ChargingPointDetailResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";

import type {
  ChargingPointAvailabilitySnapshot,
  ChargingPointRuntimeEventState,
  HeaderTone,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";
import {
  formatRuntimeAvailabilityDetail,
  toRuntimeAvailabilityTone,
} from "@/features/charging-points/model/runtimeAvailabilityPresentation";

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
  finalConnectionUrl: string | null;
  runtimeSummaryItems: HeaderMetricItem[];
  mainStatus: HeaderStatusItem;
  sessionStatus: HeaderStatusItem;
  chargingPointStatus: HeaderStatusItem;
  operability: HeaderStatusItem;
  bootSummary: string;
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
  const effectiveLastHeartbeatAt =
    runtimeEventState?.lastHeartbeatAt ?? lastHeartbeatAt;
  const base = {
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

  const summaryItems: HeaderMetricItem[] = [
    {
      label: "Boot 状态",
      value: toBootSummaryItemValue(runtimeStatus, statusQueryState),
      tone: toBootSummaryTone(runtimeStatus, statusQueryState),
    },
    {
      label: "会话状态",
      value: sessionSummaryItem.value,
      tone: sessionSummaryItem.tone,
    },
    toChargingPointAvailabilitySummaryItem(
      runtimeStatus,
      statusQueryState,
      runtimeEventState?.chargingPointAvailability,
    ),
    toChargingPointStatusSummaryItem(
      runtimeStatus,
      statusQueryState,
      runtimeEventState?.chargingPointStatus,
    ),
  ];
  return summaryItems;
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

function toChargingPointAvailabilitySummaryItem(
  runtimeStatus: RuntimeOperationResponse | undefined,
  statusQueryState: RuntimeStatusQueryState,
  availability: ChargingPointAvailabilitySnapshot | null | undefined,
): HeaderMetricItem {
  if (runtimeStatus === undefined) {
    return {
      label: "可用性",
      value: statusQueryState === "loading" ? "状态获取中" : "状态未知",
      tone: statusQueryState === "loading" ? "waiting" : "warning",
    };
  }

  if (runtimeStatus.status === "stopped") {
    return {
      label: "可用性",
      value: "未运行",
      tone: "neutral",
    };
  }

  if (availability === undefined || availability === null) {
    return {
      label: "可用性",
      value: "等待同步",
      tone: "waiting",
    };
  }

  return {
    label: "可用性",
    value: formatRuntimeAvailabilityDetail(availability),
    tone: availability.requestedAvailability === undefined
      ? toRuntimeAvailabilityTone(availability.currentAvailability)
      : "warning",
  };
}

function toChargingPointStatusSummaryItem(
  runtimeStatus: RuntimeOperationResponse | undefined,
  statusQueryState: RuntimeStatusQueryState,
  chargingPointStatus: ChargingPointRuntimeEventState["chargingPointStatus"] | undefined,
): HeaderMetricItem {
  if (runtimeStatus === undefined) {
    return {
      label: "充电桩状态",
      value: statusQueryState === "loading" ? "状态获取中" : "状态未知",
      tone: statusQueryState === "loading" ? "waiting" : "warning",
    };
  }

  if (runtimeStatus.status === "stopped") {
    return {
      label: "充电桩状态",
      value: "未运行",
      tone: "neutral",
    };
  }

  if (chargingPointStatus === undefined || chargingPointStatus === null) {
    return {
      label: "充电桩状态",
      value: "等待同步",
      tone: "waiting",
    };
  }

  if (chargingPointStatus.currentStatus === "available") {
    return {
      label: "充电桩状态",
      value: "可用",
      tone: "success",
    };
  }

  if (chargingPointStatus.currentStatus === "unavailable") {
    return {
      label: "充电桩状态",
      value: "不可用",
      tone: "warning",
    };
  }

  return {
    label: "充电桩状态",
    value: "故障",
    tone: "destructive",
  };
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
