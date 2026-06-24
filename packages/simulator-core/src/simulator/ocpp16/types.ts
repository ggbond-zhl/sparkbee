import type {
  Ocpp16Runtime,
  Ocpp16RuntimeOptions,
} from "../../protocol/runtime";
import type { ISession } from "../../protocol/session/types";
import type {
  SimulatorAuthorizationSource,
  SimulatorAuthorizationStatus,
  SimulatorAuthorizeResult,
  SimulatorConnectorActionResult,
  SimulatorTransactionStartResult,
} from "../types";

export type Ocpp16SimulatorDependencies = {
  session?: ISession;
  ocpp16Runtime?: Ocpp16Runtime;
  configurationCatalog?: Ocpp16RuntimeOptions["configurationCatalog"];
  clock?: () => Date;
  idGenerator?: () => string;
};

export type Ocpp16SimulatorConnectorActionResult = Omit<
  SimulatorConnectorActionResult,
  "chargingPointId"
>;

export type Ocpp16SimulatorAuthorizationResult = {
  status: SimulatorAuthorizationStatus;
  source: SimulatorAuthorizationSource;
  protocolStatus?: string;
};

export type Ocpp16SimulatorAuthorizeResult =
  SimulatorAuthorizeResult & {
    authorization?: Ocpp16SimulatorAuthorizationResult;
  };

export type Ocpp16SimulatorTransactionStartResult =
  SimulatorTransactionStartResult & {
    authorization?: Ocpp16SimulatorAuthorizationResult;
  };
