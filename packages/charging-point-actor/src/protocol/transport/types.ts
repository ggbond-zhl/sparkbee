export type RawMessage = string | Uint8Array;

/**
 * transport 主动断开与底层异常断开都会走同一个事件。
 * 上层需要依赖 intentional、code 和 cause 组合判断是否应该重连或记录故障。
 */
export interface TransportDisconnectedEvent {
  intentional: boolean;
  reason?: string;
  cause?: unknown;
  code?: number;
}

export interface TransportEvents {
  connected: () => void;
  connecting: () => void;
  disconnected: (event: TransportDisconnectedEvent) => void;
  message: (message: RawMessage) => void;
  error: (error: TransportError) => void;
}

export type ITransportEvents = TransportEvents;

/**
 * transport 接口约束了会话层可依赖的最小能力。
 * 新协议适配时应优先兼容这组语义，而不是暴露底层连接库特有行为。
 */
export interface ITransport {
  /**
   * 建立到底层连接端点的链路。
   * 如果连接已在建立中，应返回同一个进行中的 Promise，而不是并发发起第二次连接。
   *
   * @returns 在连接完成后 resolve
   */
  connect(): Promise<void>;

  /**
   * 关闭当前链路。
   * 若连接尚未建立完成，也必须让进行中的 connect() 以失败结束，避免上层误判为连接成功。
   *
   * @returns 在断开流程完成后 resolve
   */
  disconnect(): Promise<void>;

  /**
   * 发送一帧原始消息。
   *
   * @param message 已编码完成的消息帧
   * @throws {TransportError} 当前链路不可发送或底层发送失败时抛出
   */
  send(message: RawMessage): Promise<void>;

  /**
   * @returns 当前 transport 是否处于可发送状态
   */
  isConnected(): boolean;

  /**
   * 注册 transport 生命周期或消息事件监听器。
   *
   * @param event 事件名
   * @param listener 事件处理函数
   * @returns 当前 transport，便于链式调用
   */
  on<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): this;

  /**
   * 移除已注册的 transport 事件监听器。
   *
   * @param event 事件名
   * @param listener 事件处理函数
   * @returns 当前 transport，便于链式调用
   */
  off<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): this;
}

export type TransportErrorCode =
  | "CONNECT_TIMEOUT"
  | "CONNECT_FAILED"
  | "SEND_FAILED"
  | "DISCONNECTED_UNEXPECTEDLY"
  | "INTERNAL_ERROR";

/*
 * transport 层对外只暴露统一错误模型，避免上层依赖底层 socket 或运行时细节。
 * code 用于稳定分支判断，cause 保留原始异常，便于日志与问题定位沿链路追踪。
 */
export class TransportError extends Error {
  override readonly name = "TransportError";
  readonly code: TransportErrorCode;
  override readonly cause: unknown;

  /**
   * @param code transport 层对外暴露的稳定错误码
   * @param message 面向日志与调试的错误描述
   * @param cause 原始异常或底层关闭原因
   */
  constructor(code: TransportErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.cause = cause;
  }
}


