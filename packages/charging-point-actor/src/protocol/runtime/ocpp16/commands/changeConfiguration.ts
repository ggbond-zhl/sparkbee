import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { restartHeartbeatLoop } from "../actions/heartbeat";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";
import type { Ocpp16RuntimeContext } from "../state";

type ChangeConfigurationStatus = Ocpp16ResponseOf<"ChangeConfiguration">["status"];

export async function handleChangeConfiguration(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  const payload = request.payload as Ocpp16RequestOf<"ChangeConfiguration">;
  if (payload.key === "HeartbeatInterval" && !isPositiveIntegerString(payload.value)) {
    await respond(request, "Rejected");
    return;
  }

  const status = context.configurationStore.change(
    payload.key,
    payload.value,
    context.clock(),
  );

  if (status === "Accepted" || status === "RebootRequired") {
    applyRuntimeSideEffects(context, payload.key);
  }

  await respond(request, status);
}

function applyRuntimeSideEffects(
  context: Ocpp16RuntimeContext,
  key: string,
): void {
  if (key === "HeartbeatInterval") {
    restartHeartbeatLoop(context);
    return;
  }

  if (key === "MeterValueSampleInterval") {
    getOcpp16TransactionDelivery(context).applyMeterValueSampleIntervalChange();
  }
}

function respond(
  request: InboundRequest,
  status: ChangeConfigurationStatus,
): Promise<void> {
  return request.respond({
    status,
  } satisfies Ocpp16ResponseOf<"ChangeConfiguration">);
}

function isPositiveIntegerString(value: string): boolean {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return false;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0;
}
