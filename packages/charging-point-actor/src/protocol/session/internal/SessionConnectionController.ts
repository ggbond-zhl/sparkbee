import type { ITransport, TransportDisconnectedEvent } from "../../transport";
import type { ReconnectOptions, SessionOfflineReason } from "../types";
import { SessionError } from "../types";
import type { Deferred } from "../../../shared/deferred";
import { SessionReconnectPolicy } from "./SessionReconnectPolicy";
import { SessionReconnectController } from "./SessionReconnectController";
import {
  SessionLifecycleMachine,
  type SessionPhase,
} from "./SessionLifecycleMachine";

type SessionConnectionControllerOptions = {
  transport: ITransport;
  reconnectOptions: ReconnectOptions | undefined;
  resetMessagingState(): void;
  emitOnline(): void;
  emitOffline(reason: SessionOfflineReason): void;
  emitReconnecting(attempt: number, error?: SessionError): void;
  random?(): number;
};

/** 编排 connect、disconnect 和 reconnect 的状态转换。 */
export class SessionConnectionController {
  private readonly lifecycle = new SessionLifecycleMachine();
  private readonly reconnectController: SessionReconnectController;

  constructor(private readonly options: SessionConnectionControllerOptions) {
    this.reconnectController = new SessionReconnectController({
      lifecycle: this.lifecycle,
      transport: options.transport,
      reconnectPolicy: new SessionReconnectPolicy(
        options.reconnectOptions,
        options.random,
      ),
      emitOnline: options.emitOnline,
      emitReconnecting: options.emitReconnecting,
      emitOffline: options.emitOffline,
    });
  }

  get state() {
    return this.lifecycle.state;
  }

  get currentPhase(): SessionPhase {
    return this.lifecycle.currentPhase;
  }

  connect(): Promise<void> {
    switch (this.lifecycle.currentPhase) {
      case "connected":
        return Promise.resolve();
      case "connecting":
        return this.lifecycle.connectPromise!;
      case "reconnecting":
        return this.lifecycle.reconnectPromise!;
      case "disconnecting":
        return Promise.reject(
          new SessionError(
            "CONNECT_REJECTED",
            "disconnect() 尚未完成，无法重新发起连接",
          ),
        );
      case "idle":
        return this.startInitialConnect();
    }
  }

  disconnect(): Promise<void> {
    switch (this.lifecycle.currentPhase) {
      case "idle":
        return Promise.resolve();
      case "disconnecting":
        return this.lifecycle.disconnectPromise!;
      case "connecting":
        return this.startDisconnectDuringConnect();
      case "connected":
        return this.startDisconnectFromActiveSession();
      case "reconnecting":
        return this.startDisconnectDuringReconnect();
    }
  }

  isConnected(): boolean {
    return this.lifecycle.currentPhase === "connected";
  }

  handleTransportDisconnected(event: TransportDisconnectedEvent): void {
    if (this.lifecycle.currentPhase !== "connected") {
      return;
    }

    this.options.resetMessagingState();

    if (this.options.reconnectOptions !== undefined && !event.intentional) {
      this.reconnectController.start(event.cause);
      return;
    }

    this.lifecycle.moveToIdle();
    this.options.emitOffline(
      event.intentional ? "intentional" : "unexpected_disconnect",
    );
  }

  private startInitialConnect(): Promise<void> {
    const operation = this.lifecycle.beginInitialConnect();
    void this.runInitialConnect(operation);
    return operation.promise;
  }

  private async runInitialConnect(operation: Deferred<void>): Promise<void> {
    try {
      await this.options.transport.connect();
      if (!this.lifecycle.completeInitialConnect(operation)) {
        return;
      }

      this.options.emitOnline();
    } catch (cause) {
      const mappedError = this.mapConnectError(cause);
      if (!this.lifecycle.failInitialConnect(operation, mappedError)) {
        return;
      }

      if (this.options.reconnectOptions === undefined) {
        return;
      }

      this.reconnectController.start(mappedError);
      // 首连失败仍要立刻向调用方 reject，后台重连则留在内部继续执行。
      void this.lifecycle.reconnectPromise?.catch(() => {});
    }
  }

  private startDisconnectDuringConnect(): Promise<void> {
    const operation = this.lifecycle.beginDisconnect();
    this.lifecycle.abortInitialConnect(
      new SessionError("CONNECT_ABORTED", "进行中的 connect() 被 disconnect() 中断"),
    );

    void this.runDisconnect(operation, "intentional");
    return operation.promise;
  }

  private startDisconnectFromActiveSession(): Promise<void> {
    const operation = this.lifecycle.beginDisconnect();
    this.options.resetMessagingState();

    void this.runDisconnect(operation, "intentional");
    return operation.promise;
  }

  private startDisconnectDuringReconnect(): Promise<void> {
    this.lifecycle.clearReconnectTimer();
    this.lifecycle.abortReconnect();

    const operation = this.lifecycle.beginDisconnect();
    void this.runDisconnect(operation, "intentional");
    return operation.promise;
  }

  private async runDisconnect(
    operation: Deferred<void>,
    offlineReason?: SessionOfflineReason,
  ): Promise<void> {
    try {
      await this.options.transport.disconnect();
      if (!this.lifecycle.completeDisconnect(operation)) {
        return;
      }

      if (offlineReason !== undefined) {
        this.options.emitOffline(offlineReason);
      }
    } catch (cause) {
      if (
        !this.lifecycle.failDisconnect(
          operation,
          new SessionError("DISCONNECT_FAILED", "断开底层连接失败", cause),
        )
      ) {
        return;
      }

      if (offlineReason !== undefined) {
        this.options.emitOffline(offlineReason);
      }
    }
  }

  private mapConnectError(cause: unknown): SessionError {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      cause.code === "CONNECT_TIMEOUT"
    ) {
      return new SessionError("CONNECT_TIMEOUT", "连接底层链路超时", cause);
    }

    return new SessionError("CONNECT_FAILED", "建立底层链路失败", cause);
  }
}
