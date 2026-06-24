import type { ServerConfig } from "../config/env";
import type { CreateEventInput, EventRecord, EventRepository } from "../repositories/event.repository";
import { ProtocolEventHistory } from "./protocol-event-history";

export type EventListener = (event: EventRecord) => void;

export class EventService {
  private readonly listeners = new Set<EventListener>();
  private readonly history: ProtocolEventHistory;

  constructor(
    events: EventRepository,
    config: Pick<ServerConfig, "eventLogRetentionPerStation">,
  ) {
    this.history = new ProtocolEventHistory(events, config);
  }

  async append(input: CreateEventInput): Promise<EventRecord> {
    const event = await this.history.append(input);

    for (const listener of [...this.listeners]) {
      listener(event);
    }

    return event;
  }

  listByStation(stationId: string, options: { after?: string; limit: number }): Promise<EventRecord[]> {
    return this.history.listByStation(stationId, options);
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
