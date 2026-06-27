import type {
  AuthorizationSource,
  AuthorizationStatus,
  ChargingPointStatus,
  ConnectorStatus,
  EVSEStatus,
  TransactionState,
} from "../../../model";
import { cloneDate } from "../../../shared/utils";
import type { Ocpp16RuntimeContext } from "./state";
import type {
  Ocpp16AuthorizationStatus,
  Ocpp16RuntimeEvent,
  Ocpp16RuntimeTransactionStatus,
} from "./types";

export type ConnectorStatusSnapshot = {
  evseStatus: EVSEStatus | null;
  connectorStatus: ConnectorStatus | null;
};

export function captureConnectorStatusSnapshot(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; connectorId: number },
): ConnectorStatusSnapshot {
  const evse = context.chargingPoint.getEvse(input.evseId);
  return {
    evseStatus: evse?.status ?? null,
    connectorStatus: evse?.getConnector(input.connectorId)?.status ?? null,
  };
}

export function emitChangedEvseStatus(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    previousStatus: EVSEStatus | null;
    occurredAt?: Date;
  },
): void {
  const currentStatus = context.chargingPoint.getEvse(input.evseId)?.status;
  if (currentStatus === undefined || currentStatus === input.previousStatus) {
    return;
  }

  emitRuntimeEvent(context, {
    type: "evse.status",
    resource: { scope: "evse", evseId: input.evseId },
    previousStatus: input.previousStatus,
    currentStatus,
    occurredAt: input.occurredAt ?? context.clock(),
  });
}

export function emitChangedConnectorStatus(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    connectorId: number;
    previousStatus: ConnectorStatus | null;
    occurredAt?: Date;
  },
): void {
  const currentStatus = context.chargingPoint.getConnector(
    input.evseId,
    input.connectorId,
  )?.status;
  if (currentStatus === undefined || currentStatus === input.previousStatus) {
    return;
  }

  emitRuntimeEvent(context, {
    type: "connector.status",
    resource: {
      scope: "connector",
      evseId: input.evseId,
      connectorId: input.connectorId,
    },
    previousStatus: input.previousStatus,
    currentStatus,
    occurredAt: input.occurredAt ?? context.clock(),
  });
}

export function emitChangedConnectorStatuses(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    connectorId: number;
    previous: ConnectorStatusSnapshot;
    occurredAt?: Date;
  },
): void {
  emitChangedConnectorStatus(context, {
    evseId: input.evseId,
    connectorId: input.connectorId,
    previousStatus: input.previous.connectorStatus,
    occurredAt: input.occurredAt,
  });
  emitChangedEvseStatus(context, {
    evseId: input.evseId,
    previousStatus: input.previous.evseStatus,
    occurredAt: input.occurredAt,
  });
}

export function emitChargingPointStatusSnapshot(
  context: Ocpp16RuntimeContext,
  input: {
    occurredAt?: Date;
  },
): void {
  emitRuntimeEvent(context, {
    type: "chargingPoint.status",
    resource: { scope: "chargingPoint" },
    previousStatus: null,
    currentStatus: context.chargingPoint.status,
    occurredAt: input.occurredAt ?? context.clock(),
  });
}

export function emitChangedChargingPointStatus(
  context: Ocpp16RuntimeContext,
  input: {
    previousStatus: ChargingPointStatus | null;
    occurredAt?: Date;
  },
): void {
  const currentStatus = context.chargingPoint.status;
  if (currentStatus === input.previousStatus) {
    return;
  }

  emitRuntimeEvent(context, {
    type: "chargingPoint.status",
    resource: { scope: "chargingPoint" },
    previousStatus: input.previousStatus,
    currentStatus,
    occurredAt: input.occurredAt ?? context.clock(),
  });
}

export function emitConnectorStatusSnapshot(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    connectorId: number;
    occurredAt?: Date;
  },
): void {
  const currentStatus = context.chargingPoint.getConnector(
    input.evseId,
    input.connectorId,
  )?.status;
  if (currentStatus === undefined) {
    return;
  }

  emitRuntimeEvent(context, {
    type: "connector.status",
    resource: {
      scope: "connector",
      evseId: input.evseId,
      connectorId: input.connectorId,
    },
    previousStatus: null,
    currentStatus,
    occurredAt: input.occurredAt ?? context.clock(),
  });
}

export function emitAuthorizationStatus(
  context: Ocpp16RuntimeContext,
  input: {
    idTag: string;
    evseId?: number;
    connectorId?: number;
    authorizationStatus: Ocpp16AuthorizationStatus;
    source?: AuthorizationSource;
    occurredAt?: Date;
  },
): void {
  emitRuntimeEvent(context, {
    type: "authorization.status",
    resource: {
      scope: "authorization",
      idTag: input.idTag,
      evseId: input.evseId,
      connectorId: input.connectorId,
    },
    status: mapAuthorizationStatus(input.authorizationStatus),
    source: input.source ?? "online",
    protocolStatus: input.authorizationStatus,
    occurredAt: input.occurredAt ?? context.clock(),
  });
}

export function emitTransactionStatus(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    connectorId: number;
    transactionId?: string;
    previousStatus: TransactionState | Ocpp16RuntimeTransactionStatus | null;
    currentStatus: Ocpp16RuntimeTransactionStatus;
    reason?: string;
    error?: { code: string; message: string };
    occurredAt?: Date;
  },
): void {
  emitRuntimeEvent(context, {
    type: "transaction.status",
    resource: {
      scope: "transaction",
      evseId: input.evseId,
      connectorId: input.connectorId,
      transactionId: input.transactionId,
    },
    previousStatus: input.previousStatus,
    currentStatus: input.currentStatus,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.error === undefined ? {} : { error: input.error }),
    occurredAt: input.occurredAt ?? context.clock(),
  });
}

export function emitTransactionMeterValue(
  context: Ocpp16RuntimeContext,
  input: {
    evseId: number;
    connectorId: number;
    transactionId: string;
    meterWh: number;
    sampledAt: Date;
    occurredAt?: Date;
  },
): void {
  emitRuntimeEvent(context, {
    type: "transaction.meterValue",
    resource: {
      scope: "transaction",
      evseId: input.evseId,
      connectorId: input.connectorId,
      transactionId: input.transactionId,
    },
    meterWh: input.meterWh,
    sampledAt: cloneDate(input.sampledAt),
    occurredAt: input.occurredAt ?? context.clock(),
  });
}

function emitRuntimeEvent(
  context: Ocpp16RuntimeContext,
  event: Ocpp16RuntimeEvent,
): void {
  context.emitRuntimeEvent({
    ...event,
    occurredAt: cloneDate(event.occurredAt),
  });
}

function mapAuthorizationStatus(
  status: Ocpp16AuthorizationStatus,
): AuthorizationStatus {
  switch (status) {
    case "Accepted":
      return "accepted";
    case "Blocked":
      return "blocked";
    case "Expired":
      return "expired";
    case "ConcurrentTx":
      return "concurrent-transaction";
    case "Invalid":
    default:
      return "invalid";
  }
}
