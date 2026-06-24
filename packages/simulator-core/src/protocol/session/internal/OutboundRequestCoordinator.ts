import { randomUUID } from "node:crypto";

import type {
  ErrorMessage,
  IValidator,
  ProtocolMessage,
  ResponseMessage,
} from "../../types";
import type { RawMessage } from "../../transport";
import { createDeferred, type Deferred } from "../../../shared/deferred";
import type {
  OutboundRequestPolicy,
  OutboundRequestResult,
} from "../types";
import { SessionError } from "../types";
import { PendingOutboundRequestRegistry } from "./PendingOutboundRequestRegistry";
import { ProtocolMessageSender } from "./ProtocolMessageSender";
import { buildValidationMessage, runValidation } from "./validation";

type QueuedOutboundRequest = {
  action: string;
  payload: unknown;
  deferred: Deferred<OutboundRequestResult>;
};

type NormalizedInboundReply =
  | {
      kind: "response";
      action: string;
      messageId: string;
      payload: unknown;
    }
  | {
      kind: "error";
      action: string;
      messageId: string;
      errorCode: string;
      errorMessage: string;
      errorDetails: unknown;
    };

type OutboundRequestCoordinatorOptions = {
  validator: IValidator;
  messageSender: ProtocolMessageSender;
  outboundRequestTimeoutMs: number;
  outboundRequestPolicy: OutboundRequestPolicy;
  isConnected(): boolean;
  emitInboundProtocolMessage(message: ProtocolMessage): void;
};

/** 负责出站请求的校验、调度、等待态和回复归一化。 */
export class OutboundRequestCoordinator {
  private readonly pendingOutboundRequests: PendingOutboundRequestRegistry;
  private readonly outboundRequestQueue: QueuedOutboundRequest[] = [];

  private outboundRequestInFlight = false;

  constructor(private readonly options: OutboundRequestCoordinatorOptions) {
    this.pendingOutboundRequests = new PendingOutboundRequestRegistry();
  }

  request(action: string, payload: unknown): Promise<OutboundRequestResult> {
    if (!this.options.isConnected()) {
      return Promise.reject(this.createRequestRejectedError());
    }

    const validationError = this.validateOutboundRequest(action, payload);
    if (validationError !== undefined) {
      return Promise.reject(validationError);
    }

    if (this.options.outboundRequestPolicy === "serial") {
      return this.enqueue(action, payload);
    }

    return this.dispatch(action, payload);
  }

  handleInboundReply(message: ResponseMessage | ErrorMessage): void {
    const pendingOutboundRequest = this.pendingOutboundRequests.claim(
      message.messageId,
    );
    if (pendingOutboundRequest === undefined) {
      return;
    }

    const normalizedReply = this.createNormalizedInboundReply(
      message,
      pendingOutboundRequest.action,
    );
    this.options.emitInboundProtocolMessage(
      this.withMatchedAction(message, pendingOutboundRequest.action),
    );

    if (normalizedReply.kind === "error") {
      pendingOutboundRequest.resolve(this.toErrorResult(normalizedReply));
      return;
    }

    const validationError = this.validateInboundResponse(
      normalizedReply.action,
      normalizedReply.payload,
    );
    if (validationError instanceof SessionError) {
      pendingOutboundRequest.reject(validationError);
      return;
    }

    if (validationError !== undefined) {
      pendingOutboundRequest.resolve(
        this.createFormationViolationResult(validationError),
      );
      return;
    }

    pendingOutboundRequest.resolve({
      kind: "response",
      payload: normalizedReply.payload,
    });
  }

  handleDisconnected(): void {
    const queuedOutboundRequests = this.outboundRequestQueue.splice(0);
    for (const queuedOutboundRequest of queuedOutboundRequests) {
      queuedOutboundRequest.deferred.reject(
        new SessionError(
          "OUTBOUND_REQUEST_ABORTED",
          "请求在发送前因连接断开被取消",
        ),
      );
    }

    this.pendingOutboundRequests.rejectAllDisconnected();
  }

  private dispatch(
    action: string,
    payload: unknown,
  ): Promise<OutboundRequestResult> {
    if (!this.options.isConnected()) {
      return Promise.reject(this.createRequestAbortedError());
    }

    const message = this.createOutboundRequestMessage(action, payload);

    let rawMessage: RawMessage;
    try {
      rawMessage = this.options.messageSender.encode(message, "出站请求编码失败");
    } catch (cause) {
      return Promise.reject(cause);
    }

    const outboundRequestPromise = this.pendingOutboundRequests.register(
      message.messageId,
      action,
      this.options.outboundRequestTimeoutMs,
    );

    this.sendPreparedRequest(message, rawMessage);

    return outboundRequestPromise;
  }

  private enqueue(action: string, payload: unknown): Promise<OutboundRequestResult> {
    const deferred = createDeferred<OutboundRequestResult>();
    void deferred.promise.catch(() => {});
    this.outboundRequestQueue.push({ action, payload, deferred });
    this.processQueue();
    return deferred.promise;
  }

  // serial 模式下只有当前请求 settle 后，队列里的下一个请求才能继续发送。
  private processQueue(): void {
    if (
      this.options.outboundRequestPolicy !== "serial" ||
      this.outboundRequestInFlight
    ) {
      return;
    }

    const nextOutboundRequest = this.outboundRequestQueue.shift();
    if (nextOutboundRequest === undefined) {
      return;
    }

    this.outboundRequestInFlight = true;
    this.dispatch(nextOutboundRequest.action, nextOutboundRequest.payload)
      .then(
        nextOutboundRequest.deferred.resolve,
        nextOutboundRequest.deferred.reject,
      )
      .finally(() => {
        this.outboundRequestInFlight = false;
        this.processQueue();
      });
  }

  private validateOutboundRequest(
    action: string,
    payload: unknown,
  ): SessionError | undefined {
    const validationAttempt = runValidation(
      this.options.validator,
      action,
      payload,
      "request",
    );

    if (validationAttempt.kind === "internal_error") {
      return new SessionError(
        "INTERNAL_ERROR",
        "出站请求校验发生内部异常",
        validationAttempt.cause,
      );
    }

    if (validationAttempt.kind === "invalid") {
      return new SessionError(
        "VALIDATION_FAILED",
        "出站请求 schema 校验失败",
        validationAttempt.issues,
      );
    }

    return undefined;
  }

  private validateInboundResponse(
    action: string,
    payload: unknown,
  ): SessionError | Parameters<typeof buildValidationMessage>[1] | undefined {
    const validationAttempt = runValidation(
      this.options.validator,
      action,
      payload,
      "response",
    );

    if (validationAttempt.kind === "internal_error") {
      return new SessionError(
        "INTERNAL_ERROR",
        "入站响应校验发生内部异常",
        validationAttempt.cause,
      );
    }

    if (validationAttempt.kind === "invalid") {
      return validationAttempt.issues;
    }

    return undefined;
  }

  private createMessageId(): string {
    return randomUUID();
  }

  private createRequestRejectedError(): SessionError {
    return new SessionError(
      "OUTBOUND_REQUEST_REJECTED",
      "当前会话未在线，无法发送请求",
    );
  }

  private createRequestAbortedError(): SessionError {
    return new SessionError(
      "OUTBOUND_REQUEST_ABORTED",
      "请求在发送前因连接断开被取消",
    );
  }

  private createOutboundRequestMessage(action: string, payload: unknown) {
    const messageId = this.createMessageId();

    return {
      kind: "request" as const,
      messageId,
      action,
      payload,
      meta: {
        direction: "outbound" as const,
      },
    };
  }

  private sendPreparedRequest(
    message: ProtocolMessage,
    rawMessage: RawMessage,
  ): void {
    void this.options.messageSender
      .sendPreparedMessage(message, rawMessage, "发送出站请求失败")
      .catch((cause) => {
        this.pendingOutboundRequests.reject(
          message.messageId,
          this.toSessionError(cause, "发送出站请求失败"),
        );
      });
  }

  private createNormalizedInboundReply(
    message: ResponseMessage | ErrorMessage,
    action: string,
  ): NormalizedInboundReply {
    if (message.kind === "error") {
      return {
        kind: "error",
        action,
        messageId: message.messageId,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        errorDetails: message.errorDetails,
      };
    }

    return {
      kind: "response",
      action,
      messageId: message.messageId,
      payload: message.payload,
    };
  }

  private withMatchedAction(
    message: ResponseMessage | ErrorMessage,
    action: string,
  ): ResponseMessage | ErrorMessage {
    return {
      ...message,
      action,
    };
  }

  private toErrorResult(
    message: Extract<NormalizedInboundReply, { kind: "error" }>,
  ): OutboundRequestResult {
    return {
      kind: "error",
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      errorDetails: message.errorDetails,
    };
  }

  private createFormationViolationResult(
    issues: Parameters<typeof buildValidationMessage>[1],
  ): OutboundRequestResult {
    return {
      kind: "error",
      errorCode: "FormationViolation",
      errorMessage: buildValidationMessage("入站响应 schema 校验失败", issues),
      errorDetails: issues,
    };
  }

  private toSessionError(cause: unknown, message: string): SessionError {
    if (cause instanceof SessionError) {
      return cause;
    }

    return new SessionError("INTERNAL_ERROR", message, cause);
  }
}
