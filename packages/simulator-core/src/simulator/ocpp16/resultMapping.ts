import type {
  Ocpp16AuthorizationStatus,
  Ocpp16AuthorizeResult,
  Ocpp16BootResult,
  Ocpp16ConnectorActionResult,
  Ocpp16MeterValuesResult,
  Ocpp16StopTransactionResult,
  Ocpp16TransactionStartResult,
} from "../../protocol/runtime";
import type {
  SimulatorAuthorizeResult,
  SimulatorAuthorizationStatus,
  SimulatorMeterValueResult,
  SimulatorStopTransactionResult,
  SimulatorTransactionStartResult,
} from "../types";
import type {
  Ocpp16SimulatorAuthorizeResult,
  Ocpp16SimulatorConnectorActionResult,
  Ocpp16SimulatorTransactionStartResult,
} from "./types";

export function toSimulatorBootResult(result: Ocpp16BootResult): {
  status: "accepted" | "pending" | "rejected";
  protocolStatus: string;
  currentTime: Date;
  interval: number;
} {
  return {
    status: result.status === "Accepted"
      ? "accepted"
      : result.status === "Pending"
        ? "pending"
        : "rejected",
    protocolStatus: result.status,
    currentTime: result.currentTime,
    interval: result.interval,
  };
}

export function toSimulatorConnectorActionResult(
  result: Ocpp16ConnectorActionResult,
): Ocpp16SimulatorConnectorActionResult {
  return {
    evseId: result.evseId,
    connectorId: result.connectorId,
    plugState: result.plugState,
    vehiclePresence: result.vehiclePresence,
    connectorStatus: result.connectorStatus,
  };
}

export function toSimulatorAuthorizeResult(
  result: Ocpp16AuthorizeResult,
): Ocpp16SimulatorAuthorizeResult {
  if (result.outcome === "Accepted") {
    return {
      status: "accepted",
      authorization: {
        status: "accepted",
        source: result.source,
        protocolStatus: result.authorizationStatus,
      },
    };
  }

  if (result.outcome === "Rejected") {
    return {
      status: "rejected",
      reason: result.reason ?? "Authorize 被中心系统拒绝",
      authorizationStatus: result.authorizationStatus,
      authorization: {
        status: mapAuthorizationStatus(result.authorizationStatus),
        source: result.source,
        protocolStatus: result.authorizationStatus,
      },
    };
  }

  return {
    status: "failed",
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    shouldReconnect: result.shouldReconnect,
  };
}

export function toSimulatorTransactionStartResult(
  result: Ocpp16TransactionStartResult,
): Ocpp16SimulatorTransactionStartResult {
  if (result.status === "Accepted") {
    return {
      status: "accepted",
      transactionId: result.transactionId,
      authorization: {
        status: "accepted",
        source: result.authorizationSource ?? "online",
        protocolStatus: "Accepted",
      },
    };
  }

  return {
    status: "rejected",
    reason: result.reason,
    authorizationStatus: result.authorizationStatus,
    ...(result.authorizationStatus === undefined
      ? {}
      : {
          authorization: {
            status: mapAuthorizationStatus(result.authorizationStatus),
            source: "online",
            protocolStatus: result.authorizationStatus,
          },
        }),
  };
}

export function toSimulatorMeterValueResult(
  result: Ocpp16MeterValuesResult,
): SimulatorMeterValueResult {
  if (result.outcome === "Accepted") {
    return {
      status: "accepted",
      transactionId: result.transactionId,
      meterWh: result.meterWh,
      sampledAt: result.sampledAt,
    };
  }

  return {
    status: "failed",
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    shouldReconnect: result.shouldReconnect,
  };
}

export function toSimulatorStopTransactionResult(
  result: Ocpp16StopTransactionResult,
): SimulatorStopTransactionResult {
  if (result.outcome === "Accepted") {
    return {
      status: "accepted",
      transactionId: result.transactionId,
      meterStopWh: result.meterStop,
      stoppedAt: result.stoppedAt,
    };
  }

  return {
    status: "failed",
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    shouldReconnect: result.shouldReconnect,
  };
}

export function toPublicAuthorizeResult(
  result: Ocpp16SimulatorAuthorizeResult,
): SimulatorAuthorizeResult {
  if (result.status === "accepted") {
    return { status: "accepted" };
  }

  if (result.status === "rejected") {
    return {
      status: "rejected",
      reason: result.reason,
      ...(result.authorizationStatus === undefined
        ? {}
        : { authorizationStatus: result.authorizationStatus }),
    };
  }

  return {
    status: "failed",
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    shouldReconnect: result.shouldReconnect,
  };
}

export function toPublicTransactionStartResult(
  result: Ocpp16SimulatorTransactionStartResult,
): SimulatorTransactionStartResult {
  if (result.status === "accepted") {
    return {
      status: "accepted",
      transactionId: result.transactionId,
    };
  }

  return {
    status: "rejected",
    reason: result.reason,
    ...(result.authorizationStatus === undefined
      ? {}
      : { authorizationStatus: result.authorizationStatus }),
  };
}

function mapAuthorizationStatus(
  status: Ocpp16AuthorizationStatus,
): SimulatorAuthorizationStatus {
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
