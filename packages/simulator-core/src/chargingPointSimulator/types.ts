import type {
  AuthorizationSource,
  AuthorizationStatus,
  ChargingPoint,
  ChargingPointOptions,
  ChargingPointStatus,
  TransactionState,
  TransactionStopReason,
  ConnectorStatus,
  EVSEStatus,
} from "../model";
import type { ProtocolVersion } from "../shared/types";
import type { Ocpp16ConfigurationCatalogInput } from "../protocol/runtime/ocpp16/ConfigurationStore";
import type { SessionOfflineReason } from "../protocol/session/types";

export type ChargingPointSimulatorProtocol = "OCPP16J" | "OCPP201";
export type ChargingPointSimulatorOperationStatus = "accepted" | "rejected" | "failed";

export type ChargingPointSimulatorStatus = "starting" | "running" | "stopped";
export type ChargingPointSimulatorSessionStatus = "online" | "reconnecting" | "offline";
export type ChargingPointSimulatorAuthorizationStatus = AuthorizationStatus;
export type ChargingPointSimulatorAuthorizationSource = AuthorizationSource;
export type ChargingPointSimulatorTransactionStatus =
  | TransactionState
  | "rejected"
  | "failed";

export interface ChargingPointSimulatorEventError {
  code: string;
  message: string;
}

export type ChargingPointSimulatorResourceRef =
  | { scope: "chargingPointSimulator" }
  | { scope: "session" }
  | { scope: "chargingPoint" }
  | { scope: "evse"; evseId: number }
  | { scope: "connector"; evseId: number; connectorId: number }
  | { scope: "authorization"; idTag: string; evseId?: number; connectorId?: number }
  | {
      scope: "transaction";
      evseId: number;
      connectorId: number;
      transactionId?: string;
    }
  | { scope: "protocol" };

export interface ChargingPointSimulatorEventBase<
  TType extends string,
  TResource extends ChargingPointSimulatorResourceRef,
> {
  id: string;
  sequence: number;
  type: TType;
  chargingPointSimulatorId: string;
  protocol: ProtocolVersion;
  resource: TResource;
  occurredAt: string;
}

export interface ChargingPointSimulatorStatusEvent
  extends ChargingPointSimulatorEventBase<
    "chargingPointSimulator.status",
    Extract<ChargingPointSimulatorResourceRef, { scope: "chargingPointSimulator" }>
  > {
  previousStatus: ChargingPointSimulatorStatus | null;
  currentStatus: ChargingPointSimulatorStatus;
  error?: ChargingPointSimulatorEventError;
}

export interface ChargingPointStatusEvent
  extends ChargingPointSimulatorEventBase<
    "chargingPoint.status",
    Extract<ChargingPointSimulatorResourceRef, { scope: "chargingPoint" }>
  > {
  previousStatus: ChargingPointStatus | null;
  currentStatus: ChargingPointStatus;
  error?: ChargingPointSimulatorEventError;
}

export interface EVSEStatusEvent
  extends ChargingPointSimulatorEventBase<
    "evse.status",
    Extract<ChargingPointSimulatorResourceRef, { scope: "evse" }>
  > {
  previousStatus: EVSEStatus | null;
  currentStatus: EVSEStatus;
  error?: ChargingPointSimulatorEventError;
}

export interface ConnectorStatusEvent
  extends ChargingPointSimulatorEventBase<
    "connector.status",
    Extract<ChargingPointSimulatorResourceRef, { scope: "connector" }>
  > {
  previousStatus: ConnectorStatus | null;
  currentStatus: ConnectorStatus;
  error?: ChargingPointSimulatorEventError;
}

export interface AuthorizationStatusEvent
  extends ChargingPointSimulatorEventBase<
    "authorization.status",
    Extract<ChargingPointSimulatorResourceRef, { scope: "authorization" }>
  > {
  status: ChargingPointSimulatorAuthorizationStatus;
  source: ChargingPointSimulatorAuthorizationSource;
  protocolStatus?: string;
}

export interface TransactionStatusEvent
  extends ChargingPointSimulatorEventBase<
    "transaction.status",
    Extract<ChargingPointSimulatorResourceRef, { scope: "transaction" }>
  > {
  previousStatus: ChargingPointSimulatorTransactionStatus | null;
  currentStatus: ChargingPointSimulatorTransactionStatus;
  reason?: string;
  error?: ChargingPointSimulatorEventError;
}

export interface TransactionMeterValueEvent
  extends ChargingPointSimulatorEventBase<
    "transaction.meterValue",
    Extract<ChargingPointSimulatorResourceRef, { scope: "transaction" }>
  > {
  meterWh: number;
  sampledAt: string;
}

export interface ProtocolMessageEvent
  extends ChargingPointSimulatorEventBase<
    "protocol.message",
    Extract<ChargingPointSimulatorResourceRef, { scope: "protocol" }>
  > {
  direction: "sent" | "received";
  action?: string;
  messageId?: string;
  body?: unknown;
}

export interface SessionStatusEvent
  extends ChargingPointSimulatorEventBase<
    "session.status",
    Extract<ChargingPointSimulatorResourceRef, { scope: "session" }>
  > {
  previousStatus: ChargingPointSimulatorSessionStatus | null;
  currentStatus: ChargingPointSimulatorSessionStatus;
  attempt?: number;
  reason?: SessionOfflineReason;
}

export type ChargingPointSimulatorEventMap = {
  "chargingPointSimulator.status": ChargingPointSimulatorStatusEvent;
  "session.status": SessionStatusEvent;
  "chargingPoint.status": ChargingPointStatusEvent;
  "evse.status": EVSEStatusEvent;
  "connector.status": ConnectorStatusEvent;
  "authorization.status": AuthorizationStatusEvent;
  "transaction.status": TransactionStatusEvent;
  "transaction.meterValue": TransactionMeterValueEvent;
  "protocol.message": ProtocolMessageEvent;
};

export type ChargingPointSimulatorEventType = keyof ChargingPointSimulatorEventMap;
export type ChargingPointSimulatorEvent = ChargingPointSimulatorEventMap[ChargingPointSimulatorEventType];

export interface ChargingPointSimulatorEventBus {
  subscribe<TType extends ChargingPointSimulatorEventType>(
    type: TType,
    listener: (event: ChargingPointSimulatorEventMap[TType]) => void,
  ): () => void;
}

export type ChargingPointSimulatorStartResult =
  | ChargingPointSimulatorHeartbeatStartedResult
  | ChargingPointSimulatorStartingStartResult;

export interface ChargingPointSimulatorHeartbeatStartedResult {
  chargingPointId: string;
  chargingPointSimulatorStatus: "running";
  bootStatus: "Accepted";
}

export interface ChargingPointSimulatorStartingStartResult {
  chargingPointId: string;
  chargingPointSimulatorStatus: "starting";
  bootStatus: "Pending";
  retryAfterSec: number;
}

export interface ChargingPointSimulatorStopResult {
  chargingPointId: string;
  chargingPointSimulatorStatus: "stopped";
}

export interface ChargingPointSimulatorRejectedOperationResult {
  status: "rejected";
  reason: string;
  authorizationStatus?: string;
}

export interface ChargingPointSimulatorFailedOperationResult {
  status: "failed";
  errorCode: string;
  errorMessage: string;
  shouldReconnect: boolean;
}

export type ChargingPointSimulatorTransactionStartResult =
  | {
      status: "accepted";
      transactionId: string;
    }
  | ChargingPointSimulatorRejectedOperationResult;

export type ChargingPointSimulatorMeterValueResult =
  | {
      status: "accepted";
      transactionId: string;
      meterWh: number;
      sampledAt: Date;
    }
  | ChargingPointSimulatorFailedOperationResult;

export type ChargingPointSimulatorStopTransactionResult =
  | {
      status: "accepted";
      transactionId: string;
      meterStopWh: number;
      stoppedAt: Date;
    }
  | ChargingPointSimulatorFailedOperationResult;

export interface ChargingPointSimulatorConnectorActionInput {
  evseId: number;
  connectorId: number;
}

export interface ChargingPointSimulatorConnectorActionResult {
  chargingPointId: string;
  evseId: number;
  connectorId: number;
  plugState: "plugged" | "unplugged";
  vehiclePresence: "detected" | "absent";
  connectorStatus: ConnectorStatus;
}

export interface ChargingPointSimulatorAuthorizeInput {
  evseId: number;
  connectorId: number;
  idTag: string;
}

export type ChargingPointSimulatorAuthorizeResult =
  | {
      status: "accepted";
    }
  | ChargingPointSimulatorRejectedOperationResult
  | ChargingPointSimulatorFailedOperationResult;

export interface ChargingPointSimulatorStartTransactionInput {
  evseId: number;
  connectorId: number;
  idTag: string;
  meterStartWh?: number;
  reservationId?: number;
}

export interface ChargingPointSimulatorMeterValueInput {
  transactionId: string;
  meterWh: number;
  sampledAt?: Date;
}

export interface ChargingPointSimulatorStopTransactionInput {
  transactionId: string;
  reason: TransactionStopReason;
  meterStopWh?: number;
  stoppedAt?: Date;
  idTag?: string;
}

export interface ChargingPointSimulator {
  readonly id: string;
  readonly protocol: ProtocolVersion;
  readonly events: ChargingPointSimulatorEventBus;
  start(): Promise<ChargingPointSimulatorStartResult>;
  stop(): Promise<ChargingPointSimulatorStopResult>;
  dispose(): Promise<void>;
  plug(input: ChargingPointSimulatorConnectorActionInput): Promise<ChargingPointSimulatorConnectorActionResult>;
  unplug(input: ChargingPointSimulatorConnectorActionInput): Promise<ChargingPointSimulatorConnectorActionResult>;
  authorize(input: ChargingPointSimulatorAuthorizeInput): Promise<ChargingPointSimulatorAuthorizeResult>;
  startTransaction(input: ChargingPointSimulatorStartTransactionInput): Promise<ChargingPointSimulatorTransactionStartResult>;
  reportMeterValue(input: ChargingPointSimulatorMeterValueInput): Promise<ChargingPointSimulatorMeterValueResult>;
  stopTransaction(input: ChargingPointSimulatorStopTransactionInput): Promise<ChargingPointSimulatorStopTransactionResult>;
}

export type Ocpp16ChargingPointSimulatorOptions = {
  protocol: "OCPP16J";
  id: string;
  centralSystemUrl: string;
  chargingPoint: ChargingPoint | ChargingPointOptions;
  configurationCatalog?: Ocpp16ConfigurationCatalogInput;
};

export type UnsupportedChargingPointSimulatorOptions = {
  protocol: "OCPP201";
  id: string;
  centralSystemUrl: string;
};

export type ChargingPointSimulatorOptions = Ocpp16ChargingPointSimulatorOptions | UnsupportedChargingPointSimulatorOptions;
