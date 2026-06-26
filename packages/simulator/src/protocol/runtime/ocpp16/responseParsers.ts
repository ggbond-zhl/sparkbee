import { OCPP16_AUTHORIZATION_STATUSES } from "./constants";
import { DateTimeStringSchema } from "../../validator/Ocpp16/schemas/shared";
import type {
  Ocpp16AuthorizationStatus,
  Ocpp16HeartbeatTimeStatus,
} from "./types";

export function parseHeartbeatCurrentTime(
  rawCurrentTime: unknown,
  localTime: Date,
  driftThresholdMs: number | null,
  checkDrift = true,
): {
  currentTime: Date | null;
  timeStatus: Ocpp16HeartbeatTimeStatus;
  timeIssue: string | null;
} {
  if (typeof rawCurrentTime !== "string" || rawCurrentTime.trim() === "") {
    return {
      currentTime: null,
      timeStatus: "missing",
      timeIssue: "Heartbeat.conf.currentTime 为空",
    };
  }

  if (!DateTimeStringSchema.safeParse(rawCurrentTime).success) {
    return {
      currentTime: null,
      timeStatus: "invalid",
      timeIssue: "Heartbeat.conf.currentTime 格式非法",
    };
  }

  const currentTime = new Date(rawCurrentTime);
  if (!Number.isFinite(currentTime.getTime())) {
    return {
      currentTime: null,
      timeStatus: "invalid",
      timeIssue: "Heartbeat.conf.currentTime 格式非法",
    };
  }

  if (
    checkDrift &&
    driftThresholdMs !== null &&
    Math.abs(currentTime.getTime() - localTime.getTime()) > driftThresholdMs
  ) {
    return {
      currentTime: null,
      timeStatus: "drifted",
      timeIssue: `Heartbeat.conf.currentTime 与本地时间相差超过 ${driftThresholdMs}ms`,
    };
  }

  return {
    currentTime,
    timeStatus: "valid",
    timeIssue: null,
  };
}

export function parseStopTransactionResponse(payload: unknown): {
  idTagInfoStatus: Ocpp16AuthorizationStatus | null;
  responseIssue: string | null;
  unexpectedResponseFields: string[];
} {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      idTagInfoStatus: null,
      responseIssue: "StopTransaction.conf 不是对象",
      unexpectedResponseFields: [],
    };
  }

  const record = payload as Record<string, unknown>;
  const unexpectedResponseFields = Object.keys(record)
    .filter((field) => field !== "idTagInfo");
  if (!("idTagInfo" in record) || record.idTagInfo === undefined) {
    return {
      idTagInfoStatus: null,
      responseIssue: null,
      unexpectedResponseFields,
    };
  }

  if (
    record.idTagInfo === null ||
    typeof record.idTagInfo !== "object" ||
    Array.isArray(record.idTagInfo)
  ) {
    return {
      idTagInfoStatus: null,
      responseIssue: "StopTransaction.conf.idTagInfo 格式非法",
      unexpectedResponseFields,
    };
  }

  const idTagInfo = record.idTagInfo as Record<string, unknown>;
  if (
    typeof idTagInfo.status !== "string" ||
    !OCPP16_AUTHORIZATION_STATUSES.has(idTagInfo.status)
  ) {
    return {
      idTagInfoStatus: null,
      responseIssue: "StopTransaction.conf.idTagInfo.status 非法",
      unexpectedResponseFields,
    };
  }

  return {
    idTagInfoStatus: idTagInfo.status as Ocpp16AuthorizationStatus,
    responseIssue: null,
    unexpectedResponseFields,
  };
}

export function parseOptionalDate(value: string | undefined): Date | null {
  return value === undefined ? null : new Date(value);
}
