export interface EventRecord {
  id: string;
  stationId: string | null;
  type: string;
  payload: unknown;
  protocolMessage: boolean;
  occurredAt: Date;
}

export interface CreateEventInput {
  stationId?: string | null;
  type: string;
  payload: unknown;
  protocolMessage?: boolean;
  occurredAt?: Date;
}

export interface EventRepository {
  append(input: CreateEventInput): Promise<EventRecord>;
  listByStation(stationId: string, options: { after?: string; limit: number }): Promise<EventRecord[]>;
  trimStationEvents(stationId: string, keep: number): Promise<void>;
}
