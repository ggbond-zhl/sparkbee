import { ChargingPoint } from "../../model";
import { createCodec, createValidator } from "../../protocol";
import {
  Ocpp16Runtime,
  type Ocpp16RuntimeOptions,
} from "../../protocol/runtime";
import type { ProtocolClock } from "../../protocol/runtime/ocpp16/protocolClock";
import { ChargingPointSession } from "../../protocol/session";
import type { ISession } from "../../protocol/session/types";
import { WebSocketTransport, type ITransport } from "../../protocol/transport";
import type { Ocpp16ChargingPointSimulatorOptions } from "../types";

export function createDefaultSession(
  options: Ocpp16ChargingPointSimulatorOptions,
): ISession {
  return new ChargingPointSession({
    transport: createDefaultTransport(options),
    codec: createCodec("OCPP16J"),
    validator: createValidator("OCPP16J"),
    protocolVersion: "OCPP16J",
    outboundRequestPolicy: "serial",
    reconnect: {},
  });
}

export function createDefaultOcpp16Runtime(
  session: ISession,
  options: Ocpp16ChargingPointSimulatorOptions,
  runtimeOptions: {
    protocolClock: ProtocolClock;
    idGenerator: () => string;
    configurationCatalog?: Ocpp16RuntimeOptions["configurationCatalog"];
  },
): Ocpp16Runtime {
  return new Ocpp16Runtime({
    session,
    chargingPoint: normalizeChargingPoint(options.chargingPoint),
    configurationCatalog: runtimeOptions.configurationCatalog,
    protocolClock: runtimeOptions.protocolClock,
    idGenerator: runtimeOptions.idGenerator,
  });
}

function createDefaultTransport(options: Ocpp16ChargingPointSimulatorOptions): ITransport {
  return new WebSocketTransport({
    url: options.centralSystemUrl,
    protocols: "ocpp1.6",
  });
}

function normalizeChargingPoint(
  chargingPoint: Ocpp16ChargingPointSimulatorOptions["chargingPoint"],
): ChargingPoint {
  return chargingPoint instanceof ChargingPoint
    ? chargingPoint
    : new ChargingPoint(chargingPoint);
}
