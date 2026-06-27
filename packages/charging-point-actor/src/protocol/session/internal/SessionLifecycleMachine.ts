import type { SessionConnectionState } from "../types";
import { SessionError } from "../types";
import { createDeferred, type Deferred } from "../../../shared/deferred";

export type SessionPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnecting";

/** 只维护 session 生命周期状态、操作 promise 和重连定时器。 */
export class SessionLifecycleMachine {
  private phase: SessionPhase = "idle";
  private connectOperation?: Deferred<void>;
  private reconnectOperation?: Deferred<void>;
  private disconnectOperation?: Deferred<void>;
  private reconnectTimerId?: ReturnType<typeof setTimeout>;

  get state(): SessionConnectionState {
    switch (this.phase) {
      case "connected":
        return "online";
      case "reconnecting":
        return "reconnecting";
      default:
        return "offline";
    }
  }

  get currentPhase(): SessionPhase {
    return this.phase;
  }

  get connectPromise(): Promise<void> | undefined {
    return this.connectOperation?.promise;
  }

  get reconnectPromise(): Promise<void> | undefined {
    return this.reconnectOperation?.promise;
  }

  get disconnectPromise(): Promise<void> | undefined {
    return this.disconnectOperation?.promise;
  }

  beginInitialConnect(): Deferred<void> {
    const operation = createDeferred<void>();
    this.connectOperation = operation;
    this.phase = "connecting";
    return operation;
  }

  completeInitialConnect(operation: Deferred<void>): boolean {
    if (this.connectOperation !== operation || this.phase !== "connecting") {
      return false;
    }

    this.connectOperation = undefined;
    this.phase = "connected";
    operation.resolve();
    return true;
  }

  failInitialConnect(operation: Deferred<void>, error: SessionError): boolean {
    if (this.connectOperation !== operation) {
      return false;
    }

    this.connectOperation = undefined;
    this.phase = "idle";
    operation.reject(error);
    return true;
  }

  abortInitialConnect(error: SessionError): void {
    this.connectOperation?.reject(error);
    this.connectOperation = undefined;
  }

  beginDisconnect(): Deferred<void> {
    const operation = createDeferred<void>();
    this.disconnectOperation = operation;
    this.phase = "disconnecting";
    return operation;
  }

  completeDisconnect(operation: Deferred<void>): boolean {
    if (this.disconnectOperation !== operation) {
      return false;
    }

    this.disconnectOperation = undefined;
    this.phase = "idle";
    operation.resolve();
    return true;
  }

  failDisconnect(operation: Deferred<void>, error: SessionError): boolean {
    if (this.disconnectOperation !== operation) {
      return false;
    }

    this.disconnectOperation = undefined;
    this.phase = "idle";
    operation.reject(error);
    return true;
  }

  beginReconnect(): Deferred<void> {
    const operation = createDeferred<void>();
    this.reconnectOperation = operation;
    this.phase = "reconnecting";
    return operation;
  }

  completeReconnect(operation: Deferred<void>): boolean {
    if (this.reconnectOperation !== operation || this.phase !== "reconnecting") {
      return false;
    }

    this.reconnectOperation = undefined;
    this.phase = "connected";
    operation.resolve();
    return true;
  }

  exhaustReconnect(operation: Deferred<void>, error: SessionError): boolean {
    if (this.reconnectOperation !== operation) {
      return false;
    }

    this.reconnectOperation = undefined;
    this.phase = "idle";
    operation.reject(error);
    return true;
  }

  abortReconnect(): void {
    this.reconnectOperation?.reject(
      new SessionError("CONNECT_ABORTED", "重连流程被 disconnect() 中断"),
    );
    this.reconnectOperation = undefined;
  }

  moveToIdle(): void {
    this.phase = "idle";
  }

  scheduleReconnect(delayMs: number, callback: () => void): void {
    this.clearReconnectTimer();
    this.reconnectTimerId = setTimeout(callback, delayMs);
  }

  clearReconnectTimer(): void {
    if (this.reconnectTimerId === undefined) {
      return;
    }

    clearTimeout(this.reconnectTimerId);
    this.reconnectTimerId = undefined;
  }
}
