import type { Transaction } from "../../../../model";
import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { requireConnectorSelection } from "../connectorSelection";
import type { Ocpp16RuntimeContext } from "../state";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";
import { respondThenRunAcceptedCommand } from "../RemoteCommandPolicy";

type UnlockConnectorStatus = Ocpp16ResponseOf<"UnlockConnector">["status"];

export async function handleUnlockConnector(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  const payload = request.payload as Ocpp16RequestOf<"UnlockConnector">;
  if (context.registrationStatus !== "Accepted") {
    await respond(request, "UnlockFailed");
    return;
  }

  const selection = findConnector(context, payload.connectorId);
  if (selection === null) {
    await respond(request, "NotSupported");
    return;
  }

  const at = context.clock();
  const activeTransaction = findActiveTransaction(context, selection);
  try {
    context.chargingPoint = context.chargingPoint.updateEvse(
      selection.evseId,
      (evse) =>
        evse.updateConnector(selection.connectorId, (connector) =>
          connector.setLockState("unlocked", at)
        ),
    );
  } catch {
    await respond(request, "UnlockFailed");
    return;
  }

  if (activeTransaction === null) {
    await respond(request, "Unlocked");
    return;
  }

  await respondThenRunAcceptedCommand(
    request,
    { status: "Unlocked" } satisfies Ocpp16ResponseOf<"UnlockConnector">,
    () => getOcpp16TransactionDelivery(context).stop({
        transactionId: activeTransaction.id,
        reason: "unlock-command",
        stoppedAt: at,
    }),
  );
}

function findConnector(
  context: Ocpp16RuntimeContext,
  connectorId: number,
): { evseId: number; connectorId: number } | null {
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

function findActiveTransaction(
  context: Ocpp16RuntimeContext,
  selection: { evseId: number; connectorId: number },
): Transaction | null {
  return [...context.transactions.values()].find((transaction) => {
    const target = transaction.target;

    return (
      transaction.state !== "ended" &&
      target.scope === "connector" &&
      target.evseId === selection.evseId &&
      target.connectorId === selection.connectorId
    );
  }) ?? null;
}

function respond(
  request: InboundRequest,
  status: UnlockConnectorStatus,
): Promise<void> {
  return request.respond({
    status,
  } satisfies Ocpp16ResponseOf<"UnlockConnector">);
}
