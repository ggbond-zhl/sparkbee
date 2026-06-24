import type { Availability } from "../../../../model";
import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { sendStatusNotification } from "../actions/statusNotification";
import { emitChangedChargingPointStatus } from "../events";
import { mapChargingPointStatus } from "../mappings";
import {
  hasActiveTransactionOnConnector,
  requireConnectorSelection,
} from "../connectorSelection";
import type { Ocpp16RuntimeContext } from "../state";
import {
  captureConnectorStatusTransition,
  publishConnectorStatusTransition,
  type ConnectorStatusTransition,
} from "../actions/connectorStatusTransition";

type ChangeAvailabilityStatus = Ocpp16ResponseOf<"ChangeAvailability">["status"];

type ConnectorRef = {
  evseId: number;
  connectorId: number;
};

export async function handleChangeAvailability(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  const payload = request.payload as Ocpp16RequestOf<"ChangeAvailability">;
  if (context.registrationStatus !== "Accepted") {
    await respond(request, "Rejected");
    return;
  }

  const availability = mapAvailability(payload.type);
  const at = context.clock();
  if (payload.connectorId === 0) {
    await handleChargingPointAvailability(context, request, availability, at);
    return;
  }

  const target = findConnectorRef(context, payload.connectorId);
  if (target === null) {
    await respond(request, "Rejected");
    return;
  }

  const change = captureConnectorChange(context, target);
  const status = applyConnectorAvailability(context, target, availability, at);
  await respond(request, status);
  await reportConnectorChange(context, change, at);
}

async function handleChargingPointAvailability(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
  availability: Availability,
  at: Date,
): Promise<void> {
  const previousChargingPointStatus = context.chargingPoint.status;
  const previousOcppStatus = mapChargingPointStatus(previousChargingPointStatus);
  const connectorChanges = listConnectorRefs(context)
    .map((target) => captureConnectorChange(context, target));

  context.chargingPoint = context.chargingPoint
    .requestAvailability(availability)
    .applyRequestedAvailability(at);

  let status: ChangeAvailabilityStatus = "Accepted";
  for (const target of connectorChanges) {
    const connectorStatus = applyConnectorAvailability(
      context,
      target,
      availability,
      at,
    );
    if (connectorStatus === "Scheduled") {
      status = "Scheduled";
    }
  }

  await respond(request, status);

  const nextOcppStatus = mapChargingPointStatus(context.chargingPoint.status);
  if (nextOcppStatus !== previousOcppStatus) {
    await sendStatusNotification(context, {
      connectorId: 0,
      status: nextOcppStatus,
      at,
    });
    emitChangedChargingPointStatus(context, {
      previousStatus: previousChargingPointStatus,
      occurredAt: at,
    });
  }

  for (const change of connectorChanges) {
    await reportConnectorChange(context, change, at);
  }
}

function applyConnectorAvailability(
  context: Ocpp16RuntimeContext,
  target: ConnectorRef,
  availability: Availability,
  at: Date,
): ChangeAvailabilityStatus {
  const isScheduled =
    availability === "inoperative" &&
    hasActiveTransactionOnConnector(context, target);

  context.chargingPoint = context.chargingPoint.updateEvse(target.evseId, (evse) => {
    let nextEvse = evse;
    if (!isScheduled && nextEvse.activeReservationId !== null) {
      nextEvse = nextEvse.clearReservation(at);
    }

    nextEvse = isScheduled
      ? nextEvse.requestAvailability(availability)
      : nextEvse.requestAvailability(availability).applyRequestedAvailability(at);

    return nextEvse.updateConnector(target.connectorId, (connector) =>
      isScheduled
        ? connector.requestAvailability(availability)
        : connector.requestAvailability(availability).applyRequestedAvailability(at)
    );
  });

  return isScheduled ? "Scheduled" : "Accepted";
}

async function reportConnectorChange(
  context: Ocpp16RuntimeContext,
  change: ConnectorStatusTransition,
  at: Date,
): Promise<void> {
  await publishConnectorStatusTransition(context, change, at);
}

function captureConnectorChange(
  context: Ocpp16RuntimeContext,
  target: ConnectorRef,
): ConnectorStatusTransition {
  return captureConnectorStatusTransition(context, target);
}

function findConnectorRef(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): ConnectorRef | null {
  try {
    const selection = requireConnectorSelection(context, connectorId);
    return {
      evseId: selection.evseId,
      connectorId: selection.connectorId,
    };
  } catch {
    return null;
  }
}

function listConnectorRefs(context: Ocpp16RuntimeContext): ConnectorRef[] {
  return context.chargingPoint.listEvses()
    .flatMap((evse) =>
      evse.listConnectors().map((connector) => ({
        evseId: evse.id,
        connectorId: connector.id,
      }))
    )
    .sort((left, right) => left.connectorId - right.connectorId);
}

function mapAvailability(
  type: Ocpp16RequestOf<"ChangeAvailability">["type"],
): Availability {
  return type === "Operative" ? "operative" : "inoperative";
}

function respond(
  request: InboundRequest,
  status: ChangeAvailabilityStatus,
): Promise<void> {
  return request.respond({
    status,
  } satisfies Ocpp16ResponseOf<"ChangeAvailability">);
}
