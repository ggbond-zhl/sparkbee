import type { Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { cloneDate, cloneNullableDate } from "../../../../shared/utils";
import { toRequestErrorInfo } from "../requestErrors";
import { parseHeartbeatCurrentTime } from "../responseParsers";
import { requireRegisteredChargingPoint } from "../connectorSelection";
import type { Ocpp16RuntimeContext } from "../state";
import type {
  Ocpp16HeartbeatLoopOptions,
  Ocpp16HeartbeatResult,
  PlatformCommunicationStatus,
} from "../types";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";

export async function sendHeartbeat(
  context: Ocpp16RuntimeContext,
): Promise<Ocpp16HeartbeatResult> {
  requireRegisteredChargingPoint(
    context,
    "BootNotification 未 Accepted，不能发送 Heartbeat",
  );

  const sentAt = context.clock();

  try {
    const result = await context.session.request("Heartbeat", {});
    if (result.kind === "error") {
      return recordHeartbeatFailure(context, {
        sentAt,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    const heartbeatResult = recordHeartbeatSuccess(
      context,
      sentAt,
      result.payload as Partial<Ocpp16ResponseOf<"Heartbeat">>,
    );
    await getOcpp16TransactionDelivery(context).replayPending();
    return heartbeatResult;
  } catch (cause) {
    return recordHeartbeatFailure(context, {
      sentAt,
      ...toRequestErrorInfo(cause),
    });
  }
}

export function startHeartbeatLoop(
  context: Ocpp16RuntimeContext,
  options: Ocpp16HeartbeatLoopOptions = {},
): void {
  context.heartbeatLoopOptions = options;
  if (context.heartbeatTimerId !== null) {
    return;
  }

  requireRegisteredChargingPoint(
    context,
    "BootNotification 未 Accepted，不能启动 Heartbeat",
  );

  const intervalSec = context.configurationFacts.getHeartbeatIntervalSec();
  let consecutiveFailures = 0;
  context.heartbeatTimerId = setInterval(() => {
    void sendHeartbeat(context)
      .then((result) => {
        let loopResult = result;
        if (result.status === "Accepted") {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures += 1;
          loopResult = {
            ...result,
            consecutiveFailures,
            platformCommunicationStatus: getLoopFailureCommunicationStatus(
              context,
              consecutiveFailures,
            ),
            shouldReconnect:
              consecutiveFailures >= context.thresholds.heartbeatReconnectThreshold,
          };
        }

        callSafely(() => options.onHeartbeat?.(loopResult));
        if (loopResult.status === "Failed" && loopResult.shouldReconnect) {
          stopHeartbeatLoop(context);
          callSafely(() => options.onReconnectRequired?.(loopResult));
        }
      })
      .catch(() => undefined);
  }, intervalSec * 1_000);
}

export function restartHeartbeatLoop(context: Ocpp16RuntimeContext): void {
  if (context.heartbeatTimerId === null) {
    return;
  }

  const options = context.heartbeatLoopOptions ?? {};
  stopHeartbeatLoop(context);
  startHeartbeatLoop(context, options);
}

export function stopHeartbeatLoop(context: Ocpp16RuntimeContext): void {
  if (context.heartbeatTimerId === null) {
    return;
  }

  clearInterval(context.heartbeatTimerId);
  context.heartbeatTimerId = null;
}

export function markPlatformOffline(context: Ocpp16RuntimeContext): void {
  stopHeartbeatLoop(context);
}

function recordHeartbeatSuccess(
  context: Ocpp16RuntimeContext,
  sentAt: Date,
  payload: Partial<Ocpp16ResponseOf<"Heartbeat">>,
): Extract<Ocpp16HeartbeatResult, { status: "Accepted" }> {
  const receivedAt = context.clock();
  const timeCheck = parseHeartbeatCurrentTime(
    payload.currentTime,
    receivedAt,
    context.thresholds.heartbeatTimeDriftThresholdMs,
    context.isProtocolClockSynced(),
  );
  if (timeCheck.currentTime !== null) {
    context.syncProtocolClock(timeCheck.currentTime);
  }

  return {
    status: "Accepted",
    sentAt: cloneDate(sentAt),
    receivedAt,
    currentTime: cloneNullableDate(timeCheck.currentTime),
    timeStatus: timeCheck.timeStatus,
    timeIssue: timeCheck.timeIssue,
    consecutiveFailures: 0,
    platformCommunicationStatus: "online",
    shouldReconnect: false,
  };
}

function recordHeartbeatFailure(
  context: Ocpp16RuntimeContext,
  input: {
    sentAt: Date;
    errorCode: string;
    errorMessage: string;
  },
): Extract<Ocpp16HeartbeatResult, { status: "Failed" }> {
  const failedAt = context.clock();

  return {
    status: "Failed",
    sentAt: cloneDate(input.sentAt),
    failedAt,
    currentTime: null,
    timeStatus: null,
    timeIssue: null,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    consecutiveFailures: 1,
    platformCommunicationStatus: "unknown",
    shouldReconnect: false,
  };
}

function getLoopFailureCommunicationStatus(
  context: Ocpp16RuntimeContext,
  consecutiveFailures: number,
): Exclude<PlatformCommunicationStatus, "offline"> {
  if (consecutiveFailures >= context.thresholds.heartbeatUnstableThreshold) {
    return "unstable";
  }

  return "unknown";
}

function callSafely(callback: () => void): void {
  try {
    callback();
  } catch {
    // Heartbeat loop 回调不能破坏定时器自身。
  }
}
