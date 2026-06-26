import { TransportError, type RawMessage } from "../types";

// 复制二进制消息，避免上层持有可变底层缓冲区的别名。
export function normalizeRawMessage(data: unknown): RawMessage {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }

  if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
    const normalized = new Uint8Array(data.byteLength);
    normalized.set(new Uint8Array(data));
    return normalized;
  }

  if (ArrayBuffer.isView(data)) {
    const normalized = new Uint8Array(data.byteLength);
    normalized.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return normalized;
  }

  throw new TransportError(
    "INTERNAL_ERROR",
    "收到不支持的 WebSocket 消息类型",
    data,
  );
}
