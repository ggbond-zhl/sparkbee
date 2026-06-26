import type {
  Ocpp16Runtime,
  Ocpp16RuntimeOptions,
} from "../../protocol/runtime";
import type { ISession } from "../../protocol/session/types";
import type {
  ChargingPointSimulatorAuthorizationSource,
  ChargingPointSimulatorAuthorizationStatus,
  ChargingPointSimulatorAuthorizeResult,
  ChargingPointSimulatorConnectorActionResult,
  ChargingPointSimulatorTransactionStartResult,
} from "../types";

export type Ocpp16ChargingPointSimulatorDependencies = {
  session?: ISession;
  ocpp16Runtime?: Ocpp16Runtime;
  configurationCatalog?: Ocpp16RuntimeOptions["configurationCatalog"];
  clock?: () => Date;
  idGenerator?: () => string;
};

export type Ocpp16ChargingPointSimulatorConnectorActionResult = Omit<
  ChargingPointSimulatorConnectorActionResult,
  "chargingPointId"
>;

export type Ocpp16ChargingPointSimulatorAuthorizationResult = {
  status: ChargingPointSimulatorAuthorizationStatus;
  source: ChargingPointSimulatorAuthorizationSource;
  protocolStatus?: string;
};

export type Ocpp16ChargingPointSimulatorAuthorizeResult =
  ChargingPointSimulatorAuthorizeResult & {
    authorization?: Ocpp16ChargingPointSimulatorAuthorizationResult;
  };

export type Ocpp16ChargingPointSimulatorTransactionStartResult =
  ChargingPointSimulatorTransactionStartResult & {
    authorization?: Ocpp16ChargingPointSimulatorAuthorizationResult;
  };
