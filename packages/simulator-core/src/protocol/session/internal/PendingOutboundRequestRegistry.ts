import type { OutboundRequestResult } from "../types";
import { SessionError } from "../types";
import { createDeferred, type Deferred } from "../../../shared/deferred";

type PendingOutboundRequestRecord = {
  action: string;
  timeoutId: ReturnType<typeof setTimeout>;
  deferred: Deferred<OutboundRequestResult>;
};

type PendingOutboundRequestRegistryOptions = {
  onTimeout?(messageId: string, action: string): void;
  onDisconnected?(messageId: string, action: string): void;
};

export type PendingOutboundRequestHandle = {
  action: string;
  resolve(value: OutboundRequestResult): void;
  reject(reason?: unknown): void;
};

/** 维护出站请求的等待态、超时和断线清理。 */
export class PendingOutboundRequestRegistry {
  private readonly pendingOutboundRequests = new Map<string, PendingOutboundRequestRecord>();

  constructor(
    private readonly options: PendingOutboundRequestRegistryOptions = {},
  ) {}

  register(messageId: string, action: string, timeoutMs: number): Promise<OutboundRequestResult> {
    const deferred = createDeferred<OutboundRequestResult>();
    // registry 只负责状态管理，真正的失败由调用方在返回的 promise 上感知。
    void deferred.promise.catch(() => {});
    const timeoutId = setTimeout(() => {
      const handle = this.claim(messageId);
      if (handle === undefined) {
        return;
      }

      this.options.onTimeout?.(messageId, handle.action);
      handle.reject(
        new SessionError(
          "OUTBOUND_REQUEST_TIMEOUT",
          `等待 ${action} 响应超时`,
        ),
      );
    }, timeoutMs);

    this.pendingOutboundRequests.set(messageId, {
      action,
      timeoutId,
      deferred,
    });

    return deferred.promise;
  }

  claim(messageId: string): PendingOutboundRequestHandle | undefined {
    const record = this.pendingOutboundRequests.get(messageId);
    if (record === undefined) {
      return undefined;
    }

    this.pendingOutboundRequests.delete(messageId);
    clearTimeout(record.timeoutId);

    return {
      action: record.action,
      resolve: record.deferred.resolve,
      reject: record.deferred.reject,
    };
  }

  reject(messageId: string, error: SessionError): boolean {
    const handle = this.claim(messageId);
    if (handle === undefined) {
      return false;
    }

    handle.reject(error);
    return true;
  }

  rejectAllDisconnected(): void {
    const pendingEntries = Array.from(this.pendingOutboundRequests.entries());

    for (const [messageId] of pendingEntries) {
      const handle = this.claim(messageId);
      if (handle === undefined) {
        continue;
      }

      this.options.onDisconnected?.(messageId, handle.action);
      handle.reject(
        new SessionError(
          "OUTBOUND_REQUEST_DISCONNECTED",
          "连接已断开，未收到响应",
        ),
      );
    }
  }
}
