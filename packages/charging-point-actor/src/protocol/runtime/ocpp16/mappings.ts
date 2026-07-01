import type {
  ChargingPointStatus,
  TransactionStopReason,
  Connector,
  EVSE,
} from "../../../model";
import type { Ocpp16RequestOf } from "../../validator/Ocpp16";
import { OCPP16_ERROR_CODES } from "./constants";
import type { Ocpp16ConnectorStatus, Ocpp16ErrorCode } from "./types";

export type Ocpp16ConnectorFlowPhase =
  | "preparing"
  | "charging"
  | "finishing"
  | "available";

export function mapStopReason(
  reason: TransactionStopReason | undefined,
): Ocpp16RequestOf<"StopTransaction">["reason"] {
  if (reason === undefined) {
    return undefined;
  }

  switch (reason) {
    case "local":
      return "Local";
    case "remote":
      return "Remote";
    case "unlock-command":
      return "UnlockCommand";
    case "ev-disconnected":
      return "EVDisconnected";
    case "deauthorized":
      return "DeAuthorized";
    case "emergency-stop":
      return "EmergencyStop";
    case "other":
      return "Other";
  }
}

export function mapChargingPointStatus(
  status: ChargingPointStatus,
): Ocpp16ConnectorStatus {
  switch (status) {
    case "available":
      return "Available";
    case "unavailable":
      return "Unavailable";
    case "faulted":
      return "Faulted";
  }
}

export function mapConnectorFlowStatus(
  phase: Ocpp16ConnectorFlowPhase,
): Ocpp16ConnectorStatus {
  switch (phase) {
    case "preparing":
      return "Preparing";
    case "charging":
      return "Charging";
    case "finishing":
      return "Finishing";
    case "available":
      return "Available";
  }
}

export function mapConnectorStatus(input: {
  evse: EVSE;
  connector: Connector;
}): Ocpp16ConnectorStatus {
  if (input.connector.status === "faulted" || input.evse.status === "faulted") {
    return "Faulted";
  }

  if (input.evse.activeTransactionId !== null) {
    return "Charging";
  }

  if (input.evse.activeReservationId !== null) {
    return "Reserved";
  }

  if (input.evse.status === "unavailable" || input.connector.status === "unavailable") {
    return "Unavailable";
  }

  switch (input.connector.status) {
    case "available":
      return "Available";
    case "occupied":
      return "Preparing";
  }
}

export function mapErrorCode(
  faultCode: string | null,
): { errorCode: Ocpp16ErrorCode; vendorErrorCode?: string } {
  if (faultCode === null) {
    return { errorCode: "NoError" };
  }

  if (OCPP16_ERROR_CODES.has(faultCode)) {
    return { errorCode: faultCode as Ocpp16ErrorCode };
  }

  return {
    errorCode: "OtherError",
    vendorErrorCode: faultCode,
  };
}
