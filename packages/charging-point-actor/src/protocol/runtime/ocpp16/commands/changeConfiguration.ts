import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { restartHeartbeatLoop } from "../actions/heartbeat";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";
import type { Ocpp16RuntimeContext } from "../state";
import type {
  Ocpp16ConfigurationChangeResult,
  Ocpp16ConfigurationChangeSource,
} from "../ConfigurationStore";

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

  let result: Ocpp16ConfigurationChangeResult;
  try {
    result = await changeConfiguration(context, {
      key: payload.key,
      value: payload.value,
      source: "csms",
    });
  } catch {
    await respond(request, "Rejected");
    return;
  }

  await respond(request, result.status);
}

export async function changeConfiguration(
  context: Ocpp16RuntimeContext,
  input: {
    key: string;
    value: string;
    source: Extract<Ocpp16ConfigurationChangeSource, "csms" | "ui">;
    expectedVersion?: number;
  },
): Promise<Ocpp16ConfigurationChangeResult> {
  if (input.key === "HeartbeatInterval" && !isPositiveIntegerString(input.value)) {
    return { status: "Rejected" };
  }

  const result = await context.configurationStore.changeAndPersist(
    input.key,
    input.value,
    context.clock(),
    input.source,
    input.expectedVersion,
  );
  if (result.status === "Accepted" || result.status === "RebootRequired") {
    applyRuntimeSideEffects(context, input.key);
    if (result.entry !== undefined) {
      context.emitRuntimeEvent({
        type: "configuration.changed",
        resource: { scope: "configuration", key: result.entry.key },
        value: result.entry.value,
        version: result.entry.version,
        lastModifiedBy: result.entry.lastModifiedBy,
        pendingRestart: result.entry.pendingRestart,
        occurredAt: result.entry.updatedAt,
      });
    }
  }
  return result;
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
