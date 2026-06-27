import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { findTransactionByOcppTransactionId } from "../resourceAccess";
import type { Ocpp16RuntimeContext } from "../state";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";
import { respondThenRunAcceptedCommand } from "../RemoteCommandPolicy";

export async function handleRemoteStopTransaction(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  const payload = request.payload as Ocpp16RequestOf<"RemoteStopTransaction">;
  const chargingTransaction = findTransactionByOcppTransactionId(context, payload.transactionId);
  if (chargingTransaction === undefined || chargingTransaction.state === "ended") {
    await request.respond({ status: "Rejected" } satisfies Ocpp16ResponseOf<"RemoteStopTransaction">);
    return;
  }

  await respondThenRunAcceptedCommand(
    request,
    { status: "Accepted" } satisfies Ocpp16ResponseOf<"RemoteStopTransaction">,
    () => getOcpp16TransactionDelivery(context).stop({
      transactionId: chargingTransaction.id,
      reason: "remote",
      stoppedAt: context.clock(),
    }),
  );
}
