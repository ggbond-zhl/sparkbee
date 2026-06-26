import type { ServerConfig } from "../config/env";
import type { Database } from "../db";
import { PostgresEventRepository } from "../repositories/postgres-event.repository";
import { PostgresChargingPointRepository } from "../repositories/postgres-charging-point.repository";
import { PostgresTransactionRepository } from "../repositories/postgres-transaction.repository";
import { AuthService } from "./auth.service";
import { ProtocolEventLedger } from "./protocol-event-ledger";
import { ProtocolEventProjection } from "./protocol-event-projection";
import { ChargingPointService } from "./charging-point.service";

export interface Services {
  auth: AuthService;
  events: ProtocolEventLedger;
  chargingPoints: ChargingPointService;
}

export function createServices(config: ServerConfig, db: Database): Services {
  const chargingPointRepository = new PostgresChargingPointRepository(db);
  const eventRepository = new PostgresEventRepository(db);
  const transactionRepository = new PostgresTransactionRepository(db);
  const auth = new AuthService(config.adminPassword, config.sessionSecret);
  const events = new ProtocolEventLedger(eventRepository, config);
  const eventProjection = new ProtocolEventProjection(chargingPointRepository, events);
  const chargingPoints = new ChargingPointService(
    chargingPointRepository,
    transactionRepository,
    eventProjection,
  );

  return {
    auth,
    events,
    chargingPoints
  };
}
