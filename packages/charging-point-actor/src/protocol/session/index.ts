import { EventEmitter } from "node:events";

import type {
  ErrorMessage,
  ICodec,
  Meta,
  ProtocolMessage,
  RequestMessage,
  ResponseMessage,
} from "../types";
import type {
  RawMessage,
  TransportDisconnectedEvent,
  TransportError,
} from "../transport";
import type {
  ISession,
  OutboundRequestResult,
  ProtocolMessageDirection,
  ProtocolMessageEvent,
  SessionConnectionState,
  SessionActorLogEntry,
  SessionEvents,
  SessionOptions,
} from "./types";
import { SessionError } from "./types";
import { SessionConnectionController } from "./internal/SessionConnectionController";
import { InboundRequestCoordinator } from "./internal/InboundRequestCoordinator";
import { OutboundRequestCoordinator } from "./internal/OutboundRequestCoordinator";
import { ProtocolMessageSender } from "./internal/ProtocolMessageSender";

const DEFAULT_INBOUND_RESPONSE_TIMEOUT_MS = 30_000;
const DEFAULT_OUTBOUND_REQUEST_TIMEOUT_MS = 30_000;

type DecodedInboundMessage =
  | (RequestMessage & { meta: Meta })
  | (ResponseMessage & { meta: Meta })
  | (ErrorMessage & { meta: Meta });

type InboundDecodeResult =
  | { kind: "decoded"; message: DecodedInboundMessage }
  | { kind: "ignored" }
  | { kind: "actorLog"; actorLog: SessionActorLogEntry };

/** 对外暴露 session API，并把连接、入站和出站职责装配到内部协调器。 */
export class ChargingPointSession implements ISession {
  private readonly emitter = new EventEmitter();
  private readonly codec: ICodec;
  private readonly protocolVersion: NonNullable<SessionOptions["protocolVersion"]>;
  private readonly connection: SessionConnectionController;
  private readonly inboundRequestCoordinator: InboundRequestCoordinator;
  private readonly outboundRequestCoordinator: OutboundRequestCoordinator;

  constructor(options: SessionOptions) {
    this.codec = options.codec;
    this.protocolVersion = options.protocolVersion ?? "OCPP16J";
    const messageSender = new ProtocolMessageSender(
      options.codec,
      options.transport,
      {
        onSent: (message) => this.emitProtocolMessage(message, "outbound"),
      },
    );
    this.inboundRequestCoordinator = new InboundRequestCoordinator({
      validator: options.validator,
      inboundResponseTimeoutMs:
        options.inboundResponseTimeoutMs ?? DEFAULT_INBOUND_RESPONSE_TIMEOUT_MS,
      messageSender,
      emitInboundRequest: (request) => this.emit("inboundRequest", request),
      emitSessionActorLog: (actorLog) => this.emitSessionActorLog(actorLog),
    });
    this.outboundRequestCoordinator = new OutboundRequestCoordinator({
      validator: options.validator,
      messageSender,
      outboundRequestTimeoutMs:
        options.outboundRequestTimeoutMs ?? DEFAULT_OUTBOUND_REQUEST_TIMEOUT_MS,
      outboundRequestPolicy: options.outboundRequestPolicy ?? "parallel",
      isConnected: () => this.connection.isConnected(),
      emitInboundProtocolMessage: (message) =>
        this.emitProtocolMessage(message, "inbound"),
    });
    this.connection = new SessionConnectionController({
      transport: options.transport,
      reconnectOptions: options.reconnect,
      resetMessagingState: () => this.resetMessagingState(),
      emitOnline: () => this.emit("online"),
      emitOffline: (reason) => this.emit("offline", reason),
      emitReconnecting: (attempt) => this.emit("reconnecting", attempt),
    });

    this.bindTransportListeners(options.transport);
  }

  get state(): SessionConnectionState {
    return this.connection.state;
  }

  connect(): Promise<void> {
    return this.connection.connect();
  }

  disconnect(): Promise<void> {
    return this.connection.disconnect();
  }

  isConnected(): boolean {
    return this.connection.isConnected();
  }

  request(action: string, payload: unknown): Promise<OutboundRequestResult> {
    return this.outboundRequestCoordinator.request(action, payload);
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

  private readonly handleTransportMessage = (rawMessage: RawMessage): void => {
    const decodeResult = this.decodeInboundMessage(rawMessage);
    switch (decodeResult.kind) {
      case "ignored":
        return;
      case "actorLog":
        this.emitSessionActorLog(decodeResult.actorLog);
        return;
      case "decoded":
        this.routeInboundMessage(decodeResult.message);
        return;
    }
  };

  private decodeInboundMessage(rawMessage: RawMessage): InboundDecodeResult {
    if (!this.connection.isConnected()) {
      return { kind: "ignored" };
    }

    try {
      const decodeResult = this.codec.decode(rawMessage);
      if (!decodeResult.success) {
        return {
          kind: "actorLog",
          actorLog: this.createDecodeActorLog(
            "入站消息解码失败",
            decodeResult.error,
            rawMessage,
          ),
        };
      }

      return {
        kind: "decoded",
        message: {
          ...decodeResult.message,
          meta: this.createInboundMeta(
            decodeResult.message.meta,
            rawMessage,
          ),
        },
      };
    } catch (cause) {
      return {
        kind: "actorLog",
        actorLog: this.createDecodeActorLog(
          "入站消息解码发生内部异常",
          cause,
          rawMessage,
        ),
      };
    }
  }

  private routeInboundMessage(message: DecodedInboundMessage): void {
    switch (message.kind) {
      case "request":
        this.emitProtocolMessage(message, "inbound");
        void this.inboundRequestCoordinator.handleInboundRequest(message);
        break;
      case "response":
      case "error":
        this.outboundRequestCoordinator.handleInboundReply(message);
        break;
    }
  }

  private emitProtocolMessage(
    message: ProtocolMessage,
    direction: ProtocolMessageDirection,
  ): void {
    this.emit("protocolMessage", this.toProtocolMessageEvent(message, direction));
  }

  private toProtocolMessageEvent(
    message: ProtocolMessage,
    direction: ProtocolMessageDirection,
  ): ProtocolMessageEvent {
    const base = {
      protocol: this.protocolVersion,
      direction,
      messageKind: message.kind,
      messageId: message.messageId,
      action: message.action,
    };

    if (message.kind === "error") {
      return {
        ...base,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        errorDetails: message.errorDetails,
      };
    }

    return {
      ...base,
      payload: message.payload,
    };
  }

  private createInboundMeta(meta: Meta | undefined, rawMessage: RawMessage): Meta {
    return {
      ...meta,
      raw: rawMessage,
      receivedAt: new Date(),
      direction: "inbound" as const,
    };
  }

  private readonly handleTransportDisconnected = (
    event: TransportDisconnectedEvent,
  ): void => {
    this.connection.handleTransportDisconnected(event);
  };

  private readonly handleTransportError = (error: TransportError): void => {
    this.emitSessionActorLog({
      source: "transport",
      error: new SessionError(
        "TRANSPORT_RUNTIME_ERROR",
        "transport 运行时异常",
        error,
      ),
    });
  };

  private bindTransportListeners(transport: SessionOptions["transport"]): void {
    transport.on("message", this.handleTransportMessage);
    transport.on("error", this.handleTransportError);
    transport.on("disconnected", this.handleTransportDisconnected);
  }

  private resetMessagingState(): void {
    this.outboundRequestCoordinator.handleDisconnected();
    this.inboundRequestCoordinator.handleDisconnected();
  }

  private emit<K extends keyof SessionEvents>(
    event: K,
    ...args: Parameters<SessionEvents[K]>
  ): void {
    this.emitter.emit(event, ...(args as unknown[]));
  }

  private createDecodeActorLog(
    message: string,
    cause: unknown,
    rawMessage: RawMessage,
  ): SessionActorLogEntry {
    return {
      source: "decode",
      error: new SessionError("DECODE_ERROR", message, cause),
      raw: rawMessage,
    };
  }

  private emitSessionActorLog(actorLog: SessionActorLogEntry): void {
    this.emit("sessionError", actorLog);
  }
}
