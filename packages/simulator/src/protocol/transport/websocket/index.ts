import { EventEmitter } from "node:events";

import { normalizeRawMessage } from "./messageNormalization";
import { TransportLifecycleMachine } from "./TransportLifecycleMachine";
import {
  TransportError,
  type ITransport,
  type RawMessage,
  type TransportDisconnectedEvent,
  type TransportEvents,
} from "../types";

export interface WebSocketTransportOptions {
  url: string;
  protocols?: string | string[];
  connectTimeoutMs?: number;
}

type WebSocketConstructorLike = {
  new(
    url: string | URL,
    protocols?: string | string[],
  ): WebSocket;
};

interface CloseDetails {
  code?: number;
  reason?: string;
}

const NORMAL_CLOSE_CODE = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const INBOUND_BINARY_TYPE: WebSocket["binaryType"] = "arraybuffer";

function normalizeCloseReason(reason: string): string | undefined {
  return reason === "" ? undefined : reason;
}

/** 将 Node WebSocket 生命周期收敛为 transport 约定的稳定语义。 */
export class WebSocketTransport implements ITransport {
  private readonly emitter = new EventEmitter();
  private readonly lifecycle = new TransportLifecycleMachine();
  private socket?: WebSocket;
  private connectTimeoutId?: ReturnType<typeof setTimeout>;
  private readonly options: WebSocketTransportOptions;

  constructor(options: WebSocketTransportOptions) {
    this.options = options;
  }

  connect(): Promise<void> {
    switch (this.lifecycle.currentState) {
      case "connected":
        return Promise.resolve();
      case "connecting":
        return this.getPendingOperationPromise(
          this.lifecycle.connectPromise,
          "transport 处于 connecting 状态但缺少 connect() 上下文",
        );
      case "disconnecting":
        return Promise.reject(
          new TransportError(
            "INTERNAL_ERROR",
            "disconnect() 尚未完成，无法重新发起连接",
          ),
        );
      case "disconnected":
        return this.startConnect();
    }
  }

  disconnect(): Promise<void> {
    switch (this.lifecycle.currentState) {
      case "disconnected":
        return Promise.resolve();
      case "disconnecting":
        return this.getPendingOperationPromise(
          this.lifecycle.disconnectPromise,
          "transport 处于 disconnecting 状态但缺少 disconnect() 上下文",
        );
      case "connecting":
        return this.beginDisconnectFlow(
          new TransportError(
            "INTERNAL_ERROR",
            "connect() 在连接过程中被 disconnect() 中断",
          ),
        );
      case "connected":
        return this.beginDisconnectFlow();
    }
  }

  async send(message: RawMessage): Promise<void> {
    const socket = this.getOpenSocketForSend();

    try {
      socket.send(message);
    } catch (cause) {
      throw new TransportError("SEND_FAILED", "提交 WebSocket 帧失败", cause);
    }
  }

  isConnected(): boolean {
    return this.lifecycle.currentState === "connected";
  }

  on<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  private startConnect(): Promise<void> {
    const operation = this.lifecycle.startConnect();
    this.emit("connecting");

    try {
      const socket = this.createSocket();
      socket.binaryType = INBOUND_BINARY_TYPE;

      this.socket = socket;
      this.bindSocketHandlers(socket);
      this.startConnectTimeout(socket);
    } catch (cause) {
      this.finishConnectFailure(
        new TransportError("CONNECT_FAILED", "创建 WebSocket 连接失败", cause),
      );
    }

    return operation.promise;
  }

  // disconnect() 打断 connect() 时，先拒绝 connect，再等待 close 完成收尾。
  private beginDisconnectFlow(connectAbortError?: TransportError): Promise<void> {
    const operation =
      connectAbortError === undefined
        ? this.lifecycle.startDisconnect()
        : this.interruptConnectWithDisconnect(connectAbortError);

    this.requestSocketClose(NORMAL_CLOSE_CODE);
    return operation.promise;
  }

  private getPendingOperationPromise(
    operation: Promise<void> | undefined,
    message: string,
  ): Promise<void> {
    if (operation !== undefined) {
      return operation;
    }

    return Promise.reject(new TransportError("INTERNAL_ERROR", message));
  }

  private interruptConnectWithDisconnect(error: TransportError) {
    this.clearConnectTimeout();
    return this.lifecycle.interruptConnectWithDisconnect(error);
  }

  private finishConnectSuccess(): void {
    this.clearConnectTimeout();
    if (!this.lifecycle.completeConnect()) {
      return;
    }

    this.emit("connected");
  }

  private finishConnectFailure(
    error: TransportError,
    details: CloseDetails = {},
  ): void {
    this.clearConnectTimeout();
    this.lifecycle.failConnect(error);
    this.emitDisconnected({
      intentional: false,
      cause: error,
      ...details,
    });
  }

  private finishDisconnectSuccess(details: CloseDetails = {}): void {
    this.clearConnectTimeout();
    this.lifecycle.completeDisconnect();
    this.emitDisconnected({
      intentional: true,
      ...details,
    });
  }

  private finishDisconnectFailure(
    error: TransportError,
    details: CloseDetails = {},
  ): void {
    this.clearConnectTimeout();
    this.lifecycle.failDisconnect(error);
    this.emitDisconnected({
      intentional: false,
      cause: error,
      ...details,
    });
  }

  private emitUnexpectedDisconnect(
    cause: unknown,
    details: CloseDetails = {},
  ): void {
    this.clearConnectTimeout();
    this.lifecycle.moveToDisconnected();
    this.emitDisconnected({
      intentional: false,
      cause: new TransportError(
        "DISCONNECTED_UNEXPECTEDLY",
        "WebSocket 连接意外断开",
        cause,
      ),
      ...details,
    });
  }

  private emitDisconnected(event: TransportDisconnectedEvent): void {
    this.emit("disconnected", event);
  }

  // 超时要同时结束 connect、释放 socket，并阻止迟到事件扰乱状态。
  private handleConnectTimeout(socket: WebSocket, timeoutMs: number): void {
    if (
      socket !== this.socket ||
      this.lifecycle.currentState !== "connecting"
    ) {
      return;
    }

    const error = new TransportError(
      "CONNECT_TIMEOUT",
      `WebSocket 连接在 ${timeoutMs}ms 内未完成`,
      new Error("connect timeout"),
    );

    this.releaseSocket(socket);
    this.finishConnectFailure(error);
    this.terminateSocket(socket);
  }

  private requestSocketClose(code: number, reason?: string): void {
    const socket = this.socket;
    if (socket === undefined) {
      this.finishDisconnectSuccess({ code, reason });
      return;
    }

    try {
      socket.close(code, reason);
    } catch (cause) {
      const error = new TransportError(
        "INTERNAL_ERROR",
        "关闭 WebSocket 连接失败",
        cause,
      );

      this.releaseSocket(socket);
      this.finishDisconnectFailure(error, { code, reason });
    }
  }

  private startConnectTimeout(socket: WebSocket): void {
    const timeoutMs = this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.connectTimeoutId = setTimeout(() => {
      this.handleConnectTimeout(socket, timeoutMs);
    }, timeoutMs);
  }

  private bindSocketHandlers(socket: WebSocket): void {
    socket.onopen = this.handleOpen;
    socket.onmessage = this.handleMessage;
    socket.onerror = this.handleError;
    socket.onclose = this.handleClose;
  }

  private releaseSocket(socket: WebSocket): void {
    this.cleanupSocket(socket);

    if (socket === this.socket) {
      this.socket = undefined;
    }
  }

  private terminateSocket(socket: WebSocket): void {
    try {
      (socket as { terminate?: () => void }).terminate?.();
    } catch {
      // terminate() 只是兜底清理，失败时不覆盖主错误路径。
    }
  }

  private readonly handleOpen = (): void => {
    const socket = this.socket;
    if (socket === undefined) {
      return;
    }

    this.clearConnectTimeout();
    if (this.lifecycle.currentState === "disconnecting") {
      if (socket.readyState === WebSocket.OPEN) {
        this.requestSocketClose(NORMAL_CLOSE_CODE);
      }

      return;
    }

    if (this.lifecycle.currentState !== "connecting") {
      return;
    }

    this.finishConnectSuccess();
  };

  private readonly handleMessage = (event: MessageEvent): void => {
    if (
      this.lifecycle.currentState !== "connected" ||
      this.socket === undefined
    ) {
      return;
    }

    try {
      const rawMessage = normalizeRawMessage(event.data);
      this.emit("message", rawMessage);
    } catch (cause) {
      const error =
        cause instanceof TransportError
          ? cause
          : new TransportError("INTERNAL_ERROR", "处理消息帧失败", cause);
      this.emit("error", error);
    }
  };

  private readonly handleError = (event: Event): void => {
    const socket = this.socket;
    if (socket === undefined) {
      return;
    }

    if (this.lifecycle.currentState === "connecting") {
      this.releaseSocket(socket);
      this.finishConnectFailure(
        new TransportError("CONNECT_FAILED", "WebSocket 连接失败", event),
      );
      this.terminateSocket(socket);
      return;
    }

    if (this.lifecycle.currentState !== "connected") {
      return;
    }

    // 延后到微任务处理，避免和随后到来的 close 重复表达同一故障。
    queueMicrotask(() => {
      if (
        socket !== this.socket ||
        this.lifecycle.currentState !== "connected"
      ) {
        return;
      }

      if (socket.readyState === WebSocket.OPEN) {
        this.emit(
          "error",
          new TransportError("INTERNAL_ERROR", "WebSocket 运行时异常", event),
        );
        return;
      }

      this.releaseSocket(socket);
      this.emitUnexpectedDisconnect(event);
    });
  };

  private readonly handleClose = (event: CloseEvent): void => {
    const socket = this.socket;
    if (socket === undefined) {
      return;
    }

    const details: CloseDetails = {
      code: event.code,
      reason: normalizeCloseReason(event.reason),
    };

    this.releaseSocket(socket);

    if (this.lifecycle.currentState === "disconnecting") {
      this.finishDisconnectSuccess(details);
      return;
    }

    if (this.lifecycle.currentState === "connecting") {
      this.finishConnectFailure(
        new TransportError("CONNECT_FAILED", "WebSocket 连接失败", event),
        details,
      );
      return;
    }

    if (this.lifecycle.currentState !== "connected") {
      return;
    }

    this.emitUnexpectedDisconnect(event, details);
  };

  private cleanupSocket(socket: WebSocket): void {
    this.clearConnectTimeout();
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId === undefined) {
      return;
    }

    clearTimeout(this.connectTimeoutId);
    this.connectTimeoutId = undefined;
  }

  private getOpenSocketForSend(): WebSocket {
    const socket = this.socket;
    if (
      this.lifecycle.currentState !== "connected" ||
      socket === undefined ||
      socket.readyState !== WebSocket.OPEN
    ) {
      throw new TransportError(
        "SEND_FAILED",
        "当前连接未处于 connected 状态，无法发送消息",
      );
    }

    return socket;
  }

  private createSocket(): WebSocket {
    const WebSocketConstructor = WebSocket as unknown as WebSocketConstructorLike;
    const protocols = this.options.protocols;

    if (protocols !== undefined) {
      return new WebSocketConstructor(this.options.url, protocols);
    }

    return new WebSocketConstructor(this.options.url);
  }

  private emit<K extends keyof TransportEvents>(
    event: K,
    ...args: Parameters<TransportEvents[K]>
  ): void {
    if (event === "error" && this.emitter.listenerCount("error") === 0) {
      return;
    }

    this.emitter.emit(event, ...(args as unknown[]));
  }
}
