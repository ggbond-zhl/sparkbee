import type { ITransport } from "../../transport";
import type { SessionOfflineReason } from "../types";
import { SessionError } from "../types";
import type { Deferred } from "../../../shared/deferred";
import { SessionReconnectPolicy } from "./SessionReconnectPolicy";
import { SessionLifecycleMachine } from "./SessionLifecycleMachine";

type SessionReconnectControllerOptions = {
  lifecycle: SessionLifecycleMachine;
  transport: ITransport;
  reconnectPolicy: SessionReconnectPolicy;
  emitOnline(): void;
  emitReconnecting(attempt: number, error?: SessionError): void;
  emitOffline(reason: SessionOfflineReason): void;
};

/** 负责运行自动重连循环，并在成功或耗尽后收敛状态。 */
export class SessionReconnectController {
  constructor(private readonly options: SessionReconnectControllerOptions) {}

  start(cause?: unknown): void {
    const operation = this.options.lifecycle.beginReconnect();
    // 重连在后台运行；这里本地兜底，避免耗尽时出现未处理拒绝。
    void operation.promise.catch(() => {});
    const maxRetries = this.options.reconnectPolicy.getMaxRetries();
    if (maxRetries <= 0) {
      this.finishExhausted(operation, cause);
      return;
    }

    this.scheduleAttempt(operation, 1, this.toSessionError(cause));
  }

  private scheduleAttempt(
    operation: Deferred<void>,
    attempt: number,
    error?: SessionError,
  ): void {
    if (
      this.options.lifecycle.currentPhase !== "reconnecting" ||
      this.options.lifecycle.reconnectPromise !== operation.promise
    ) {
      return;
    }

    this.options.emitReconnecting(attempt, error);
    const delayMs = this.options.reconnectPolicy.getDelayMs(attempt);
    this.options.lifecycle.scheduleReconnect(delayMs, () => {
      void this.runAttempt(operation, attempt);
    });
  }

  private async runAttempt(
    operation: Deferred<void>,
    attempt: number,
  ): Promise<void> {
    if (
      this.options.lifecycle.currentPhase !== "reconnecting" ||
      this.options.lifecycle.reconnectPromise !== operation.promise
    ) {
      return;
    }

    this.options.lifecycle.clearReconnectTimer();
    try {
      await this.options.transport.connect();
      if (!this.options.lifecycle.completeReconnect(operation)) {
        return;
      }

      this.options.emitOnline();
    } catch (cause) {
      if (
        this.options.lifecycle.currentPhase !== "reconnecting" ||
        this.options.lifecycle.reconnectPromise !== operation.promise
      ) {
        return;
      }

      if (attempt >= this.options.reconnectPolicy.getMaxRetries()) {
        this.finishExhausted(operation, cause);
        return;
      }

      this.scheduleAttempt(operation, attempt + 1, this.toSessionError(cause));
    }
  }

  private finishExhausted(operation: Deferred<void>, cause?: unknown): void {
    if (
      !this.options.lifecycle.exhaustReconnect(
        operation,
        new SessionError("RECONNECT_EXHAUSTED", "自动重连次数耗尽", cause),
      )
    ) {
      return;
    }

    this.options.emitOffline("reconnect_exhausted");
  }

  private toSessionError(cause: unknown): SessionError | undefined {
    if (cause === undefined) {
      return undefined;
    }

    if (cause instanceof SessionError) {
      return cause;
    }

    return new SessionError("CONNECT_FAILED", "建立底层链路失败", cause);
  }
}
