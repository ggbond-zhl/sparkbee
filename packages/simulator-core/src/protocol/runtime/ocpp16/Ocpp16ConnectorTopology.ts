import type {
  ConnectorStatus,
  EVSEStatus,
} from "../../../model";
import { ProtocolRuntimeError } from "./errors";
import { mapConnectorStatus } from "./mappings";
import { resolveOcppTransactionId } from "./resourceAccess";
import type { Ocpp16RuntimeContext } from "./state";
import type {
  Ocpp16ConnectorActionInput,
  Ocpp16ConnectorStatus,
} from "./types";

export class Ocpp16ConnectorTopology {
  constructor(private readonly context: Ocpp16RuntimeContext) {}

  getEvseStatus(evseId: number): EVSEStatus | undefined {
    return this.context.chargingPoint.getEvse(evseId)?.status;
  }

  getConnectorStatus(input: Ocpp16ConnectorActionInput): ConnectorStatus | undefined {
    return this.context.chargingPoint.getConnector(
      input.evseId,
      input.connectorId,
    )?.status;
  }

  listConnectorRefs(): Array<{ evseId: number; connectorId: number }> {
    return this.context.chargingPoint.listEvses().flatMap((evse) =>
      evse.listConnectors().map((connector) => ({
        evseId: evse.id,
        connectorId: connector.id,
      }))
    );
  }

  getTransactionResource(transactionId: string): {
    evseId: number;
    connectorId: number;
    ocppTransactionId: number | null;
  } | undefined {
    const transaction = this.context.transactions.get(transactionId);
    if (transaction === undefined || transaction.target.scope !== "connector") {
      return undefined;
    }

    let ocppTransactionId: number | null = null;
    try {
      ocppTransactionId = resolveOcppTransactionId(this.context, transaction);
    } catch {
      ocppTransactionId = null;
    }

    return {
      evseId: transaction.target.evseId,
      connectorId: transaction.target.connectorId,
      ocppTransactionId,
    };
  }
}

export function resolveConnectorOcppStatus(
  context: Ocpp16RuntimeContext,
  input: Ocpp16ConnectorActionInput,
  options: { fallback?: Ocpp16ConnectorStatus } = {},
): Ocpp16ConnectorStatus {
  const evse = context.chargingPoint.getEvse(input.evseId);
  const connector = evse?.getConnector(input.connectorId);
  if (evse === undefined || connector === undefined) {
    if (options.fallback !== undefined) {
      return options.fallback;
    }

    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_CONNECTOR_NOT_FOUND",
      `枪口 ${input.evseId}/${input.connectorId} 不存在`,
    );
  }

  return mapConnectorStatus({ evse, connector });
}
