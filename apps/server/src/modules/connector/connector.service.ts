import type {
  CreateConnectorRequest,
  UpdateConnectorRequest,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ConnectorRepository } from "./connector.repo";

export function createConnectorService(database: ServerDatabase) {
  return new ConnectorService(new ConnectorRepository(database));
}

export class ConnectorService {
  constructor(private readonly repository: ConnectorRepository) {}

  create(chargingPointId: string, input: CreateConnectorRequest) {
    return this.repository.create(chargingPointId, input);
  }

  list(chargingPointId: string) {
    return this.repository.list(chargingPointId);
  }

  get(chargingPointId: string, connectorId: string) {
    return this.repository.get(chargingPointId, connectorId);
  }

  update(
    chargingPointId: string,
    connectorId: string,
    input: UpdateConnectorRequest,
  ) {
    return this.repository.update(chargingPointId, connectorId, input);
  }

  softDelete(chargingPointId: string, connectorId: string) {
    return this.repository.softDelete(chargingPointId, connectorId);
  }
}
