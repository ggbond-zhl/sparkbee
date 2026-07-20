import { Transaction } from "../../../model";
import { createConnectorRef } from "../../../model/shared";
import { emitTransactionStatus } from "./events";
import {
  bindEvseTransaction,
  occupyConnector,
} from "./resourceAccess";
import type { Ocpp16RuntimeContext } from "./state";

export async function restorePersistedTransactions(
  context: Ocpp16RuntimeContext,
): Promise<void> {
  const persistedTransactions = await context.transactionStore.loadActive();

  for (const persisted of persistedTransactions) {
    const transaction = new Transaction({
      id: persisted.transactionId,
      target: createConnectorRef(
        context.chargingPoint.id,
        persisted.evseId,
        persisted.connectorId,
      ),
      credentialId: persisted.idTag,
      startedAt: persisted.startedAt,
      startMeterWh: persisted.meterStartWh,
      latestMeterWh: persisted.latestMeterWh,
      state: persisted.state,
      chargingState: persisted.chargingState,
    });
    context.transactions.set(transaction.id, transaction);
    if (persisted.ocppTransactionId !== undefined) {
      context.ocppTransactionIds.set(
        transaction.id,
        persisted.ocppTransactionId,
      );
    }
    occupyConnector(
      context,
      { evseId: persisted.evseId, connectorId: persisted.connectorId },
      persisted.startedAt,
    );
    bindEvseTransaction(
      context,
      { evseId: persisted.evseId, connectorId: persisted.connectorId },
      transaction.id,
      persisted.startedAt,
    );
    emitTransactionStatus(context, {
      evseId: persisted.evseId,
      connectorId: persisted.connectorId,
      transactionId: transaction.id,
      previousStatus: null,
      currentStatus: transaction.state,
      occurredAt: context.clock(),
    });
  }
}
