import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { boot } from "../actions/boot";
import { sendHeartbeat } from "../actions/heartbeat";
import {
  reportChargingPointStatus,
  reportConnectorStatus,
} from "../actions/statusNotification";
import { getConnectorStartMeter } from "../connectorSelection";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";
import type { Ocpp16RuntimeContext } from "../state";
import { respondThenRunAcceptedCommand } from "../RemoteCommandPolicy";

type TriggerMessageStatus = Ocpp16ResponseOf<"TriggerMessage">["status"];

export async function handleTriggerMessage(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  const payload = request.payload as Ocpp16RequestOf<"TriggerMessage">;

  if (payload.requestedMessage === "BootNotification") {
    await respondThenRunAcceptedCommand(request, responsePayload("Accepted"), () =>
      boot(context)
    );
    return;
  }

  if (payload.requestedMessage === "Heartbeat") {
    if (context.registrationStatus !== "Accepted") {
      await respond(request, "Rejected");
      return;
    }

    await respondThenRunAcceptedCommand(request, responsePayload("Accepted"), () =>
      sendHeartbeat(context)
    );
    return;
  }

  if (payload.requestedMessage === "StatusNotification") {
    if (context.registrationStatus !== "Accepted") {
      await respond(request, "Rejected");
      return;
    }
    if (
      payload.connectorId !== undefined &&
      payload.connectorId !== 0 &&
      !hasConnector(context, payload.connectorId)
    ) {
      await respond(request, "Rejected");
      return;
    }

    const accepted = responsePayload("Accepted");
    if (payload.connectorId === undefined || payload.connectorId === 0) {
      await respondThenRunAcceptedCommand(request, accepted, () =>
        reportChargingPointStatus(context)
      );
      return;
    }

    const connectorId = payload.connectorId;
    await respondThenRunAcceptedCommand(request, accepted, () =>
      reportConnectorStatus(context, {
        connectorId,
      })
    );
    return;
  }

  if (payload.requestedMessage === "MeterValues") {
    if (context.registrationStatus !== "Accepted") {
      await respond(request, "Rejected");
      return;
    }

    const connectorId = resolveTriggerConnectorId(
      context,
      payload.connectorId,
    );
    if (connectorId === null) {
      await respond(request, "Rejected");
      return;
    }

    await respondThenRunAcceptedCommand(request, responsePayload("Accepted"), () =>
      getOcpp16TransactionDelivery(context).recordTriggeredMeterValue({
        connectorId,
        meterWh: getConnectorStartMeter(context, connectorId),
        sampledAt: context.clock(),
      })
    );
    return;
  }

  await respond(request, "NotImplemented");
}

function resolveTriggerConnectorId(
  context: Ocpp16RuntimeContext,
  connectorId: number | undefined,
): number | null {
  if (connectorId === 0) {
    return null;
  }

  if (connectorId !== undefined) {
    return hasConnector(context, connectorId) ? connectorId : null;
  }

  return context.chargingPoint.listEvses()
    .flatMap((evse) => evse.listConnectors().map((connector) => connector.id))
    .sort((left, right) => left - right)
    .at(0) ?? null;
}

function hasConnector(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): boolean {
  return context.chargingPoint.listEvses()
    .some((evse) => evse.getConnector(connectorId) !== undefined);
}

function respond(
  request: InboundRequest,
  status: TriggerMessageStatus,
): Promise<void> {
  return request.respond(responsePayload(status));
}

function responsePayload(
  status: TriggerMessageStatus,
): Ocpp16ResponseOf<"TriggerMessage"> {
  return { status };
}
