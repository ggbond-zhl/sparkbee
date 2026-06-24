import type { ICodec, ProtocolMessage } from "../../types";
import type { RawMessage, ITransport } from "../../transport";
import { SessionError } from "../types";

type ProtocolMessageSenderOptions = {
  onSent?: (message: ProtocolMessage) => void;
};

/** 统一处理协议消息的编码与发送，并把底层失败折叠成 `SessionError`。 */
export class ProtocolMessageSender {
  constructor(
    private readonly codec: ICodec,
    private readonly transport: ITransport,
    private readonly options: ProtocolMessageSenderOptions = {},
  ) {}

  encode(message: ProtocolMessage, errorMessage = "协议消息编码失败"): RawMessage {
    try {
      return this.codec.encode(message);
    } catch (cause) {
      throw new SessionError("ENCODE_ERROR", errorMessage, cause);
    }
  }

  async sendRaw(
    rawMessage: RawMessage,
    errorMessage = "协议消息发送失败",
  ): Promise<void> {
    try {
      await this.transport.send(rawMessage);
    } catch (cause) {
      throw new SessionError("INTERNAL_ERROR", errorMessage, cause);
    }
  }

  async sendPrepared(
    rawMessage: RawMessage,
    errorMessage = "协议消息发送失败",
  ): Promise<void> {
    await this.sendRaw(rawMessage, errorMessage);
  }

  async sendPreparedMessage(
    message: ProtocolMessage,
    rawMessage: RawMessage,
    errorMessage = "协议消息发送失败",
  ): Promise<void> {
    await this.sendRaw(rawMessage, errorMessage);
    this.options.onSent?.(message);
  }

  async send(
    message: ProtocolMessage,
    options?: {
      encodeErrorMessage?: string;
      sendErrorMessage?: string;
    },
  ): Promise<void> {
    const rawMessage = this.encode(message, options?.encodeErrorMessage);
    await this.sendPreparedMessage(
      message,
      rawMessage,
      options?.sendErrorMessage,
    );
  }
}
