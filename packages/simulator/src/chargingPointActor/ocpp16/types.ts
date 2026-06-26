import type {
  Ocpp16Runtime,
  Ocpp16RuntimeOptions,
} from "../../protocol/runtime";
import type { ISession } from "../../protocol/session/types";
import type {
  ChargingPointActorAuthorizationSource,
  ChargingPointActorAuthorizationStatus,
  ChargingPointActorAuthorizeResult,
  ChargingPointActorConnectorActionResult,
  ChargingPointActorTransactionStartResult,
} from "../types";

export type Ocpp16ChargingPointActorDependencies = {
  session?: ISession;
  ocpp16Runtime?: Ocpp16Runtime;
  configurationCatalog?: Ocpp16RuntimeOptions["configurationCatalog"];
  clock?: () => Date;
  idGenerator?: () => string;
};

export type Ocpp16ChargingPointActorConnectorActionResult = Omit<
  ChargingPointActorConnectorActionResult,
  "chargingPointId"
>;

export type Ocpp16ChargingPointActorAuthorizationResult = {
  status: ChargingPointActorAuthorizationStatus;
  source: ChargingPointActorAuthorizationSource;
  protocolStatus?: string;
};

export type Ocpp16ChargingPointActorAuthorizeResult =
  ChargingPointActorAuthorizeResult & {
    authorization?: Ocpp16ChargingPointActorAuthorizationResult;
  };

export type Ocpp16ChargingPointActorTransactionStartResult =
  ChargingPointActorTransactionStartResult & {
    authorization?: Ocpp16ChargingPointActorAuthorizationResult;
  };
