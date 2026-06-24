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

export type SimulatorProtocol = "OCPP16J" | "OCPP201";
export type SimulatorOperationStatus = "accepted" | "rejected" | "failed";

export type SimulatorStatus = "starting" | "running" | "stopped";
export type SimulatorSessionStatus = "online" | "reconnecting" | "offline";
export type SimulatorAuthorizationStatus = AuthorizationStatus;
export type SimulatorAuthorizationSource = AuthorizationSource;
export type SimulatorTransactionStatus =
  | TransactionState
  | "rejected"
  | "failed";

export interface SimulatorEventError {
  code: string;
  message: string;
}

export type SimulatorResourceRef =
  | { scope: "simulator" }
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

export interface SimulatorEventBase<
  TType extends string,
  TResource extends SimulatorResourceRef,
> {
  id: string;
  sequence: number;
  type: TType;
  simulatorId: string;
  protocol: ProtocolVersion;
  resource: TResource;
  occurredAt: string;
}

export interface SimulatorStatusEvent
  extends SimulatorEventBase<
    "simulator.status",
    Extract<SimulatorResourceRef, { scope: "simulator" }>
  > {
  previousStatus: SimulatorStatus | null;
  currentStatus: SimulatorStatus;
  error?: SimulatorEventError;
}

export interface ChargingPointStatusEvent
  extends SimulatorEventBase<
    "chargingPoint.status",
    Extract<SimulatorResourceRef, { scope: "chargingPoint" }>
  > {
  previousStatus: ChargingPointStatus | null;
  currentStatus: ChargingPointStatus;
  error?: SimulatorEventError;
}

export interface EVSEStatusEvent
  extends SimulatorEventBase<
    "evse.status",
    Extract<SimulatorResourceRef, { scope: "evse" }>
  > {
  previousStatus: EVSEStatus | null;
  currentStatus: EVSEStatus;
  error?: SimulatorEventError;
}

export interface ConnectorStatusEvent
  extends SimulatorEventBase<
    "connector.status",
    Extract<SimulatorResourceRef, { scope: "connector" }>
  > {
  previousStatus: ConnectorStatus | null;
  currentStatus: ConnectorStatus;
  error?: SimulatorEventError;
}

export interface AuthorizationStatusEvent
  extends SimulatorEventBase<
    "authorization.status",
    Extract<SimulatorResourceRef, { scope: "authorization" }>
  > {
  status: SimulatorAuthorizationStatus;
  source: SimulatorAuthorizationSource;
  protocolStatus?: string;
}

export interface TransactionStatusEvent
  extends SimulatorEventBase<
    "transaction.status",
    Extract<SimulatorResourceRef, { scope: "transaction" }>
  > {
  previousStatus: SimulatorTransactionStatus | null;
  currentStatus: SimulatorTransactionStatus;
  reason?: string;
  error?: SimulatorEventError;
}

export interface TransactionMeterValueEvent
  extends SimulatorEventBase<
    "transaction.meterValue",
    Extract<SimulatorResourceRef, { scope: "transaction" }>
  > {
  meterWh: number;
  sampledAt: string;
}

export interface ProtocolMessageEvent
  extends SimulatorEventBase<
    "protocol.message",
    Extract<SimulatorResourceRef, { scope: "protocol" }>
  > {
  direction: "sent" | "received";
  action?: string;
  messageId?: string;
  body?: unknown;
}

export interface SessionStatusEvent
  extends SimulatorEventBase<
    "session.status",
    Extract<SimulatorResourceRef, { scope: "session" }>
  > {
  previousStatus: SimulatorSessionStatus | null;
  currentStatus: SimulatorSessionStatus;
  attempt?: number;
  reason?: SessionOfflineReason;
}

export type SimulatorEventMap = {
  "simulator.status": SimulatorStatusEvent;
  "session.status": SessionStatusEvent;
  "chargingPoint.status": ChargingPointStatusEvent;
  "evse.status": EVSEStatusEvent;
  "connector.status": ConnectorStatusEvent;
  "authorization.status": AuthorizationStatusEvent;
  "transaction.status": TransactionStatusEvent;
  "transaction.meterValue": TransactionMeterValueEvent;
  "protocol.message": ProtocolMessageEvent;
};

export type SimulatorEventType = keyof SimulatorEventMap;
export type SimulatorEvent = SimulatorEventMap[SimulatorEventType];

export interface SimulatorEventBus {
  subscribe<TType extends SimulatorEventType>(
    type: TType,
    listener: (event: SimulatorEventMap[TType]) => void,
  ): () => void;
}

export type SimulatorStartResult =
  | SimulatorHeartbeatStartedResult
  | SimulatorStartingStartResult;

export interface SimulatorHeartbeatStartedResult {
  chargingPointId: string;
  simulatorStatus: "running";
  bootStatus: "Accepted";
}

export interface SimulatorStartingStartResult {
  chargingPointId: string;
  simulatorStatus: "starting";
  bootStatus: "Pending";
  retryAfterSec: number;
}

export interface SimulatorStopResult {
  chargingPointId: string;
  simulatorStatus: "stopped";
}

export interface SimulatorRejectedOperationResult {
  status: "rejected";
  reason: string;
  authorizationStatus?: string;
}

export interface SimulatorFailedOperationResult {
  status: "failed";
  errorCode: string;
  errorMessage: string;
  shouldReconnect: boolean;
}

export type SimulatorTransactionStartResult =
  | {
      status: "accepted";
      transactionId: string;
    }
  | SimulatorRejectedOperationResult;

export type SimulatorMeterValueResult =
  | {
      status: "accepted";
      transactionId: string;
      meterWh: number;
      sampledAt: Date;
    }
  | SimulatorFailedOperationResult;

export type SimulatorStopTransactionResult =
  | {
      status: "accepted";
      transactionId: string;
      meterStopWh: number;
      stoppedAt: Date;
    }
  | SimulatorFailedOperationResult;

export interface SimulatorConnectorActionInput {
  evseId: number;
  connectorId: number;
}

export interface SimulatorConnectorActionResult {
  chargingPointId: string;
  evseId: number;
  connectorId: number;
  plugState: "plugged" | "unplugged";
  vehiclePresence: "detected" | "absent";
  connectorStatus: ConnectorStatus;
}

export interface SimulatorAuthorizeInput {
  evseId: number;
  connectorId: number;
  idTag: string;
}

export type SimulatorAuthorizeResult =
  | {
      status: "accepted";
    }
  | SimulatorRejectedOperationResult
  | SimulatorFailedOperationResult;

export interface SimulatorStartTransactionInput {
  evseId: number;
  connectorId: number;
  idTag: string;
  meterStartWh?: number;
  reservationId?: number;
}

export interface SimulatorMeterValueInput {
  transactionId: string;
  meterWh: number;
  sampledAt?: Date;
}

export interface SimulatorStopTransactionInput {
  transactionId: string;
  reason: TransactionStopReason;
  meterStopWh?: number;
  stoppedAt?: Date;
  idTag?: string;
}

export interface Simulator {
  readonly id: string;
  readonly protocol: ProtocolVersion;
  readonly events: SimulatorEventBus;
  start(): Promise<SimulatorStartResult>;
  stop(): Promise<SimulatorStopResult>;
  dispose(): Promise<void>;
  plug(input: SimulatorConnectorActionInput): Promise<SimulatorConnectorActionResult>;
  unplug(input: SimulatorConnectorActionInput): Promise<SimulatorConnectorActionResult>;
  authorize(input: SimulatorAuthorizeInput): Promise<SimulatorAuthorizeResult>;
  startTransaction(input: SimulatorStartTransactionInput): Promise<SimulatorTransactionStartResult>;
  reportMeterValue(input: SimulatorMeterValueInput): Promise<SimulatorMeterValueResult>;
  stopTransaction(input: SimulatorStopTransactionInput): Promise<SimulatorStopTransactionResult>;
}

export type Ocpp16SimulatorOptions = {
  protocol: "OCPP16J";
  id: string;
  centralSystemUrl: string;
  chargingPoint: ChargingPoint | ChargingPointOptions;
  configurationCatalog?: Ocpp16ConfigurationCatalogInput;
};

export type UnsupportedSimulatorOptions = {
  protocol: "OCPP201";
  id: string;
  centralSystemUrl: string;
};

export type SimulatorOptions = Ocpp16SimulatorOptions | UnsupportedSimulatorOptions;
