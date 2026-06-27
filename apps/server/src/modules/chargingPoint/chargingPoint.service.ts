import type {
  CreateChargingPointRequest,
  ListChargingPointsQuery,
  UpdateChargingPointRequest,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ChargingPointRepository } from "./chargingPoint.repo";

export function createChargingPointService(database: ServerDatabase) {
  return new ChargingPointService(new ChargingPointRepository(database));
}

export class ChargingPointService {
  constructor(private readonly repository: ChargingPointRepository) {}

  create(input: CreateChargingPointRequest) {
    return this.repository.create(input);
  }

  list(query: ListChargingPointsQuery) {
    return this.repository.list(query);
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  update(id: string, input: UpdateChargingPointRequest) {
    return this.repository.update(id, input);
  }

  softDelete(id: string) {
    return this.repository.softDelete(id);
  }
}
