import type { ServerConfig } from "../config/env";
import type {
  CreateEventInput,
  EventRecord,
  EventRepository
} from "../repositories/event.repository";

export class ProtocolEventHistory {
  constructor(
    private readonly events: EventRepository,
    private readonly config: Pick<ServerConfig, "eventLogRetentionPerStation">,
  ) {}

  async append(input: CreateEventInput): Promise<EventRecord> {
    const event = await this.events.append(input);

    if (event.stationId !== null) {
      void this.events.trimStationEvents(
        event.stationId,
        this.config.eventLogRetentionPerStation,
      );
    }

    return event;
  }

  listByStation(
    stationId: string,
    options: { after?: string; limit: number },
  ): Promise<EventRecord[]> {
    return this.events.listByStation(stationId, options);
  }
}
