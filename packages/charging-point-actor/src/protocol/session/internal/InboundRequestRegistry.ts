import type { InboundRequest } from "../types";
import { SessionError } from "../types";

type InboundRequestContext = {
  messageId: string;
  settled: boolean;
  timeoutId?: ReturnType<typeof setTimeout>;
  invalidatedError?: SessionError;
};

export type InboundRequestRegistration = {
  action: string;
  payload: unknown;
  messageId: string;
  onRespond(payload: unknown): Promise<void>;
  onReject(errorCode: string, errorMessage: string, details?: unknown): Promise<void>;
  onTimeout(): void;
};

/** 维护入站请求的一次性回复权、超时和断线失效状态。 */
export class InboundRequestRegistry {
  private readonly requests = new Map<string, InboundRequestContext>();

  constructor(private readonly timeoutMs: number) {}

  create(registration: InboundRequestRegistration): InboundRequest {
    if (this.requests.has(registration.messageId)) {
      throw new SessionError(
        "INTERNAL_ERROR",
        "入站请求 messageId 已存在，不能重复注册",
      );
    }

    const context = this.createContext(
      registration.messageId,
      registration.onTimeout,
    );

    return {
      action: registration.action,
      payload: registration.payload,
      messageId: registration.messageId,
      respond: async (payload) => {
        this.claim(context);
        await registration.onRespond(payload);
      },
      reject: async (errorCode, errorMessage, details) => {
        this.claim(context);
        await registration.onReject(errorCode, errorMessage, details);
      },
    };
  }

  invalidateAll(): void {
    const invalidationError = new SessionError(
      "INTERNAL_ERROR",
      "入站请求已因连接断开失效",
    );

    for (const context of this.requests.values()) {
      if (context.timeoutId !== undefined) {
        clearTimeout(context.timeoutId);
        context.timeoutId = undefined;
      }

      context.invalidatedError = invalidationError;
    }

    this.requests.clear();
  }

  private createContext(
    messageId: string,
    onTimeout: () => void,
  ): InboundRequestContext {
    const context: InboundRequestContext = {
      messageId,
      settled: false,
    };

    context.timeoutId = setTimeout(() => {
      if (context.settled || context.invalidatedError !== undefined) {
        return;
      }

      this.claim(context);
      onTimeout();
    }, this.timeoutMs);

    this.requests.set(messageId, context);
    return context;
  }

  // 先占有回复权，再执行发送，才能避免超时和重复回复竞争同一请求。
  private claim(context: InboundRequestContext): void {
    if (context.invalidatedError !== undefined) {
      throw context.invalidatedError;
    }

    if (context.settled) {
      throw new SessionError("INTERNAL_ERROR", "入站请求已完成回复，不能重复回复");
    }

    context.settled = true;
    if (context.timeoutId !== undefined) {
      clearTimeout(context.timeoutId);
      context.timeoutId = undefined;
    }

    this.requests.delete(context.messageId);
  }
}
