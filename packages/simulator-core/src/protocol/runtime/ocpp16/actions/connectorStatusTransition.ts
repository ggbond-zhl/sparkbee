import type { ConnectorStatusSnapshot } from "../events";
import {
  captureConnectorStatusSnapshot,
  emitChangedConnectorStatuses,
} from "../events";
import { resolveConnectorOcppStatus } from "../Ocpp16ConnectorTopology";
import type { Ocpp16RuntimeContext } from "../state";
import type {
  Ocpp16ConnectorActionInput,
  Ocpp16ConnectorStatus,
  Ocpp16StatusNotificationResult,
} from "../types";
import { sendStatusNotification } from "./statusNotification";

export { resolveConnectorOcppStatus } from "../Ocpp16ConnectorTopology";

export type ConnectorStatusTransition = Ocpp16ConnectorActionInput & {
  previousStatus: ConnectorStatusSnapshot;
  previousOcppStatus: Ocpp16ConnectorStatus;
};

export function captureConnectorStatusTransition(
  context: Ocpp16RuntimeContext,
  input: Ocpp16ConnectorActionInput,
): ConnectorStatusTransition {
  return {
    ...input,
    previousStatus: captureConnectorStatusSnapshot(context, input),
    previousOcppStatus: resolveConnectorOcppStatus(context, input),
  };
}

export function emitConnectorStatusTransition(
  context: Ocpp16RuntimeContext,
  transition: ConnectorStatusTransition,
  at: Date,
): void {
  emitChangedConnectorStatuses(context, {
    evseId: transition.evseId,
    connectorId: transition.connectorId,
    previous: transition.previousStatus,
    occurredAt: at,
  });
}

export async function publishConnectorStatusTransition(
  context: Ocpp16RuntimeContext,
  transition: ConnectorStatusTransition,
  at: Date,
  options: { emitBeforeReport?: boolean } = {},
): Promise<Ocpp16StatusNotificationResult | null> {
  const nextOcppStatus = resolveConnectorOcppStatus(context, transition);
  if (nextOcppStatus === transition.previousOcppStatus) {
    if (options.emitBeforeReport === true) {
      emitConnectorStatusTransition(context, transition, at);
    }
    return null;
  }

  if (options.emitBeforeReport === true) {
    emitConnectorStatusTransition(context, transition, at);
  }

  const result = await sendStatusNotification(context, {
    connectorId: transition.connectorId,
    status: nextOcppStatus,
    at,
  });

  if (options.emitBeforeReport !== true) {
    emitConnectorStatusTransition(context, transition, at);
  }

  return result;
}

export async function reportConnectorStatusTransition(
  context: Ocpp16RuntimeContext,
  transition: ConnectorStatusTransition,
  at: Date,
): Promise<Ocpp16StatusNotificationResult | null> {
  const nextOcppStatus = resolveConnectorOcppStatus(context, transition);
  if (nextOcppStatus === transition.previousOcppStatus) {
    return null;
  }

  return sendStatusNotification(context, {
    connectorId: transition.connectorId,
    status: nextOcppStatus,
    at,
  });
}
