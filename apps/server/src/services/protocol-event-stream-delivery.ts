import type { EventRecord } from "../repositories/event.repository";

export interface ProtocolEventStreamSource {
  subscribe(listener: (event: EventRecord) => void): () => void;
}

export class ProtocolEventStreamDelivery {
  private readonly encoder = new TextEncoder();

  stream(events: ProtocolEventStreamSource, signal: AbortSignal): Response {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let closed = false;
        const send = (name: string, data: unknown, id?: string) => {
          if (closed) {
            return;
          }

          const lines = [
            id === undefined ? undefined : `id: ${id}`,
            `event: ${name}`,
            `data: ${JSON.stringify(data)}`,
            ""
          ].filter((line): line is string => line !== undefined);
          controller.enqueue(this.encoder.encode(`${lines.join("\n")}\n`));
        };

        send("ready", { ok: true });
        const unsubscribe = events.subscribe((event) => {
          send("event", event, event.id);
        });

        signal.addEventListener("abort", () => {
          closed = true;
          unsubscribe();
          controller.close();
        }, { once: true });
      }
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream"
      }
    });
  }
}
