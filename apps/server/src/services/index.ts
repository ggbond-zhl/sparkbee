import type { ServerConfig } from "../config/env";
import type { Database } from "../db";
import { PostgresEventRepository } from "../repositories/postgres-event.repository";
import { PostgresStationRepository } from "../repositories/postgres-station.repository";
import { PostgresTransactionRepository } from "../repositories/postgres-transaction.repository";
import { AuthService } from "./auth.service";
import { EventService } from "./event.service";
import { ProtocolEventProjection } from "./protocol-event-projection";
import { RuntimeService } from "./runtime.service";
import { StationService } from "./station.service";

export interface Services {
  auth: AuthService;
  events: EventService;
  stations: StationService;
}

export function createServices(config: ServerConfig, db: Database): Services {
  const stationRepository = new PostgresStationRepository(db);
  const eventRepository = new PostgresEventRepository(db);
  const transactionRepository = new PostgresTransactionRepository(db);
  const auth = new AuthService(config.adminPassword, config.sessionSecret);
  const events = new EventService(eventRepository, config);
  const eventProjection = new ProtocolEventProjection(stationRepository, events);
  const runtime = new RuntimeService(stationRepository, eventProjection);
  const stations = new StationService(stationRepository, runtime, transactionRepository);

  return {
    auth,
    events,
    stations
  };
}
