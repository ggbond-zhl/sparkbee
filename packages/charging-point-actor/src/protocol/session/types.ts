import type { ICodec, IValidator } from "../types";
import type { ProtocolVersion } from "../../shared/types";
import type { ITransport, RawMessage } from "../transport";

export type OutboundRequestResult =
  | {
      kind: "response";
      payload: unknown;
    }
  | {
      kind: "error";
      errorCode: string;
      errorMessage: string;
      errorDetails: unknown;
    };

export type SessionConnectionState = "offline" | "online" | "reconnecting";

export type SessionOfflineReason =
  | "intentional"
  | "unexpected_disconnect"
  | "reconnect_exhausted";

export type ProtocolMessageDirection = "inbound" | "outbound";

export type ProtocolMessageKind = "request" | "response" | "error";

export interface ProtocolMessageEvent {
  protocol: ProtocolVersion;
  direction: ProtocolMessageDirection;
  messageKind: ProtocolMessageKind;
  messageId: string;
  action?: string;
  payload?: unknown;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: unknown;
}

export type SessionDiagnosticSource =
  | "transport"
  | "decode"
  | "inbound_request";

export type InboundRequest = {
  action: string;
  payload: unknown;
  messageId: string;
  /** 占用本次请求的唯一回复权并发送成功响应。后续任何二次回复都会失败。 */
  respond(payload: unknown): Promise<void>;
  /** 占用本次请求的唯一回复权并发送错误响应。后续任何二次回复都会失败。 */
  reject(errorCode: string, message: string, details?: unknown): Promise<void>;
};

/** 协议会话对外暴露的异步诊断事件载荷。 */
export interface SessionDiagnostic {
  source: SessionDiagnosticSource;
  error: SessionError;
  messageId?: string;
  action?: string;
  raw?: RawMessage;
}

export interface SessionEvents {
  online: () => void;
  offline: (reason: SessionOfflineReason) => void;
  reconnecting: (attempt: number) => void;
  inboundRequest: (request: InboundRequest) => void;
  protocolMessage: (event: ProtocolMessageEvent) => void;
  sessionError: (diagnostic: SessionDiagnostic) => void;
}

/** 控制 transport 意外断开后的自动重连行为。 */
export interface ReconnectOptions {
  /** 第一次重连前的等待时间，单位毫秒。 */
  initialDelayMs?: number;
  /** 指数退避允许增长到的最大等待时间，单位毫秒。 */
  maxDelayMs?: number;
  /** 最大连续重试次数。缺省时不设上限。 */
  maxRetries?: number;
  /** 是否对每次延迟附加抖动，避免多个实例同时重连。 */
  jitter?: boolean;
}

/** 出站请求的调度模式。 */
export type OutboundRequestPolicy = "parallel" | "serial";

/** 构造协议会话时注入的依赖与行为开关。 */
export interface SessionOptions {
  /** 底层传输实现。 */
  transport: ITransport;
  /** 协议编解码器。 */
  codec: ICodec;
  /** request / response payload 校验器。 */
  validator: IValidator;
  /** 当前 session 使用的协议版本，默认 OCPP16J。 */
  protocolVersion?: ProtocolVersion;
  /** 出站请求默认超时时间，单位毫秒。 */
  outboundRequestTimeoutMs?: number;
  /** 自动重连配置；不传表示禁用。 */
  reconnect?: ReconnectOptions;
  /** 入站请求长时间未被上层回复时的兜底超时，单位毫秒。 */
  inboundResponseTimeoutMs?: number;
  /** 多个出站请求同时存在时的调度策略。 */
  outboundRequestPolicy?: OutboundRequestPolicy;
}

/** 协议会话对外提供的稳定交互接口。 */
export interface ISession {
  readonly state: SessionConnectionState;

  /** 进入在线态后 resolve。 */
  connect(): Promise<void>;

  /** 进入离线态后 resolve。 */
  disconnect(): Promise<void>;

  /** 返回当前是否可发送消息。 */
  isConnected(): boolean;

  /** 发送一个协议请求，并在对端回复或失败后结束。 */
  request(action: string, payload: unknown): Promise<OutboundRequestResult>;

  /** 注册协议会话事件监听器。 */
  on<K extends keyof SessionEvents>(
    event: K,
    listener: SessionEvents[K],
  ): this;

  /** 移除协议会话事件监听器。 */
  off<K extends keyof SessionEvents>(
    event: K,
    listener: SessionEvents[K],
  ): this;
}

export type SessionErrorCode =
  | "CONNECT_TIMEOUT"
  | "CONNECT_FAILED"
  | "CONNECT_REJECTED"
  | "CONNECT_ABORTED"
  | "DISCONNECT_FAILED"
  | "OUTBOUND_REQUEST_ABORTED"
  | "OUTBOUND_REQUEST_TIMEOUT"
  | "OUTBOUND_REQUEST_REJECTED"
  | "OUTBOUND_REQUEST_DISCONNECTED"
  | "TRANSPORT_RUNTIME_ERROR"
  | "DECODE_ERROR"
  | "INBOUND_REQUEST_REPLY_FAILED"
  | "VALIDATION_FAILED"
  | "ENCODE_ERROR"
  | "RECONNECT_EXHAUSTED"
  | "INTERNAL_ERROR";

/** 协议会话层统一向上游暴露的稳定错误模型。 */
export class SessionError extends Error {
  override readonly name = "SessionError";
  readonly code: SessionErrorCode;
  override readonly cause: unknown;

  /** 保留稳定错误码，并把底层异常挂到 `cause` 上。 */
  constructor(code: SessionErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.cause = cause;
  }
}
