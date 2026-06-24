import { createDeferred, type Deferred } from "../../../shared/deferred";
import type { TransportError } from "../types";

export type TransportState =
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected";

/** 只维护 transport 生命周期状态与 connect/disconnect promise。 */
export class TransportLifecycleMachine {
  private state: TransportState = "disconnected";
  private connectOperation?: Deferred<void>;
  private disconnectOperation?: Deferred<void>;

  get currentState(): TransportState {
    return this.state;
  }

  get connectPromise(): Promise<void> | undefined {
    return this.connectOperation?.promise;
  }

  get disconnectPromise(): Promise<void> | undefined {
    return this.disconnectOperation?.promise;
  }

  startConnect(): Deferred<void> {
    if (this.state === "connecting" && this.connectOperation !== undefined) {
      return this.connectOperation;
    }

    const operation = createDeferred<void>();
    this.connectOperation = operation;
    this.state = "connecting";
    return operation;
  }

  startDisconnect(): Deferred<void> {
    if (
      this.state === "disconnecting" &&
      this.disconnectOperation !== undefined
    ) {
      return this.disconnectOperation;
    }

    const operation = createDeferred<void>();
    this.disconnectOperation = operation;
    this.state = "disconnecting";
    return operation;
  }

  interruptConnectWithDisconnect(error: TransportError): Deferred<void> {
    const operation = this.startDisconnect();

    this.connectOperation?.reject(error);
    this.connectOperation = undefined;
    this.state = "disconnecting";

    return operation;
  }

  completeConnect(): boolean {
    const operation = this.connectOperation;
    if (operation === undefined || this.state !== "connecting") {
      return false;
    }

    this.connectOperation = undefined;
    this.state = "connected";
    operation.resolve();
    return true;
  }

  failConnect(error: TransportError): boolean {
    const operation = this.connectOperation;
    if (operation === undefined) {
      return false;
    }

    this.connectOperation = undefined;
    this.state = "disconnected";
    operation.reject(error);
    return true;
  }

  completeDisconnect(): boolean {
    const operation = this.disconnectOperation;
    if (operation === undefined) {
      return false;
    }

    this.disconnectOperation = undefined;
    this.state = "disconnected";
    operation.resolve();
    return true;
  }

  failDisconnect(error: TransportError): boolean {
    const operation = this.disconnectOperation;
    if (operation === undefined) {
      return false;
    }

    this.disconnectOperation = undefined;
    this.state = "disconnected";
    operation.reject(error);
    return true;
  }

  moveToDisconnected(): void {
    this.state = "disconnected";
  }
}
