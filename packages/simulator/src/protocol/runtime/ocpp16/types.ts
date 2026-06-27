import type {
  AuthorizationSource,
  AuthorizationStatus,
  AuthorizationGrant,
  ChargingPoint,
  ChargingPointOptions,
  ChargingPointStatus,
  ConnectorStatus,
  EVSE,
  EVSEStatus,
  Transaction,
  TransactionState,
  TransactionStopReason,
} from "../../../model";
import type { ISession } from "../../session/types";
import type { Ocpp16ConfigurationCatalogInput } from "./ConfigurationStore/index";
import type { ConfigurationStore } from "./ConfigurationStore";
import type { OfflineTransactionOutbox } from "./OfflineTransactionOutbox";

export type Ocpp16RegistrationStatus = "Accepted" | "Pending" | "Rejected";
export type Ocpp16AuthorizationStatus =
  | "Accepted"
  | "Blocked"
  | "Expired"
  | "Invalid"
  | "ConcurrentTx";
export type Ocpp16ConnectorStatus =
  | "Available"
  | "Preparing"
  | "Charging"
  | "SuspendedEVSE"
  | "SuspendedEV"
  | "Finishing"
  | "Reserved"
  | "Unavailable"
  | "Faulted";
export type Ocpp16ErrorCode =
  | "ConnectorLockFailure"
  | "EVCommunicationError"
  | "GroundFailure"
  | "HighTemperature"
  | "InternalError"
  | "LocalListConflict"
  | "NoError"
  | "OtherError"
  | "OverCurrentFailure"
  | "PowerMeterFailure"
  | "PowerSwitchFailure"
  | "ReaderFailure"
  | "ResetFailure"
  | "UnderVoltage"
  | "OverVoltage"
  | "WeakSignal";

export interface Ocpp16RuntimeOptions {
  session: ISession;
  chargingPoint: ChargingPoint | ChargingPointOptions;
  configurationCatalog?: Ocpp16ConfigurationCatalogInput;
  clock?: () => Date;
  protocolClock?: {
    now(): Date;
    isSynced(): boolean;
    sync(currentTime: Date): void;
  };
  idGenerator?: () => string;
  offlineTransactionOutbox?: OfflineTransactionOutbox;
  heartbeatUnstableThreshold?: number;
  heartbeatReconnectThreshold?: number;
  heartbeatTimeDriftThresholdMs?: number | null;
}

export interface Ocpp16RuntimeSnapshot {
  chargingPoint: {
    status: ChargingPointStatus;
    availability: ChargingPoint["availability"];
    evses: EVSE[];
  };
  configurationStore: ConfigurationStore;
  authorizationGrants: AuthorizationGrant[];
  transactions: Transaction[];
  heartbeatTimerActive: boolean;
}

export interface Ocpp16BootResult {
  status: Ocpp16RegistrationStatus;
  currentTime: Date;
  interval: number;
}

export type Ocpp16RuntimeResourceRef =
  | { scope: "chargingPoint" }
  | { scope: "evse"; evseId: number }
  | { scope: "connector"; evseId: number; connectorId: number }
  | { scope: "authorization"; idTag: string; evseId?: number; connectorId?: number }
  | {
      scope: "transaction";
      evseId: number;
      connectorId: number;
      transactionId?: string;
    };

export interface Ocpp16RuntimeEventBase<
  TType extends string,
  TResource extends Ocpp16RuntimeResourceRef,
> {
  type: TType;
  resource: TResource;
  occurredAt: Date;
}

export interface Ocpp16RuntimeChargingPointStatusEvent
  extends Ocpp16RuntimeEventBase<
    "chargingPoint.status",
    Extract<Ocpp16RuntimeResourceRef, { scope: "chargingPoint" }>
  > {
  previousStatus: ChargingPointStatus | null;
  currentStatus: ChargingPointStatus;
  error?: { code: string; message: string };
}

export interface Ocpp16RuntimeEvseStatusEvent
  extends Ocpp16RuntimeEventBase<
    "evse.status",
    Extract<Ocpp16RuntimeResourceRef, { scope: "evse" }>
  > {
  previousStatus: EVSEStatus | null;
  currentStatus: EVSEStatus;
  error?: { code: string; message: string };
}

export interface Ocpp16RuntimeConnectorStatusEvent
  extends Ocpp16RuntimeEventBase<
    "connector.status",
    Extract<Ocpp16RuntimeResourceRef, { scope: "connector" }>
  > {
  previousStatus: ConnectorStatus | null;
  currentStatus: ConnectorStatus;
  error?: { code: string; message: string };
}

export interface Ocpp16RuntimeAuthorizationStatusEvent
  extends Ocpp16RuntimeEventBase<
    "authorization.status",
    Extract<Ocpp16RuntimeResourceRef, { scope: "authorization" }>
  > {
  status: AuthorizationStatus;
  source: AuthorizationSource;
  protocolStatus?: string;
}

export type Ocpp16RuntimeTransactionStatus =
  | TransactionState
  | "rejected"
  | "failed";

export interface Ocpp16RuntimeTransactionStatusEvent
  extends Ocpp16RuntimeEventBase<
    "transaction.status",
    Extract<Ocpp16RuntimeResourceRef, { scope: "transaction" }>
  > {
  previousStatus: Ocpp16RuntimeTransactionStatus | null;
  currentStatus: Ocpp16RuntimeTransactionStatus;
  reason?: string;
  error?: { code: string; message: string };
}

export interface Ocpp16RuntimeTransactionMeterValueEvent
  extends Ocpp16RuntimeEventBase<
    "transaction.meterValue",
    Extract<Ocpp16RuntimeResourceRef, { scope: "transaction" }>
  > {
  meterWh: number;
  sampledAt: Date;
}

export type Ocpp16RuntimeEventMap = {
  "chargingPoint.status": Ocpp16RuntimeChargingPointStatusEvent;
  "evse.status": Ocpp16RuntimeEvseStatusEvent;
  "connector.status": Ocpp16RuntimeConnectorStatusEvent;
  "authorization.status": Ocpp16RuntimeAuthorizationStatusEvent;
  "transaction.status": Ocpp16RuntimeTransactionStatusEvent;
  "transaction.meterValue": Ocpp16RuntimeTransactionMeterValueEvent;
};

export type Ocpp16RuntimeEventType = keyof Ocpp16RuntimeEventMap;
export type Ocpp16RuntimeEvent =
  Ocpp16RuntimeEventMap[Ocpp16RuntimeEventType];
export type Ocpp16RuntimeEventListener = (
  event: Ocpp16RuntimeEvent,
) => void;
export type Ocpp16RuntimeEvents = {
  runtimeEvent: Ocpp16RuntimeEventListener;
};

export type PlatformCommunicationStatus =
  | "unknown"
  | "online"
  | "unstable"
  | "offline";

export type Ocpp16HeartbeatTimeStatus =
  | "valid"
  | "missing"
  | "invalid"
  | "drifted";

export type Ocpp16HeartbeatResult =
  | {
      status: "Accepted";
      sentAt: Date;
      receivedAt: Date;
      currentTime: Date | null;
      timeStatus: Ocpp16HeartbeatTimeStatus;
      timeIssue: string | null;
      consecutiveFailures: 0;
      platformCommunicationStatus: "online";
      shouldReconnect: false;
    }
  | {
      status: "Failed";
      sentAt: Date;
      failedAt: Date;
      currentTime: null;
      timeStatus: null;
      timeIssue: null;
      errorCode: string;
      errorMessage: string;
      consecutiveFailures: number;
      platformCommunicationStatus: PlatformCommunicationStatus;
      shouldReconnect: boolean;
    };

export interface Ocpp16HeartbeatLoopOptions {
  onHeartbeat?(result: Ocpp16HeartbeatResult): void;
  onReconnectRequired?(
    result: Extract<Ocpp16HeartbeatResult, { status: "Failed" }>,
  ): void;
}

export type Ocpp16StatusNotificationOutcome = "Accepted" | "Failed";

export type Ocpp16StatusNotificationResult =
  | {
      outcome: "Accepted";
      connectorId: number;
      connectorStatus: Ocpp16ConnectorStatus;
      sentAt: Date;
      receivedAt: Date;
      unexpectedResponseFields: string[];
      consecutiveFailures: 0;
      platformCommunicationStatus: "online";
      shouldReconnect: false;
    }
  | {
      outcome: "Failed";
      connectorId: number;
      connectorStatus: Ocpp16ConnectorStatus;
      sentAt: Date;
      failedAt: Date;
      errorCode: string;
      errorMessage: string;
      consecutiveFailures: number;
      platformCommunicationStatus: PlatformCommunicationStatus;
      shouldReconnect: boolean;
    };

export interface Ocpp16ReportConnectorStatusInput {
  connectorId: number;
}

export interface Ocpp16AuthorizeInput {
  connectorId: number;
  idTag: string;
}

export type Ocpp16AuthorizeOutcome = "Accepted" | "Rejected" | "Failed";

export type Ocpp16AuthorizeResult =
  | {
      outcome: "Accepted";
      idTag: string;
      authorizationStatus: "Accepted";
      expiryDate: Date | null;
      parentIdTag: string | null;
      source: AuthorizationSource;
      sentAt?: Date;
      receivedAt: Date;
      consecutiveFailures: 0;
      platformCommunicationStatus: "online" | "offline";
      shouldReconnect: false;
    }
  | {
      outcome: "Rejected";
      idTag: string;
      authorizationStatus: Exclude<Ocpp16AuthorizationStatus, "Accepted">;
      expiryDate: Date | null;
      parentIdTag: string | null;
      source: AuthorizationSource;
      reason?: string;
      sentAt?: Date;
      receivedAt: Date;
      consecutiveFailures: 0;
      platformCommunicationStatus: "online" | "offline";
      shouldReconnect: false;
    }
  | {
      outcome: "Failed";
      idTag: string;
      sentAt: Date;
      failedAt: Date;
      errorCode: string;
      errorMessage: string;
      consecutiveFailures: number;
      platformCommunicationStatus: PlatformCommunicationStatus;
      shouldReconnect: boolean;
    };

export type Ocpp16StartTransactionCallOutcome =
  | "Accepted"
  | "Rejected"
  | "Failed";

export type Ocpp16StartTransactionCallResult =
  | {
      outcome: "Accepted";
      connectorId: number;
      idTag: string;
      ocppTransactionId: number;
      authorizationStatus: "Accepted";
      expiryDate: Date | null;
      parentIdTag: string | null;
      sentAt: Date;
      receivedAt: Date;
      consecutiveFailures: 0;
      platformCommunicationStatus: "online";
      shouldReconnect: false;
    }
  | {
      outcome: "Rejected";
      connectorId: number;
      idTag: string;
      ocppTransactionId: number;
      authorizationStatus: Exclude<Ocpp16AuthorizationStatus, "Accepted">;
      expiryDate: Date | null;
      parentIdTag: string | null;
      sentAt: Date;
      receivedAt: Date;
      consecutiveFailures: 0;
      platformCommunicationStatus: "online";
      shouldReconnect: false;
    }
  | {
      outcome: "Failed";
      connectorId: number;
      idTag: string;
      sentAt: Date;
      failedAt: Date;
      errorCode: string;
      errorMessage: string;
      consecutiveFailures: number;
      platformCommunicationStatus: PlatformCommunicationStatus;
      shouldReconnect: boolean;
    };

export type Ocpp16MeterValuesOutcome = "Accepted" | "Failed";

export type Ocpp16MeterValuesResult =
  | {
      outcome: "Accepted";
      transactionId: string;
      connectorId: number;
      ocppTransactionId: number | null;
      meterWh: number;
      sampledAt: Date;
      sentAt: Date;
      receivedAt: Date;
      unexpectedResponseFields: string[];
      consecutiveFailures: 0;
      platformCommunicationStatus: "online" | "offline";
      shouldReconnect: false;
    }
  | {
      outcome: "Failed";
      transactionId: string;
      connectorId: number;
      ocppTransactionId: number;
      meterWh: number;
      sampledAt: Date;
      sentAt: Date;
      failedAt: Date;
      errorCode: string;
      errorMessage: string;
      consecutiveFailures: number;
      platformCommunicationStatus: PlatformCommunicationStatus;
      shouldReconnect: boolean;
    };

export type Ocpp16StopTransactionOutcome = "Accepted" | "Failed";

export type Ocpp16StopTransactionResult =
  | {
      outcome: "Accepted";
      transactionId: string;
      ocppTransactionId: number | null;
      meterStop: number;
      stoppedAt: Date;
      sentAt: Date;
      receivedAt: Date;
      idTagInfoStatus: Ocpp16AuthorizationStatus | null;
      responseIssue: string | null;
      unexpectedResponseFields: string[];
      consecutiveFailures: 0;
      platformCommunicationStatus: "online" | "offline";
      shouldReconnect: false;
      statusNotificationResults: Ocpp16StatusNotificationResult[];
    }
  | {
      outcome: "Failed";
      transactionId: string;
      ocppTransactionId: number;
      meterStop: number;
      stoppedAt: Date;
      sentAt: Date;
      failedAt: Date;
      errorCode: string;
      errorMessage: string;
      consecutiveFailures: number;
      platformCommunicationStatus: PlatformCommunicationStatus;
      shouldReconnect: boolean;
      statusNotificationResults: Ocpp16StatusNotificationResult[];
    };

export interface Ocpp16StartTransactionInput {
  connectorId: number;
  idTag: string;
  meterStartWh: number;
  reservationId?: number;
  startedAt?: Date;
}

export interface Ocpp16MeterValueInput {
  transactionId: string;
  meterWh: number;
  sampledAt?: Date;
}

export interface Ocpp16StopTransactionInput {
  transactionId?: string;
  ocppTransactionId?: number;
  reason: TransactionStopReason;
  meterStopWh?: number;
  stoppedAt?: Date;
  idTag?: string;
}

export type Ocpp16TransactionStartResult =
  | {
      status: "Accepted";
      transactionId: string;
      authorizationSource?: AuthorizationSource;
      ocppTransactionId?: number;
      authorizeResult?: Ocpp16AuthorizeResult;
      startTransactionResult?: Extract<
        Ocpp16StartTransactionCallResult,
        { outcome: "Accepted" }
      >;
      statusNotificationResults: Ocpp16StatusNotificationResult[];
    }
  | {
      status: "Rejected";
      reason: string;
      authorizationStatus?: Ocpp16AuthorizationStatus;
      authorizeResult?: Ocpp16AuthorizeResult;
      startTransactionResult?: Ocpp16StartTransactionCallResult;
      statusNotificationResults: Ocpp16StatusNotificationResult[];
    };

export type Ocpp16OperationResult =
  | {
      status: "Accepted";
      statusNotificationResults?: Ocpp16StatusNotificationResult[];
    }
  | {
      status: "Rejected";
      reason: string;
      statusNotificationResults?: Ocpp16StatusNotificationResult[];
    };

export interface Ocpp16ConnectorActionInput {
  evseId: number;
  connectorId: number;
}

export interface Ocpp16ConnectorActionResult {
  evseId: number;
  connectorId: number;
  ocppConnectorId: number;
  plugState: "plugged" | "unplugged";
  vehiclePresence: "detected" | "absent";
  connectorStatus: ConnectorStatus;
}
