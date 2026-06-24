import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import { emitTransactionStatus } from "../events";
import {
  findFirstStartableConnectorId,
  getConnectorStartMeter,
  requireStartableConnector,
  type ConnectorSelection,
} from "../connectorSelection";
import type { Ocpp16RuntimeContext } from "../state";
import type { Ocpp16AuthorizeResult } from "../types";
import { authorize } from "../actions/authorization";
import { getOcpp16TransactionDelivery } from "../Ocpp16TransactionDelivery";
import { respondThenRunAcceptedCommand } from "../RemoteCommandPolicy";

export async function handleRemoteStartTransaction(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  const payload = request.payload as Ocpp16RequestOf<"RemoteStartTransaction">;
  const selection = selectRemoteStartConnector(context, payload.connectorId);
  if (selection === null) {
    await request.respond({ status: "Rejected" } satisfies Ocpp16ResponseOf<"RemoteStartTransaction">);
    return;
  }

  let authorizeResult: Ocpp16AuthorizeResult | undefined;
  if (shouldAuthorizeRemoteStart(context)) {
    authorizeResult = await authorize(context, {
      connectorId: selection.ocppConnectorId,
      idTag: payload.idTag,
    });
    if (authorizeResult.outcome !== "Accepted") {
      await request.respond({ status: "Rejected" } satisfies Ocpp16ResponseOf<"RemoteStartTransaction">);
      emitTransactionStatus(context, {
        evseId: selection.evseId,
        connectorId: selection.connectorId,
        previousStatus: null,
        currentStatus: "rejected",
        reason: mapRemoteAuthorizeRejectionReason(authorizeResult),
        ...(authorizeResult.outcome === "Failed"
          ? {
              error: {
                code: authorizeResult.errorCode,
                message: authorizeResult.errorMessage,
              },
            }
          : {}),
        occurredAt: authorizeResult.outcome === "Failed"
          ? authorizeResult.failedAt
          : authorizeResult.receivedAt,
      });
      return;
    }
  }

  await respondThenRunAcceptedCommand(
    request,
    { status: "Accepted" } satisfies Ocpp16ResponseOf<"RemoteStartTransaction">,
    () => getOcpp16TransactionDelivery(context).start(
      {
        connectorId: selection.ocppConnectorId,
        idTag: payload.idTag,
        meterStartWh: getConnectorStartMeter(context, selection.ocppConnectorId),
        startedAt: context.clock(),
      },
      { requireAuthorization: false },
    ),
    {
      onFailure: (cause) => {
        emitTransactionStatus(context, {
          evseId: selection.evseId,
          connectorId: selection.connectorId,
          previousStatus: null,
          currentStatus: "rejected",
          reason: "StartTransaction 执行失败",
          error: {
            code: "InternalError",
            message: toErrorMessage(cause),
          },
          occurredAt: context.clock(),
        });
      },
    },
  );
}

function selectRemoteStartConnector(
  context: Ocpp16RuntimeContext,
  connectorId: number | undefined,
): ConnectorSelection | null {
  try {
    const resolvedConnectorId =
      connectorId ?? findFirstStartableConnectorId(context);
    if (resolvedConnectorId === null) {
      return null;
    }

    return requireStartableConnector(context, resolvedConnectorId);
  } catch {
    return null;
  }
}

function shouldAuthorizeRemoteStart(context: Ocpp16RuntimeContext): boolean {
  return context.configurationStore.getValue("AuthorizeRemoteTxRequests") === "true";
}

function mapRemoteAuthorizeRejectionReason(result: Ocpp16AuthorizeResult): string {
  if (result.outcome === "Failed") {
    return "Authorize 请求失败";
  }

  return "Authorize 被中心系统拒绝";
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
