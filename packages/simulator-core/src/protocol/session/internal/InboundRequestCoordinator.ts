import type { IValidator, RequestMessage } from "../../types";
import type { InboundRequest, SessionDiagnostic } from "../types";
import { SessionError } from "../types";
import {
  InboundRequestRegistry,
  type InboundRequestRegistration,
} from "./InboundRequestRegistry";
import { ProtocolMessageSender } from "./ProtocolMessageSender";
import { buildValidationMessage, runValidation } from "./validation";

type InboundRequestCoordinatorOptions = {
  validator: IValidator;
  inboundResponseTimeoutMs: number;
  messageSender: ProtocolMessageSender;
  emitInboundRequest(request: InboundRequest): void;
  emitSessionDiagnostic(diagnostic: SessionDiagnostic): void;
};

type InboundReplyContext = {
  action: string;
  messageId: string;
};

/** 负责入站请求的校验、回复和兜底失败诊断。 */
export class InboundRequestCoordinator {
  private readonly inboundRequests: InboundRequestRegistry;

  constructor(private readonly options: InboundRequestCoordinatorOptions) {
    this.inboundRequests = new InboundRequestRegistry(
      options.inboundResponseTimeoutMs,
    );
  }

  handleDisconnected(): void {
    this.inboundRequests.invalidateAll();
  }

  async handleInboundRequest(message: RequestMessage): Promise<void> {
    const replyContext = this.createReplyContext(message);
    const validationAttempt = runValidation(
      this.options.validator,
      message.action,
      message.payload,
      "request",
    );

    if (validationAttempt.kind === "internal_error") {
      await this.sendAutomaticCallError(
        replyContext,
        "InternalError",
        "入站请求校验发生内部异常",
        validationAttempt.cause,
      );
      return;
    }

    if (validationAttempt.kind === "invalid") {
      await this.sendAutomaticCallError(
        replyContext,
        "FormationViolation",
        buildValidationMessage(
          "入站请求 schema 校验失败",
          validationAttempt.issues,
        ),
        validationAttempt.issues,
      );
      return;
    }

    const inboundRequest = this.inboundRequests.create(
      this.createRegistration(message, replyContext),
    );
    this.options.emitInboundRequest(inboundRequest);
  }

  private createRegistration(
    message: RequestMessage,
    replyContext: InboundReplyContext,
  ): InboundRequestRegistration {
    return {
      action: message.action,
      payload: message.payload,
      messageId: replyContext.messageId,
      onRespond: async (payload) => {
        await this.handleInboundResponse(replyContext, payload);
      },
      onReject: async (errorCode, errorMessage, details) => {
        await this.sendCallError(
          replyContext,
          errorCode,
          errorMessage,
          details,
        );
      },
      onTimeout: () => {
        void this.handleInboundRequestTimeout(replyContext);
      },
    };
  }

  private async handleInboundRequestTimeout(
    replyContext: InboundReplyContext,
  ): Promise<void> {
    await this.sendAutomaticCallError(
      replyContext,
      "InternalError",
      "入站请求在超时前未完成回复",
    );
  }

  private async sendAutomaticCallError(
    replyContext: InboundReplyContext,
    errorCode: string,
    errorMessage: string,
    errorDetails?: unknown,
  ): Promise<void> {
    try {
      await this.sendCallError(
        replyContext,
        errorCode,
        errorMessage,
        errorDetails,
      );
    } catch (cause) {
      this.options.emitSessionDiagnostic(
        this.createReplyFailureDiagnostic(replyContext, cause),
      );
    }
  }

  private async handleInboundResponse(
    replyContext: InboundReplyContext,
    payload: unknown,
  ): Promise<void> {
    const validationAttempt = runValidation(
      this.options.validator,
      replyContext.action,
      payload,
      "response",
    );

    if (validationAttempt.kind === "internal_error") {
      await this.sendCallError(
        replyContext,
        "InternalError",
        "入站响应校验发生内部异常",
        validationAttempt.cause,
      );
      return;
    }

    if (validationAttempt.kind === "invalid") {
      await this.sendCallError(
        replyContext,
        "InternalError",
        buildValidationMessage(
          "入站响应 schema 校验失败",
          validationAttempt.issues,
        ),
        validationAttempt.issues,
      );
      return;
    }

    await this.sendCallResult(replyContext, payload);
  }

  private async sendCallResult(
    replyContext: InboundReplyContext,
    payload: unknown,
  ): Promise<void> {
    await this.options.messageSender.send({
      kind: "response",
      messageId: replyContext.messageId,
      action: replyContext.action,
      payload,
      meta: this.createOutboundMeta(),
    });
  }

  private async sendCallError(
    replyContext: InboundReplyContext,
    errorCode: string,
    errorMessage: string,
    errorDetails?: unknown,
  ): Promise<void> {
    await this.options.messageSender.send({
      kind: "error",
      messageId: replyContext.messageId,
      action: replyContext.action,
      errorCode,
      errorMessage,
      errorDetails: errorDetails ?? {},
      meta: this.createOutboundMeta(),
    });
  }

  private createReplyContext(message: RequestMessage): InboundReplyContext {
    return {
      action: message.action,
      messageId: message.messageId,
    };
  }

  private createOutboundMeta() {
    return { direction: "outbound" as const };
  }

  private createReplyFailureDiagnostic(
    replyContext: InboundReplyContext,
    cause: unknown,
  ): SessionDiagnostic {
    return {
      source: "inbound_request",
      action: replyContext.action,
      messageId: replyContext.messageId,
      error: new SessionError(
        "INBOUND_REQUEST_REPLY_FAILED",
        "入站请求自动回复失败",
        cause,
      ),
    };
  }
}
