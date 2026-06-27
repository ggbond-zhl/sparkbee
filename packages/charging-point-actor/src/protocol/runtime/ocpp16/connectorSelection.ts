import type { Connector } from "../../../model";
import { ProtocolRuntimeError } from "./errors";
import type { Ocpp16RuntimeContext } from "./state";

export type ConnectorSelection = {
  evseId: number;
  connectorId: number;
  ocppConnectorId: number;
  connector: Connector;
};

export function requireRegisteredChargingPoint(
  context: Ocpp16RuntimeContext,
  message: string,
): void {
  if (context.registrationStatus !== "Accepted") {
    throw new ProtocolRuntimeError("PROTOCOL_RUNTIME_NOT_REGISTERED", message);
  }
}

export function requireStartableConnector(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): ConnectorSelection {
  requireRegisteredChargingPoint(
    context,
    "BootNotification 未 Accepted，不能启动交易",
  );

  return requireStartableConnectorState(context, connectorId, {
    allowUnregisteredChargingPoint: false,
  });
}

export function requireLocallyStartableConnector(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): ConnectorSelection {
  return requireStartableConnectorState(context, connectorId, {
    allowUnregisteredChargingPoint: true,
  });
}

function requireStartableConnectorState(
  context: Ocpp16RuntimeContext,
  connectorId: number,
  options: { allowUnregisteredChargingPoint: boolean },
): ConnectorSelection {
  const selection = requireConnectorSelection(context, connectorId);
  const evse = context.chargingPoint.getEvse(selection.evseId);
  if (evse === undefined) {
    throw new ProtocolRuntimeError("PROTOCOL_RUNTIME_CONNECTOR_NOT_FOUND", `EVSE ${selection.evseId} 不存在`);
  }

  const connectorCanStart =
    selection.connector.status === "occupied" &&
    selection.connector.plugState === "plugged" &&
    !hasActiveTransactionOnConnector(context, selection);
  const evseCanStart =
    evse.status === "occupied" &&
    evse.activeTransactionId === null &&
    selection.connector.status === "occupied" &&
      selection.connector.plugState === "plugged";

  const chargingPointCanStart =
    context.chargingPoint.status === "available" ||
    (
      options.allowUnregisteredChargingPoint &&
      context.registrationStatus !== "Accepted" &&
      context.chargingPoint.status === "unavailable"
    );

  if (
    !chargingPointCanStart ||
    !evseCanStart ||
    evse.activeTransactionId !== null ||
    !connectorCanStart ||
    selection.connector.availability !== "operative" ||
    hasActiveTransactionOnConnector(context, selection)
  ) {
    throw new ProtocolRuntimeError("PROTOCOL_RUNTIME_CONNECTOR_NOT_STARTABLE", `connector ${connectorId} 当前不可启动交易`);
  }

  return selection;
}

export function requireAuthorizableConnector(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): ConnectorSelection {
  requireRegisteredChargingPoint(
    context,
    "BootNotification 未 Accepted，不能授权",
  );

  return requireAuthorizableConnectorState(context, connectorId, {
    allowUnregisteredChargingPoint: false,
  });
}

export function requireLocallyAuthorizableConnector(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): ConnectorSelection {
  return requireAuthorizableConnectorState(context, connectorId, {
    allowUnregisteredChargingPoint: true,
  });
}

function requireAuthorizableConnectorState(
  context: Ocpp16RuntimeContext,
  connectorId: number,
  options: { allowUnregisteredChargingPoint: boolean },
): ConnectorSelection {
  const selection = requireConnectorSelection(context, connectorId);
  const evse = context.chargingPoint.getEvse(selection.evseId);
  if (evse === undefined) {
    throw new ProtocolRuntimeError("PROTOCOL_RUNTIME_CONNECTOR_NOT_FOUND", `EVSE ${selection.evseId} 不存在`);
  }

  const connectorCanAuthorize =
    selection.connector.status === "available" ||
    (
      selection.connector.status === "occupied" &&
      selection.connector.plugState === "plugged" &&
      !hasActiveTransactionOnConnector(context, selection)
    );
  const evseCanAuthorize =
    evse.status === "available" ||
    (
      evse.status === "occupied" &&
      evse.activeTransactionId === null &&
      selection.connector.status === "occupied" &&
      selection.connector.plugState === "plugged"
    );

  if (
    (
      context.chargingPoint.status !== "available" &&
      !(
        options.allowUnregisteredChargingPoint &&
        context.registrationStatus !== "Accepted" &&
        context.chargingPoint.status === "unavailable"
      )
    ) ||
    !evseCanAuthorize ||
    evse.activeTransactionId !== null ||
    !connectorCanAuthorize ||
    selection.connector.availability !== "operative" ||
    hasActiveTransactionOnConnector(context, selection)
  ) {
    throw new ProtocolRuntimeError("PROTOCOL_RUNTIME_CONNECTOR_NOT_STARTABLE", `connector ${connectorId} 当前不可授权`);
  }

  return selection;
}

export function canStartOnConnector(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): boolean {
  try {
    requireStartableConnector(context, connectorId);
    return true;
  } catch {
    return false;
  }
}

export function findFirstStartableConnectorId(
  context: Ocpp16RuntimeContext,
): number | null {
  return context.chargingPoint.listEvses()
    .flatMap((evse) => evse.listConnectors().map((connector) => connector.id))
    .sort((left, right) => left - right)
    .find((connectorId) => canStartOnConnector(context, connectorId)) ?? null;
}

export function getConnectorStartMeter(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): number {
  const activeTransaction = [...context.transactions.values()]
    .filter((transaction) =>
      transaction.target.scope === "connector" &&
      transaction.target.connectorId === connectorId
    )
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0];

  return activeTransaction?.latestMeterWh ?? 0;
}

export function hasActiveTransactionOnConnector(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; connectorId: number },
): boolean {
  return [...context.transactions.values()].some((transaction) => {
    const target = transaction.target;

    return (
      transaction.state !== "ended" &&
      target.scope === "connector" &&
      target.evseId === input.evseId &&
      target.connectorId === input.connectorId
    );
  });
}

export function requireConnectorSelection(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): ConnectorSelection {
  if (connectorId === 0) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_CONNECTOR_NOT_TRANSACTIONAL",
      "connectorId=0 不能用于交易",
    );
  }

  for (const evse of context.chargingPoint.listEvses()) {
    const connector = evse.getConnector(connectorId);
    if (connector !== undefined) {
      return {
        evseId: evse.id,
        connectorId,
        ocppConnectorId: connectorId,
        connector,
      };
    }
  }

  throw new ProtocolRuntimeError(
    "PROTOCOL_RUNTIME_CONNECTOR_NOT_FOUND",
    `OCPP connector ${connectorId} 未找到`,
  );
}

export function requireDomainConnector(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; connectorId: number },
): Connector {
  const connector = context.chargingPoint.getConnector(
    input.evseId,
    input.connectorId,
  );
  if (connector === undefined) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_CONNECTOR_NOT_FOUND",
      `枪口 ${input.evseId}/${input.connectorId} 不存在`,
    );
  }

  return connector;
}
