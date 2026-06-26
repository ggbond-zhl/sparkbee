import type { ServerConfig } from "../config/env";
import type { Database } from "../db";
import { PostgresEventRepository } from "../repositories/postgres-event.repository";
import { PostgresStationRepository } from "../repositories/postgres-station.repository";
import { PostgresTransactionRepository } from "../repositories/postgres-transaction.repository";
import { AuthService } from "./auth.service";
import { ProtocolEventLedger } from "./protocol-event-ledger";
import { ProtocolEventProjection } from "./protocol-event-projection";
import { StationService } from "./station.service";

export interface Services {
  auth: AuthService;
  events: ProtocolEventLedger;
  stations: StationService;
}

export function createServices(config: ServerConfig, db: Database): Services {
  const stationRepository = new PostgresStationRepository(db);
  const eventRepository = new PostgresEventRepository(db);
  const transactionRepository = new PostgresTransactionRepository(db);
  const auth = new AuthService(config.adminPassword, config.sessionSecret);
  const events = new ProtocolEventLedger(eventRepository, config);
  const eventProjection = new ProtocolEventProjection(stationRepository, events);
  const stations = new StationService(
    stationRepository,
    transactionRepository,
    eventProjection,
  );

  return {
    auth,
    events,
    stations
  };
}
