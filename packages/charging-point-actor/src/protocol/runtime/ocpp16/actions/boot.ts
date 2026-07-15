import type {
  Ocpp16RequestOf,
  Ocpp16ResponseOf,
} from "../../../validator/Ocpp16";
import { shouldSyncProtocolClock, type Ocpp16RuntimeContext } from "../state";
import type { Ocpp16BootResult } from "../types";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";
import { traceOcpp16RuntimeOperation } from "../actorLogs";

export async function boot(
  context: Ocpp16RuntimeContext,
): Promise<Ocpp16BootResult> {
  return traceOcpp16RuntimeOperation(
    context,
    {
      category: "action",
      name: "BootNotification",
      input: {
        chargePointVendor: context.chargingPoint.vendor,
        chargePointModel: context.chargingPoint.model,
        chargePointSerialNumber: context.chargingPoint.serialNumber,
        firmwareVersion: context.chargingPoint.firmwareVersion,
      },
    },
    () => bootCore(context),
  );
}

async function bootCore(
  context: Ocpp16RuntimeContext,
): Promise<Ocpp16BootResult> {
  const response = await requestResponse(context, "BootNotification", {
    chargePointVendor: context.chargingPoint.vendor,
    chargePointModel: context.chargingPoint.model,
    chargePointSerialNumber: context.chargingPoint.serialNumber,
    firmwareVersion: context.chargingPoint.firmwareVersion,
  });
  const platformCurrentTime = new Date(response.currentTime);
  if (shouldSyncProtocolClock(context, platformCurrentTime)) {
    context.syncProtocolClock(platformCurrentTime);
  }

  const previousRegistrationStatus = context.registrationStatus;
  context.registrationStatus = response.status;

  if (response.status === "Accepted") {
    const acceptedAt = context.clock();
    context.configurationStore.sync(
      "HeartbeatInterval",
      String(response.interval),
      acceptedAt,
    );
    if (previousRegistrationStatus !== "Accepted") {
      context.chargingPoint = context.chargingPoint.markOperative(acceptedAt);
    }
    await getOcpp16TransactionDelivery(context).replayPending();
  }

  return {
    status: response.status,
    currentTime: platformCurrentTime,
    interval: response.interval,
  };
}

function requestResponse<TAction extends string>(
  context: Ocpp16RuntimeContext,
  action: TAction,
  payload: TAction extends keyof Ocpp16ActionMap
    ? Ocpp16ActionMap[TAction]["request"]
    : unknown,
): Promise<TAction extends keyof Ocpp16ActionMap
  ? Ocpp16ActionMap[TAction]["response"]
  : unknown> {
  return context.session.request(action, payload).then((result) => {
    if (result.kind === "error") {
      throw new Error(`${action} 请求失败: ${result.errorMessage}`);
    }

    return result.payload as TAction extends keyof Ocpp16ActionMap
      ? Ocpp16ActionMap[TAction]["response"]
      : unknown;
  });
}

type Ocpp16ActionMap = {
  BootNotification: {
    request: Ocpp16RequestOf<"BootNotification">;
    response: Ocpp16ResponseOf<"BootNotification">;
  };
};
