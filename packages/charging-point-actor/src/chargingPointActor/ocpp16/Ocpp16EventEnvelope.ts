import type { ProtocolVersion } from "../../shared/types";
import type { Ocpp16Runtime, Ocpp16RuntimeEvent } from "../../protocol/runtime";
import type {
  ISession,
  ProtocolMessageEvent as SessionProtocolMessageEvent,
  SessionError,
  SessionOfflineReason,
} from "../../protocol/session/types";
import type { ProtocolClock } from "../../protocol/runtime/ocpp16/protocolClock";
import type {
  ChargingPointActorEventBus,
  ChargingPointActorEventError,
  ChargingPointActorEventErrorCause,
  ChargingPointActorSessionStatus,
  ChargingPointActorStatus,
} from "../types";
import { EventEnvelopePublisher } from "./EventEnvelopePublisher";

export interface Ocpp16EventEnvelopeOptions {
  chargingPointId: string;
  connectionUrl: string;
  protocol: ProtocolVersion;
  clock: ProtocolClock;
  idGenerator: () => string;
  session: ISession;
  runtime: Ocpp16Runtime;
  onOnline(): void;
}

export class Ocpp16EventEnvelope {
  private readonly publisher: EventEnvelopePublisher;
  private sessionStatus: ChargingPointActorSessionStatus = "offline";

  readonly events: ChargingPointActorEventBus;

  constructor(private readonly options: Ocpp16EventEnvelopeOptions) {
    this.publisher = new EventEnvelopePublisher({
      chargingPointId: options.chargingPointId,
      protocol: options.protocol,
      clock: options.clock,
      idGenerator: options.idGenerator,
    });
    this.events = this.publisher.events;
    this.bind();
  }

  publishChargingPointLifecycle(
    previousStatus: ChargingPointActorStatus,
    currentStatus: ChargingPointActorStatus,
    error?: { code: string; message: string },
  ): void {
    this.publisher.publish("chargingPoint.lifecycle", {
      resource: { scope: "chargingPoint" },
      previousStatus,
      currentStatus,
      ...(error === undefined ? {} : { error }),
    });
  }

  publishChargingPointBoot(
    status: "Accepted" | "Pending" | "Rejected",
    retryAfterSec?: number,
  ): void {
    this.publisher.publish("chargingPoint.boot", {
      resource: { scope: "chargingPoint" },
      status,
      ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
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

  private readonly handleReconnecting = (
    attempt: number,
    error?: SessionError,
  ): void => {
    this.publishSessionStatus("reconnecting", {
      attempt,
      ...(error === undefined ? {} : { error: toEventError(error) }),
    });
  };

  private readonly handleOffline = (reason: SessionOfflineReason): void => {
    this.publishSessionStatus("offline", { reason });
  };

  private readonly routeRuntimeEvent = (event: Ocpp16RuntimeEvent): void => {
    switch (event.type) {
      case "chargingPoint.availability":
        this.publisher.publish("chargingPoint.availability", {
          resource: event.resource,
          previousAvailability: event.previousAvailability,
          currentAvailability: event.currentAvailability,
          ...(event.requestedAvailability === undefined
            ? {}
            : { requestedAvailability: event.requestedAvailability }),
        }, event.occurredAt);
        return;
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
      case "connector.availability":
        this.publisher.publish("connector.availability", {
          resource: event.resource,
          previousAvailability: event.previousAvailability,
          currentAvailability: event.currentAvailability,
          ...(event.requestedAvailability === undefined
            ? {}
            : { requestedAvailability: event.requestedAvailability }),
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
          powerW: event.powerW,
          currentA: event.currentA,
          voltageV: event.voltageV,
          sampledAt: event.sampledAt.toISOString(),
        }, event.occurredAt);
        return;
      case "configuration.changed":
        this.publisher.publish("configuration.changed", {
          resource: event.resource,
          value: event.value,
          version: event.version,
          lastModifiedBy: event.lastModifiedBy,
          pendingRestart: event.pendingRestart,
        }, event.occurredAt);
        return;
      case "transaction-delivery.changed":
        this.publisher.publish("transaction-delivery.changed", {
          resource: {
            ...event.resource,
            deliverySequence: event.resource.deliverySequence.toString(),
          },
          messageType: event.messageType,
          previousStatus: event.previousStatus,
          currentStatus: event.currentStatus,
          attemptCount: event.attemptCount,
          nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
          lastError: event.lastError,
        }, event.occurredAt);
        return;
    }
  };

  private publishSessionStatus(
    currentStatus: ChargingPointActorSessionStatus,
    extra: {
      attempt?: number;
      reason?: SessionOfflineReason;
      error?: ChargingPointActorEventError;
    } = {},
  ): void {
    const previousStatus = this.sessionStatus;
    this.sessionStatus = currentStatus;
    this.publisher.publish("session.status", {
      resource: { scope: "session" },
      previousStatus,
      currentStatus,
      connectionUrl: this.options.connectionUrl,
      ...extra,
    });
  }
}

function toEventError(error: SessionError): ChargingPointActorEventError {
  return {
    code: error.code,
    message: error.message,
    ...(error.cause === undefined ? {} : { cause: toEventErrorCause(error.cause) }),
  };
}

function toEventErrorCause(
  cause: unknown,
  depth = 0,
): ChargingPointActorEventErrorCause {
  if (depth >= 3) {
    return { message: "Cause chain truncated" };
  }

  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      ...("code" in cause && typeof cause.code === "string"
        ? { code: cause.code }
        : {}),
      ...(cause.cause === undefined
        ? {}
        : { cause: toEventErrorCause(cause.cause, depth + 1) }),
    };
  }

  if (typeof cause === "object" && cause !== null) {
    return {
      ...("name" in cause && typeof cause.name === "string"
        ? { name: cause.name }
        : {}),
      ...("code" in cause && typeof cause.code === "string"
        ? { code: cause.code }
        : {}),
      ...("message" in cause && typeof cause.message === "string"
        ? { message: cause.message }
        : { message: String(cause) }),
    };
  }

  return { message: String(cause) };
}
