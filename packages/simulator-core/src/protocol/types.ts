import type { RawMessage } from "./transport";

export type DecodeResult =
  | { success: true; message: ProtocolMessage }
  | { success: false; error: ProtocolError };

/**
 * `decode` 只负责外层帧结构解析，不能在内部隐式耦合 schema 校验。
 * 调用方需要显式串联 `validate`，避免把解析失败与 schema 失败混在同一阶段处理。
 */
export interface ICodec {
  /**
   * @param msg transport 层透传的原始消息帧
   * @returns 成功时返回协议消息，失败时返回协议错误
   */
  decode(msg: RawMessage): DecodeResult;

  /**
   * @param msg 结构合法的协议消息
   * @returns 可直接发送到 transport 层的原始消息帧
   * @throws {ProtocolError} 消息壳结构不完整或不满足编码前提时抛出
   */
  encode(msg: ProtocolMessage): RawMessage;
}

export type ValidationDirection = "request" | "response";

export type ValidationIssue = {
  path: (string | number)[];
  message: string;
  code: string;
};

export type ValidationResult =
  | { success: true }
  | { success: false; issues: ValidationIssue[] };

export interface IValidator {
  /**
   * @param action schema 注册表中的动作名
   * @param payload 待校验的消息体
   * @param direction 校验方向，用于区分 request / response schema
   * @returns schema 合法性校验结果
   * @throws {ProtocolError} validator 内部异常时抛出
   */
  validate(
    action: string,
    payload: unknown,
    direction: ValidationDirection,
  ): ValidationResult;
}

export type RequestMessage = {
  kind: "request";
  messageId: string;
  action: string;
  payload: unknown;
  meta?: Meta;
};

export type ResponseMessage = {
  kind: "response";
  messageId: string;
  payload: unknown;
  /**
   * 由 session 根据 pending outboundRequest 匹配后回填。
   * protocol 层 decode 时不负责恢复 action 上下文。
   */
  action?: string;
  meta?: Meta;
};

export type ErrorMessage = {
  kind: "error";
  messageId: string;
  errorCode: string;
  errorMessage: string;
  errorDetails: unknown;
  /**
   * 由 session 根据 pending outboundRequest 匹配后回填。
   * protocol 层 decode 时不负责恢复 action 上下文。
   */
  action?: string;
  meta?: Meta;
};

export type Meta = {
  raw?: RawMessage;
  receivedAt?: Date;
  direction?: "inbound" | "outbound";
};

export type ProtocolMessage =
  | RequestMessage
  | ResponseMessage
  | ErrorMessage;

export type ProtocolErrorCode =
  | "DECODE_ERROR"
  | "ENCODE_ERROR"
  | "VALIDATE_ERROR"
  | "INTERNAL_ERROR";

/**
 * protocol 层只向上层暴露统一错误模型，避免调用方依赖具体编解码器或校验器实现细节。
 * `cause` 保留原始异常，便于日志链路继续追踪根因。
 */
export class ProtocolError extends Error {
  override readonly name = "ProtocolError";
  readonly code: ProtocolErrorCode;
  override readonly cause: unknown;

  /**
   * @param code protocol 层稳定错误码
   * @param message 面向日志与调试的错误描述
   * @param cause 原始异常或底层失败原因
   */
  constructor(code: ProtocolErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.cause = cause;
  }
}
