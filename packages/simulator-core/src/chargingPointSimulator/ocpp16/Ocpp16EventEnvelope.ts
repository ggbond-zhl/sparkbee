import type { ProtocolVersion } from "../../shared/types";
import type { Ocpp16Runtime, Ocpp16RuntimeEvent } from "../../protocol/runtime";
import type {
  ISession,
  ProtocolMessageEvent as SessionProtocolMessageEvent,
  SessionOfflineReason,
} from "../../protocol/session/types";
import type { ProtocolClock } from "../../protocol/runtime/ocpp16/protocolClock";
import type {
  ChargingPointSimulatorEventBus,
  ChargingPointSimulatorSessionStatus,
  ChargingPointSimulatorStatus,
} from "../types";
import { EventEnvelopePublisher } from "./EventEnvelopePublisher";

export interface Ocpp16EventEnvelopeOptions {
  chargingPointSimulatorId: string;
  protocol: ProtocolVersion;
  clock: ProtocolClock;
  idGenerator: () => string;
  session: ISession;
  runtime: Ocpp16Runtime;
  onOnline(): void;
}

export class Ocpp16EventEnvelope {
  private readonly publisher: EventEnvelopePublisher;
  private sessionStatus: ChargingPointSimulatorSessionStatus = "offline";

  readonly events: ChargingPointSimulatorEventBus;

  constructor(private readonly options: Ocpp16EventEnvelopeOptions) {
    this.publisher = new EventEnvelopePublisher({
      chargingPointSimulatorId: options.chargingPointSimulatorId,
      protocol: options.protocol,
      clock: options.clock,
      idGenerator: options.idGenerator,
    });
    this.events = this.publisher.events;
    this.bind();
  }

  publishChargingPointSimulatorStatus(
    previousStatus: ChargingPointSimulatorStatus,
    currentStatus: ChargingPointSimulatorStatus,
    error?: { code: string; message: string },
  ): void {
    this.publisher.publish("chargingPointSimulator.status", {
      resource: { scope: "chargingPointSimulator" },
      previousStatus,
      currentStatus,
      ...(error === undefined ? {} : { error }),
    });
  }

  dispose(): void {
    this.options.runtime.off("runtimeEvent", this.routeRuntimeEvent);
    this.options.session.off("protocolMessage", this.routeProtocolMessage);
    this.options.session.off("online", this.handleOnline);
    this.options.session.off("reconnecting", this.handleReconnecting);
    this.options.session.off("offline", this.handleOffline);
    this.publisher.dispose();
  }

  private bind(): void {
    this.options.runtime.on("runtimeEvent", this.routeRuntimeEvent);
    this.options.session.on("protocolMessage", this.routeProtocolMessage);
    this.options.session.on("online", this.handleOnline);
    this.options.session.on("reconnecting", this.handleReconnecting);
    this.options.session.on("offline", this.handleOffline);
  }

  private readonly routeProtocolMessage = (
    event: SessionProtocolMessageEvent,
  ): void => {
    const body = event.payload ?? (
      event.errorCode === undefined
        ? undefined
        : {
            errorCode: event.errorCode,
            errorMessage: event.errorMessage,
            errorDetails: event.errorDetails,
          }
    );

    this.publisher.publish("protocol.message", {
      resource: { scope: "protocol" },
      direction: event.direction === "outbound" ? "sent" : "received",
      action: event.action,
      messageId: event.messageId,
      ...(body === undefined ? {} : { body }),
    });
  };

  private readonly handleOnline = (): void => {
    this.publishSessionStatus("online");
    this.options.onOnline();
  };

  private readonly handleReconnecting = (attempt: number): void => {
    this.publishSessionStatus("reconnecting", { attempt });
  };

  private readonly handleOffline = (reason: SessionOfflineReason): void => {
    this.publishSessionStatus("offline", { reason });
  };

  private readonly routeRuntimeEvent = (event: Ocpp16RuntimeEvent): void => {
    switch (event.type) {
      case "chargingPoint.status":
        this.publisher.publish("chargingPoint.status", {
          resource: event.resource,
          previousStatus: event.previousStatus,
          currentStatus: event.currentStatus,
          ...(event.error === undefined ? {} : { error: event.error }),
        }, event.occurredAt);
        return;
      case "evse.status":
        this.publisher.publish("evse.status", {
          resource: event.resource,
          previousStatus: event.previousStatus,
          currentStatus: event.currentStatus,
          ...(event.error === undefined ? {} : { error: event.error }),
        }, event.occurredAt);
        return;
      case "connector.status":
        this.publisher.publish("connector.status", {
          resource: event.resource,
          previousStatus: event.previousStatus,
          currentStatus: event.currentStatus,
          ...(event.error === undefined ? {} : { error: event.error }),
        }, event.occurredAt);
        return;
      case "authorization.status":
        this.publisher.publish("authorization.status", {
          resource: event.resource,
          status: event.status,
          source: event.source,
          ...(event.protocolStatus === undefined
            ? {}
            : { protocolStatus: event.protocolStatus }),
        }, event.occurredAt);
        return;
      case "transaction.status":
        this.publisher.publish("transaction.status", {
          resource: event.resource,
          previousStatus: event.previousStatus,
          currentStatus: event.currentStatus,
          ...(event.reason === undefined ? {} : { reason: event.reason }),
          ...(event.error === undefined ? {} : { error: event.error }),
        }, event.occurredAt);
        return;
      case "transaction.meterValue":
        this.publisher.publish("transaction.meterValue", {
          resource: event.resource,
          meterWh: event.meterWh,
          sampledAt: event.sampledAt.toISOString(),
        }, event.occurredAt);
        return;
    }
  };

  private publishSessionStatus(
    currentStatus: ChargingPointSimulatorSessionStatus,
    extra: { attempt?: number; reason?: SessionOfflineReason } = {},
  ): void {
    const previousStatus = this.sessionStatus;
    this.sessionStatus = currentStatus;
    this.publisher.publish("session.status", {
      resource: { scope: "session" },
      previousStatus,
      currentStatus,
      ...extra,
    });
  }
}
