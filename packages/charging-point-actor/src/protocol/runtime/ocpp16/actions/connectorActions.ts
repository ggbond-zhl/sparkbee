import {
  hasActiveTransactionOnConnector,
  requireDomainConnector,
} from "../connectorSelection";
import { traceOcpp16RuntimeOperation } from "../actorLogs";
import { ProtocolRuntimeError } from "../errors";
import type { Ocpp16RuntimeContext } from "../state";
import type {
  Ocpp16ConnectorActionInput,
  Ocpp16ConnectorActionResult,
  Ocpp16StatusNotificationResult,
} from "../types";
import {
  captureConnectorAvailabilitySnapshot,
  emitConnectorAvailabilitySnapshot,
} from "../events";
import {
  captureConnectorStatusTransition,
  emitConnectorStatusTransition,
  publishConnectorStatusTransition,
  reportConnectorStatusTransition,
} from "./connectorStatusTransition";
import { stopTransaction } from "./stopTransaction";

export async function plugConnector(
  context: Ocpp16RuntimeContext,
  input: Ocpp16ConnectorActionInput,
): Promise<Ocpp16ConnectorActionResult> {
  return traceOcpp16RuntimeOperation(
    context,
    {
      category: "action",
      name: "PlugConnector",
      input,
    },
    () => plugConnectorCore(context, input),
  );
}

async function plugConnectorCore(
  context: Ocpp16RuntimeContext,
  input: Ocpp16ConnectorActionInput,
): Promise<Ocpp16ConnectorActionResult> {
  const at = context.clock();
  const connector = requireDomainConnector(context, input);
  const transition = captureConnectorStatusTransition(context, input);

  if (hasActiveTransactionOnConnector(context, input)) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      "枪口存在未结束交易，不能插枪",
    );
  }

  if (connector.status !== "available") {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      `枪口 ${input.evseId}/${input.connectorId} 当前不可插枪`,
    );
  }

  context.chargingPoint = context.chargingPoint.updateEvse(input.evseId, (evse) =>
    evse.updateConnector(input.connectorId, (connector) =>
      connector
        .setPlugState("plugged", at)
        .setVehiclePresence("detected", at)
        .setOccupied(true, at)
    )
  );

  if (context.registrationStatus === "Accepted") {
    await publishConnectorStatusTransition(context, transition, at, {
      emitBeforeReport: true,
    });
  } else {
    emitConnectorStatusTransition(context, transition, at);
  }

  return {
    evseId: input.evseId,
    connectorId: input.connectorId,
    ocppConnectorId: input.connectorId,
    plugState: "plugged",
    vehiclePresence: "detected",
    connectorStatus: "occupied",
  };
}

export async function unplugConnector(
  context: Ocpp16RuntimeContext,
  input: Ocpp16ConnectorActionInput,
): Promise<Ocpp16ConnectorActionResult> {
  return traceOcpp16RuntimeOperation(
    context,
    {
      category: "action",
      name: "UnplugConnector",
      input,
    },
    () => unplugConnectorCore(context, input),
  );
}

async function unplugConnectorCore(
  context: Ocpp16RuntimeContext,
  input: Ocpp16ConnectorActionInput,
): Promise<Ocpp16ConnectorActionResult> {
  const at = context.clock();
  requireDomainConnector(context, input);
  const transition = captureConnectorStatusTransition(context, input);
  const activeTransaction = [...context.transactions.values()].find((transaction) => {
    const target = transaction.target;
    return transaction.state !== "ended" &&
      target.scope === "connector" &&
      target.evseId === input.evseId &&
      target.connectorId === input.connectorId;
  });

  if (activeTransaction?.state === "ending") {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      "交易正在结束，请稍后拔枪",
    );
  }

  context.chargingPoint = context.chargingPoint.updateEvse(input.evseId, (evse) =>
    evse.updateConnector(input.connectorId, (connector) =>
      connector
        .setOccupied(false, at)
        .setPlugState("unplugged", at)
        .setVehiclePresence("absent", at)
        .setLockState("unlocked", at)
    )
  );

  if (activeTransaction !== undefined) {
    await stopTransaction(context, {
      transactionId: activeTransaction.id,
      reason: "ev-disconnected",
      stoppedAt: at,
    });

    const connector = requireDomainConnector(context, input);
    return {
      evseId: input.evseId,
      connectorId: input.connectorId,
      ocppConnectorId: input.connectorId,
      plugState: "unplugged",
      vehiclePresence: "absent",
      connectorStatus: connector.status,
    };
  }

  emitConnectorStatusTransition(context, transition, at);

  const availabilityTransition = captureConnectorStatusTransition(context, input);
  const availabilityApplication =
    await applyRequestedAvailabilityWhenNoActiveTransaction(context, input, at);
  if (availabilityApplication.applied) {
    emitConnectorStatusTransition(context, availabilityTransition, at);
  }

  const connector = requireDomainConnector(context, input);
  return {
    evseId: input.evseId,
    connectorId: input.connectorId,
    ocppConnectorId: input.connectorId,
    plugState: "unplugged",
    vehiclePresence: "absent",
    connectorStatus: connector.status,
  };
}

export async function applyRequestedAvailabilityWhenNoActiveTransaction(
  context: Ocpp16RuntimeContext,
  input: Ocpp16ConnectorActionInput,
  at: Date,
): Promise<{
  applied: boolean;
  statusNotificationResult: Ocpp16StatusNotificationResult | null;
}> {
  const evse = context.chargingPoint.getEvse(input.evseId);
  const connector = evse?.getConnector(input.connectorId);
  if (
    evse === undefined ||
    connector === undefined ||
    (evse.requestedAvailability === null &&
      connector.requestedAvailability === null) ||
    hasActiveTransactionOnConnector(context, input)
  ) {
    return { applied: false, statusNotificationResult: null };
  }

  const transition = captureConnectorStatusTransition(context, input);
  const availability = captureConnectorAvailabilitySnapshot(context, input);
  context.chargingPoint = context.chargingPoint.updateEvse(input.evseId, (evse) =>
    evse
      .applyRequestedAvailability(at)
      .updateConnector(input.connectorId, (connector) =>
        connector.applyRequestedAvailability(at)
      )
  );

  const statusNotificationResult = await reportConnectorStatusTransition(
    context,
    transition,
    at,
  );
  emitConnectorAvailabilitySnapshot(context, {
    evseId: input.evseId,
    connectorId: input.connectorId,
    previousAvailability: availability.availability,
    occurredAt: at,
  });
  return { applied: true, statusNotificationResult };
}
