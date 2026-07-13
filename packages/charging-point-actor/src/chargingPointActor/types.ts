import type {
  AuthorizationSource,
  AuthorizationStatus,
  Availability,
  ChargingPoint,
  ChargingPointOptions,
  ChargingPointStatus,
  ConnectorStatus,
  EVSEStatus,
  TransactionState,
  TransactionStopReason,
} from "../model";
import type { Ocpp16ConfigurationCatalogInput } from "../protocol/runtime/ocpp16/ConfigurationStore";
import type { SessionOfflineReason } from "../protocol/session/types";
import type { ProtocolVersion } from "../shared/types";

export type ChargingPointActorProtocol = "OCPP16J";
export type ChargingPointActorOperationStatus = "accepted" | "rejected" | "failed";
export type ChargingPointActorRuntimeLogLevel = "info" | "warn" | "error";

export type ChargingPointActorStatus = "starting" | "running" | "stopped";
export type ChargingPointActorSessionStatus = "online" | "reconnecting" | "offline";
export type ChargingPointActorAuthorizationStatus = AuthorizationStatus;
export type ChargingPointActorAuthorizationSource = AuthorizationSource;
export type ChargingPointActorTransactionStatus =
  | TransactionState
  | "rejected"
  | "failed";

export interface ChargingPointActorEventError {
  code: string;
  message: string;
  cause?: ChargingPointActorEventErrorCause;
}

export interface ChargingPointActorEventErrorCause {
  name?: string;
  code?: string;
  message?: string;
  cause?: ChargingPointActorEventErrorCause;
}

export type ChargingPointActorResourceRef =
  | { scope: "chargingPoint" }
  | { scope: "session" }
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

export interface ChargingPointActorEventBase<
  TType extends string,
  TResource extends ChargingPointActorResourceRef,
> {
  id: string;
  sequence: number;
  type: TType;
  chargingPointId: string;
  protocol: ProtocolVersion;
  resource: TResource;
  occurredAt: string;
}

export interface ChargingPointLifecycleEvent
  extends ChargingPointActorEventBase<
    "chargingPoint.lifecycle",
    Extract<ChargingPointActorResourceRef, { scope: "chargingPoint" }>
  > {
  previousStatus: ChargingPointActorStatus | null;
  currentStatus: ChargingPointActorStatus;
  error?: ChargingPointActorEventError;
}

export interface ChargingPointBootEvent
  extends ChargingPointActorEventBase<
    "chargingPoint.boot",
    Extract<ChargingPointActorResourceRef, { scope: "chargingPoint" }>
  > {
  status: "Accepted" | "Pending" | "Rejected";
  retryAfterSec?: number;
}

export interface ChargingPointStatusEvent
  extends ChargingPointActorEventBase<
    "chargingPoint.status",
    Extract<ChargingPointActorResourceRef, { scope: "chargingPoint" }>
  > {
  previousStatus: ChargingPointStatus | null;
  currentStatus: ChargingPointStatus;
  error?: ChargingPointActorEventError;
}

export interface ChargingPointAvailabilityEvent
  extends ChargingPointActorEventBase<
    "chargingPoint.availability",
    Extract<ChargingPointActorResourceRef, { scope: "chargingPoint" }>
  > {
  previousAvailability: Availability | null;
  currentAvailability: Availability;
  requestedAvailability?: Availability;
}

export interface EVSEStatusEvent
  extends ChargingPointActorEventBase<
    "evse.status",
    Extract<ChargingPointActorResourceRef, { scope: "evse" }>
  > {
  previousStatus: EVSEStatus | null;
  currentStatus: EVSEStatus;
  error?: ChargingPointActorEventError;
}

export interface ConnectorAvailabilityEvent
  extends ChargingPointActorEventBase<
    "connector.availability",
    Extract<ChargingPointActorResourceRef, { scope: "connector" }>
  > {
  previousAvailability: Availability | null;
  currentAvailability: Availability;
  requestedAvailability?: Availability;
}

export interface ConnectorStatusEvent
  extends ChargingPointActorEventBase<
    "connector.status",
    Extract<ChargingPointActorResourceRef, { scope: "connector" }>
  > {
  previousStatus: ConnectorStatus | null;
  currentStatus: ConnectorStatus;
  error?: ChargingPointActorEventError;
}

export interface AuthorizationStatusEvent
  extends ChargingPointActorEventBase<
    "authorization.status",
    Extract<ChargingPointActorResourceRef, { scope: "authorization" }>
  > {
  status: ChargingPointActorAuthorizationStatus;
  source: ChargingPointActorAuthorizationSource;
  protocolStatus?: string;
}

export interface TransactionStatusEvent
  extends ChargingPointActorEventBase<
    "transaction.status",
    Extract<ChargingPointActorResourceRef, { scope: "transaction" }>
  > {
  previousStatus: ChargingPointActorTransactionStatus | null;
  currentStatus: ChargingPointActorTransactionStatus;
  reason?: string;
  error?: ChargingPointActorEventError;
}

export interface TransactionMeterValueEvent
  extends ChargingPointActorEventBase<
    "transaction.meterValue",
    Extract<ChargingPointActorResourceRef, { scope: "transaction" }>
  > {
  meterWh: number;
  powerW: number;
  currentA: number;
  voltageV: number;
  sampledAt: string;
}

export interface ProtocolMessageEvent
  extends ChargingPointActorEventBase<
    "protocol.message",
    Extract<ChargingPointActorResourceRef, { scope: "protocol" }>
  > {
  direction: "sent" | "received";
  action?: string;
  messageId?: string;
  body?: unknown;
}

export interface SessionStatusEvent
  extends ChargingPointActorEventBase<
    "session.status",
    Extract<ChargingPointActorResourceRef, { scope: "session" }>
  > {
  previousStatus: ChargingPointActorSessionStatus | null;
  currentStatus: ChargingPointActorSessionStatus;
  connectionUrl: string;
  attempt?: number;
  reason?: SessionOfflineReason;
  error?: ChargingPointActorEventError;
}

export type ChargingPointActorEventMap = {
  "chargingPoint.lifecycle": ChargingPointLifecycleEvent;
  "chargingPoint.boot": ChargingPointBootEvent;
  "session.status": SessionStatusEvent;
  "chargingPoint.availability": ChargingPointAvailabilityEvent;
  "chargingPoint.status": ChargingPointStatusEvent;
  "evse.status": EVSEStatusEvent;
  "connector.availability": ConnectorAvailabilityEvent;
  "connector.status": ConnectorStatusEvent;
  "authorization.status": AuthorizationStatusEvent;
  "transaction.status": TransactionStatusEvent;
  "transaction.meterValue": TransactionMeterValueEvent;
  "protocol.message": ProtocolMessageEvent;
};

export type ChargingPointActorEventType = keyof ChargingPointActorEventMap;
export type ChargingPointActorEvent = ChargingPointActorEventMap[ChargingPointActorEventType];

export interface ChargingPointActorEventBus {
  subscribe(
    listener: (event: ChargingPointActorEvent) => void | Promise<void>,
  ): () => void;
}

export interface ChargingPointActorRuntimeLogRecord {
  id: string;
  sequence: number;
  chargingPointId: string;
  occurredAt: string;
  level: ChargingPointActorRuntimeLogLevel;
  message: string;
  code?: string;
  context?: Record<string, unknown>;
}

export interface ChargingPointActorRuntimeLogSink {
  write(record: ChargingPointActorRuntimeLogRecord): void | Promise<void>;
}

export type ChargingPointActorStartResult =
  | ChargingPointActorHeartbeatStartedResult
  | ChargingPointActorStartingStartResult;

export interface ChargingPointActorHeartbeatStartedResult {
  chargingPointId: string;
  chargingPointActorStatus: "running";
  bootStatus: "Accepted";
}

export interface ChargingPointActorStartingStartResult {
  chargingPointId: string;
  chargingPointActorStatus: "starting";
  bootStatus: "Pending";
  retryAfterSec: number;
}

export interface ChargingPointActorStopResult {
  chargingPointId: string;
  chargingPointActorStatus: "stopped";
}

export interface ChargingPointActorRejectedOperationResult {
  status: "rejected";
  reason: string;
  authorizationStatus?: string;
}

export interface ChargingPointActorFailedOperationResult {
  status: "failed";
  errorCode: string;
  errorMessage: string;
  shouldReconnect: boolean;
}

export type ChargingPointActorTransactionStartResult =
  | {
      status: "accepted";
      transactionId: string;
    }
  | ChargingPointActorRejectedOperationResult;

export type ChargingPointActorMeterValueResult =
  | {
      status: "accepted";
      transactionId: string;
      meterWh: number;
      powerW: number;
      currentA: number;
      voltageV: number;
      sampledAt: Date;
    }
  | ChargingPointActorFailedOperationResult;

export type ChargingPointActorStopTransactionResult =
  | {
      status: "accepted";
      transactionId: string;
      meterStopWh: number;
      stoppedAt: Date;
    }
  | ChargingPointActorFailedOperationResult;

export interface ChargingPointActorConnectorActionInput {
  evseId: number;
  connectorId: number;
}

export interface ChargingPointActorConnectorActionResult {
  chargingPointId: string;
  evseId: number;
  connectorId: number;
  plugState: "plugged" | "unplugged";
  vehiclePresence: "detected" | "absent";
  connectorStatus: ConnectorStatus;
}

export interface ChargingPointActorAuthorizeInput {
  evseId: number;
  connectorId: number;
  idTag: string;
}

export type ChargingPointActorAuthorizeResult =
  | {
      status: "accepted";
    }
  | ChargingPointActorRejectedOperationResult
  | ChargingPointActorFailedOperationResult;

export interface ChargingPointActorStartTransactionInput {
  evseId: number;
  connectorId: number;
  idTag: string;
  meterStartWh?: number;
  reservationId?: number;
}

export interface ChargingPointActorMeterValueInput {
  transactionId: string;
  meterWh: number;
  sampledAt?: Date;
}

export interface ChargingPointActorStopTransactionInput {
  transactionId: string;
  reason?: TransactionStopReason;
  meterStopWh?: number;
  stoppedAt?: Date;
  idTag?: string;
}

export interface ChargingPointActor {
  readonly id: string;
  readonly protocol: ProtocolVersion;
  readonly status: ChargingPointActorStatus;
  readonly events: ChargingPointActorEventBus;
  start(): Promise<ChargingPointActorStartResult>;
  stop(): Promise<ChargingPointActorStopResult>;
  dispose(): Promise<void>;
  plug(input: ChargingPointActorConnectorActionInput): Promise<ChargingPointActorConnectorActionResult>;
  unplug(input: ChargingPointActorConnectorActionInput): Promise<ChargingPointActorConnectorActionResult>;
  authorize(input: ChargingPointActorAuthorizeInput): Promise<ChargingPointActorAuthorizeResult>;
  startTransaction(input: ChargingPointActorStartTransactionInput): Promise<ChargingPointActorTransactionStartResult>;
  getTransactionResource(
    transactionId: string,
  ): Extract<ChargingPointActorResourceRef, { scope: "transaction" }> | undefined;
  reportMeterValue(input: ChargingPointActorMeterValueInput): Promise<ChargingPointActorMeterValueResult>;
  stopTransaction(input: ChargingPointActorStopTransactionInput): Promise<ChargingPointActorStopTransactionResult>;
}

export type Ocpp16ChargingPointActorOptions = {
  protocol: "OCPP16J";
  id: string;
  centralSystemUrl: string;
  chargingPoint: ChargingPoint | ChargingPointOptions;
  configurationCatalog?: Ocpp16ConfigurationCatalogInput;
  runtimeLogSink?: ChargingPointActorRuntimeLogSink;
};

export type ChargingPointActorOptions = Ocpp16ChargingPointActorOptions;
