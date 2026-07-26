import type {
  ChargingPointActorTransactionDeliveryRecord,
  ChargingPointActorTransactionDeliveryStatus,
} from "../../../chargingPointActor/types";

import type { Ocpp16RuntimeContext } from "./state";

export function emitTransactionDeliveryChanged(
  context: Ocpp16RuntimeContext,
  record: ChargingPointActorTransactionDeliveryRecord,
  previousStatus: ChargingPointActorTransactionDeliveryStatus | null,
): void {
  context.emitRuntimeEvent({
    type: "transaction-delivery.changed",
    resource: {
      scope: "transactionDelivery",
      transactionId: record.transactionId,
      messageId: record.messageId,
      deliverySequence: record.deliverySequence,
    },
    messageType: record.messageType,
    previousStatus,
    currentStatus: record.status,
    attemptCount: record.attemptCount,
    nextAttemptAt: record.nextAttemptAt,
    lastError: record.lastErrorCode === null || record.lastErrorMessage === null
      ? null
      : {
          code: record.lastErrorCode,
          message: record.lastErrorMessage,
        },
    occurredAt: context.clock(),
  });
}
