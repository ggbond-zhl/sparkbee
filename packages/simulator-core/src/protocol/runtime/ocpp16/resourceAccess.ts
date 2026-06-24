import type { Transaction } from "../../../model";
import type { Ocpp16StopTransactionInput } from "./types";
import { ProtocolRuntimeError } from "./errors";
import type { Ocpp16RuntimeContext } from "./state";

export {
  type ConnectorSelection,
  canStartOnConnector,
  findFirstStartableConnectorId,
  getConnectorStartMeter,
  hasActiveTransactionOnConnector,
  requireAuthorizableConnector,
  requireConnectorSelection,
  requireDomainConnector,
  requireLocallyAuthorizableConnector,
  requireLocallyStartableConnector,
  requireRegisteredChargingPoint,
  requireStartableConnector,
} from "./connectorSelection";

export function occupyConnector(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; connectorId: number },
  at: Date,
): void {
  context.chargingPoint = context.chargingPoint.updateEvse(input.evseId, (evse) =>
    evse.updateConnector(input.connectorId, (connector) =>
      connector
        .setPlugState("plugged", at)
        .setVehiclePresence("detected", at)
        .setOccupied(true, at)
    )
  );
}

export function bindEvseTransaction(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; connectorId: number },
  transactionId: string,
  at: Date,
): void {
  context.chargingPoint = context.chargingPoint.updateEvse(input.evseId, (evse) =>
    evse.bindTransaction(transactionId, at)
  );
}

export function releaseTransactionOnConnector(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; connectorId: number },
  at: Date,
): void {
  context.chargingPoint = context.chargingPoint.updateEvse(input.evseId, (evse) =>
    evse
      .releaseTransaction(at)
      .updateConnector(input.connectorId, (connector) =>
        connector.setLockState("unlocked", at)
      )
  );
}

export function releaseConnector(
  context: Ocpp16RuntimeContext,
  input: { evseId: number; connectorId: number },
  at: Date,
): void {
  context.chargingPoint = context.chargingPoint.updateEvse(input.evseId, (evse) =>
    evse
      .releaseTransaction(at)
      .updateConnector(input.connectorId, (connector) =>
        connector
          .setOccupied(false, at)
          .setPlugState("unplugged", at)
          .setVehiclePresence("absent", at)
          .setLockState("unlocked", at)
      )
  );
}

export function requireTransaction(
  context: Ocpp16RuntimeContext,
  transactionId: string,
): Transaction {
  const chargingTransaction = context.transactions.get(transactionId);
  if (chargingTransaction === undefined) {
    throw new ProtocolRuntimeError("PROTOCOL_RUNTIME_TRANSACTION_NOT_FOUND", `充电交易 ${transactionId} 不存在`);
  }

  return chargingTransaction;
}

export function getOcppTransactionId(transaction: Transaction): number {
  const parsed = Number(transaction.id);
  if (!Number.isSafeInteger(parsed)) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_TRANSACTION_NOT_BOUND",
      `交易 ${transaction.id} 未绑定有效 OCPP transactionId`,
    );
  }

  return parsed;
}

export function resolveOcppTransactionId(
  context: Ocpp16RuntimeContext,
  transaction: Transaction,
): number {
  const bound = context.ocppTransactionIds.get(transaction.id);
  if (bound !== undefined) {
    return bound;
  }

  return getOcppTransactionId(transaction);
}

export function resolveTransaction(
  context: Ocpp16RuntimeContext,
  input: Ocpp16StopTransactionInput,
): Transaction {
  if (input.transactionId !== undefined) {
    return requireTransaction(context, input.transactionId);
  }

  if (input.ocppTransactionId !== undefined) {
    const chargingTransaction = findTransactionByOcppTransactionId(context, input.ocppTransactionId);
    if (chargingTransaction !== undefined) {
      return chargingTransaction;
    }
  }

  throw new ProtocolRuntimeError("PROTOCOL_RUNTIME_INVALID_OPERATION", "必须提供有效的 transactionId 或 ocppTransactionId");
}

export function findTransactionByOcppTransactionId(
  context: Ocpp16RuntimeContext,
  ocppTransactionId: number,
): Transaction | undefined {
  for (const [localTransactionId, boundOcppTransactionId] of context.ocppTransactionIds) {
    if (boundOcppTransactionId === ocppTransactionId) {
      return context.transactions.get(localTransactionId);
    }
  }

  return context.transactions.get(String(ocppTransactionId));
}

export function requireOcppConnectorId(
  _context: Ocpp16RuntimeContext,
  transaction: Transaction,
): number {
  const target = transaction.target;
  if (target.scope !== "connector") {
    throw new ProtocolRuntimeError("PROTOCOL_RUNTIME_INVALID_OPERATION", "OCPP 1.6 交易必须绑定到 connector");
  }

  return target.connectorId;
}

export function removeTransaction(context: Ocpp16RuntimeContext, transactionId: string): void {
  context.transactions.delete(transactionId);
}
