import { EventEmitter } from "node:events";

import {
  ProtocolError,
  type DecodeResult,
  type ICodec,
  type IValidator,
  type ProtocolMessage,
  type ValidationDirection,
  type ValidationResult,
} from "../../../src/protocol/types.ts";
import { createDeferred, type Deferred } from "../../../src/shared/deferred.ts";
import {
  TransportError,
  type ITransport,
  type RawMessage,
  type TransportEvents,
  type TransportDisconnectedEvent,
} from "../../../src/protocol/transport/index.ts";

type ValidatorImplementation = (
  action: string,
  payload: unknown,
  direction: ValidationDirection,
) => ValidationResult;

export class MemoryTransport implements ITransport {
  private readonly emitter = new EventEmitter();

  readonly sentMessages: RawMessage[] = [];

  connectCalls = 0;
  disconnectCalls = 0;
  sendCalls = 0;

  connectImplementation: () => Promise<void> = async () => {};
  disconnectImplementation: () => Promise<void> = async () => {};
  sendImplementation: (message: RawMessage) => Promise<void> = async (
    message,
  ) => {
    this.sentMessages.push(message);
  };

  connect(): Promise<void> {
    this.connectCalls += 1;
    return this.connectImplementation();
  }

  disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    return this.disconnectImplementation();
  }

  send(message: RawMessage): Promise<void> {
    this.sendCalls += 1;
    return this.sendImplementation(message);
  }

  isConnected(): boolean {
    return false;
  }

  on<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emitError(error: TransportError): void {
    this.emitter.emit("error", error);
  }

  emitMessage(message: RawMessage): void {
    this.emitter.emit("message", message);
  }

  emitDisconnected(event: TransportDisconnectedEvent): void {
    this.emitter.emit("disconnected", event);
  }
}

export class ConfigurableCodec implements ICodec {
  decodeImplementation: (message: RawMessage) => DecodeResult = () => ({
    success: false,
    error: new ProtocolError("DECODE_ERROR", "decode not configured"),
  });

  encodeImplementation: (message: ProtocolMessage) => RawMessage = (message) =>
    JSON.stringify(message);

  decode(message: RawMessage): DecodeResult {
    return this.decodeImplementation(message);
  }

  encode(message: ProtocolMessage): RawMessage {
    return this.encodeImplementation(message);
  }
}

export function createValidator(
  implementation: ValidatorImplementation = () => ({ success: true }),
): IValidator {
  return {
    validate: implementation,
  };
}

export function createTransportError(
  code: ConstructorParameters<typeof TransportError>[0] = "INTERNAL_ERROR",
  message = "transport exploded",
  cause?: unknown,
): TransportError {
  return new TransportError(code, message, cause);
}

export function createDeferredPromise<T>(): Deferred<T> {
  return createDeferred<T>();
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
