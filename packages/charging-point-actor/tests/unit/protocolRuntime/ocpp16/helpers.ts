import { EventEmitter } from "node:events";

import {
  ChargingPoint,
  Connector,
  EVSE,
  type AuthorizationGrant,
  type ConfigurationEntry,
  type ConnectorOptions,
  type Transaction,
} from "../../../../src/model/index.ts";
import type {
  InboundRequest,
  ISession,
  ProtocolMessageEvent,
  OutboundRequestResult,
  SessionConnectionState,
  SessionEvents,
  SessionOfflineReason,
} from "../../../../src/protocol/session/types.ts";
import {
  Ocpp16Runtime,
  type Ocpp16ActorLog,
  type Ocpp16RuntimeOptions,
} from "../../../../src/protocol/runtime/index.ts";
import type { Ocpp16RuntimeContext } from "../../../../src/protocol/runtime/ocpp16/state.ts";

export type RequestRecord = {
  action: string;
  payload: unknown;
};

export type QueuedReply = {
  action: string;
  result: OutboundRequestResult | Promise<OutboundRequestResult> | Error;
};

export class FakeSession implements ISession {
  private readonly emitter = new EventEmitter();
  readonly requests: RequestRecord[] = [];
  state: SessionConnectionState = "online";

  constructor(private readonly replies: QueuedReply[]) {}

  connect(): Promise<void> {
    this.state = "online";
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.state = "offline";
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.state === "online";
  }

  request(action: string, payload: unknown): Promise<OutboundRequestResult> {
    this.emitProtocolMessage({
      protocol: "OCPP16J",
      direction: "outbound",
      messageKind: "request",
      messageId: `${action}-request-${this.requests.length + 1}`,
      action,
      payload,
    });
    this.requests.push({ action, payload });
    const reply = this.replies.shift();
    if (reply === undefined) {
      throw new Error(`未配置 ${action} 响应`);
    }

    if (reply.action !== action) {
      throw new Error(`期望发送 ${reply.action}，实际发送 ${action}`);
    }

    if (reply.result instanceof Error) {
      return Promise.reject(reply.result);
    }

    return Promise.resolve(reply.result);
  }

  on<K extends keyof SessionEvents>(
    event: K,
    listener: SessionEvents[K],
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof SessionEvents>(
    event: K,
    listener: SessionEvents[K],
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emitInboundRequest(request: InboundRequest): void {
    this.emitProtocolMessage({
      protocol: "OCPP16J",
      direction: "inbound",
      messageKind: "request",
      messageId: request.messageId,
      action: request.action,
      payload: request.payload,
    });
    this.emitter.emit("inboundRequest", request);
  }

  emitOffline(reason: SessionOfflineReason): void {
    this.state = "offline";
    this.emitter.emit("offline", reason);
  }

  emitOnline(): void {
    this.state = "online";
    this.emitter.emit("online");
  }

  private emitProtocolMessage(event: ProtocolMessageEvent): void {
    this.emitter.emit("protocolMessage", event);
  }
}

export class FakeInboundRequest implements InboundRequest {
  readonly responses: unknown[] = [];
  readonly rejections: Array<{
    errorCode: string;
    message: string;
    details: unknown;
  }> = [];

  constructor(
    readonly action: string,
    readonly payload: unknown,
    readonly messageId = "inbound-1",
  ) {}

  respond(payload: unknown): Promise<void> {
    this.responses.push(payload);
    return Promise.resolve();
  }

  reject(
    errorCode: string,
    message: string,
    details?: unknown,
  ): Promise<void> {
    this.rejections.push({ errorCode, message, details });
    return Promise.resolve();
  }
}

export function response(action: string, payload: unknown): QueuedReply {
  return {
    action,
    result: {
      kind: "response",
      payload,
    },
  };
}

export function error(action: string, errorMessage: string): QueuedReply {
  return {
    action,
    result: {
      kind: "error",
      errorCode: "InternalError",
      errorMessage,
      errorDetails: {},
    },
  };
}

export function rejected(action: string, error: Error): QueuedReply {
  return {
    action,
    result: error,
  };
}

export function bootAccepted(): QueuedReply {
  return response("BootNotification", {
    status: "Accepted",
    currentTime: "2026-01-01T00:00:00.000Z",
    interval: 30,
  });
}

export function createChargingPoint(
  connector?: Partial<ConnectorOptions>,
): ChargingPoint {
  const connectorEntity = new Connector({
    id: 1,
    type: "GBT",
    format: "socket",
    powerType: "ac",
    ...connector,
  });

  return new ChargingPoint({
    id: "cp-1",
    vendor: "Volt",
    model: "Sim",
    serialNumber: "CP001",
    firmwareVersion: "1.0.0",
    evses: [
      new EVSE({
        id: 1,
        connectors: [connectorEntity],
      }),
    ],
  });
}

export function createProtocolRuntime(replies: QueuedReply[], options: {
  chargingPoint?: ChargingPoint;
  configurationCatalog?: Ocpp16RuntimeOptions["configurationCatalog"];
  actorLogs?: Ocpp16ActorLog[];
} = {}): { protocolRuntime: Ocpp16Runtime; session: FakeSession } {
  const session = new FakeSession(replies);
  const protocolRuntime = new Ocpp16Runtime({
    session,
    chargingPoint: options.chargingPoint ?? createChargingPoint(),
    configurationCatalog: options.configurationCatalog,
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
    idGenerator: () => "transaction-1",
    emitActorLog: (actorLog) => {
      options.actorLogs?.push(actorLog);
    },
  });

  return { protocolRuntime, session };
}

export function runtimeContext(
  protocolRuntime: Ocpp16Runtime,
): Ocpp16RuntimeContext {
  return (protocolRuntime as unknown as {
    context: Ocpp16RuntimeContext;
  }).context;
}

export function runtimeState(protocolRuntime: Ocpp16Runtime) {
  return protocolRuntime.getRuntimeSnapshot();
}

export function getChargingPointAvailability(
  protocolRuntime: Ocpp16Runtime,
): ChargingPoint["availability"] {
  return protocolRuntime.getRuntimeSnapshot().chargingPoint.availability;
}

export function getChargingPointStatus(
  protocolRuntime: Ocpp16Runtime,
): ChargingPoint["status"] {
  return protocolRuntime.getChargingPointStatus();
}

export function listRuntimeEvses(protocolRuntime: Ocpp16Runtime): EVSE[] {
  return protocolRuntime.getRuntimeSnapshot().chargingPoint.evses;
}

export function getConnectorFact(
  protocolRuntime: Ocpp16Runtime,
  input: { evseId?: number; connectorId?: number } = {},
): Connector | undefined {
  const evse = protocolRuntime.getRuntimeSnapshot().chargingPoint.evses
    .find((candidate) => candidate.id === (input.evseId ?? 1));
  return evse?.getConnector(input.connectorId ?? 1);
}

export function getConfigurationEntry(
  protocolRuntime: Ocpp16Runtime,
  key: string,
): ConfigurationEntry | undefined {
  return protocolRuntime.getRuntimeSnapshot().configurationStore.getEntry(key);
}

export function getConfigurationValue(
  protocolRuntime: Ocpp16Runtime,
  key: string,
): string | undefined {
  return protocolRuntime.getRuntimeSnapshot().configurationStore.getValue(key);
}

export function listAuthorizationGrants(
  protocolRuntime: Ocpp16Runtime,
): AuthorizationGrant[] {
  return protocolRuntime.getRuntimeSnapshot().authorizationGrants;
}

export function getAuthorizationGrant(
  protocolRuntime: Ocpp16Runtime,
  index = 0,
): AuthorizationGrant | undefined {
  return listAuthorizationGrants(protocolRuntime)[index];
}

export function listRuntimeTransactions(
  protocolRuntime: Ocpp16Runtime,
): Transaction[] {
  return protocolRuntime.getRuntimeSnapshot().transactions;
}

export function getRuntimeTransaction(
  protocolRuntime: Ocpp16Runtime,
  index = 0,
): Transaction | undefined {
  return listRuntimeTransactions(protocolRuntime)[index];
}

export async function boot(protocolRuntime: Ocpp16Runtime): Promise<void> {
  await protocolRuntime.boot();
}
