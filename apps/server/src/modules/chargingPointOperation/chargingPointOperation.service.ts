import type { ChargingPointOperationResponse } from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import {
  ChargingPointActorError,
  createChargingPointActor,
  type ChargingPointActor,
  type ChargingPointActorOptions,
  type ChargingPointActorStartResult,
} from "../../lib/chargingPointActor";
import { ChargingPointActorRegistry } from "../../lib/chargingPointActorRegistry";
import { ChargingPointEventStreamHub } from "../../lib/chargingPointEventStreamHub";
import { AppError } from "../../utils/errors";
import { toChargingPointActorOptions } from "./chargingPointActorOptions";
import { ChargingPointOperationRepository } from "./chargingPointOperation.repo";

export type ChargingPointActorFactory = (
  options: ChargingPointActorOptions,
) => ChargingPointActor;

export interface ChargingPointOperationServiceDependencies {
  chargingPointActorRegistry?: ChargingPointActorRegistry;
  chargingPointEventStreamHub?: ChargingPointEventStreamHub;
  createChargingPointActor?: ChargingPointActorFactory;
}

export function createChargingPointOperationService(
  database: ServerDatabase,
  dependencies: ChargingPointOperationServiceDependencies = {},
) {
  return new ChargingPointOperationService(
    new ChargingPointOperationRepository(database),
    dependencies,
  );
}

export class ChargingPointOperationService {
  private readonly registry: ChargingPointActorRegistry;
  private readonly eventStreamHub?: ChargingPointEventStreamHub;
  private readonly actorFactory: ChargingPointActorFactory;

  constructor(
    private readonly repository: ChargingPointOperationRepository,
    dependencies: ChargingPointOperationServiceDependencies = {},
  ) {
    this.registry =
      dependencies.chargingPointActorRegistry ?? new ChargingPointActorRegistry();
    this.eventStreamHub = dependencies.chargingPointEventStreamHub;
    this.actorFactory = dependencies.createChargingPointActor ?? createChargingPointActor;
  }

  async start(id: string): Promise<ChargingPointOperationResponse> {
    const chargingPoint = await this.repository.getOperationDetail(id);
    if (chargingPoint.connectors.length === 0) {
      throw new AppError(
        409,
        "CHARGING_POINT_NOT_RUNNABLE",
        "Charging point requires at least one connector",
      );
    }

    let entry: { actor: ChargingPointActor; created: boolean };
    try {
      entry = this.registry.acquire(id, () =>
        this.actorFactory(toChargingPointActorOptions(chargingPoint)),
      );
    } catch (error) {
      throw this.mapStartError(error);
    }

    if (!entry.created) {
      return this.toStatusResponse(id, entry.actor);
    }
    this.eventStreamHub?.attachActor(entry.actor);

    try {
      const result = await entry.actor.start();
      return this.toStartResponse(result);
    } catch (error) {
      this.registry.remove(id);
      this.eventStreamHub?.detachActor(id);
      await this.disposeQuietly(entry.actor);
      throw this.mapStartError(error);
    }
  }

  async stop(id: string): Promise<ChargingPointOperationResponse> {
    await this.repository.getOperationDetail(id);
    const actor = this.registry.remove(id);
    if (actor === undefined) {
      return this.toStoppedResponse(id);
    }

    try {
      await actor.stop();
      return this.toStoppedResponse(id);
    } catch (error) {
      throw this.mapStopError(error);
    } finally {
      this.eventStreamHub?.detachActor(id);
      await this.disposeQuietly(actor);
    }
  }

  async getStatus(id: string): Promise<ChargingPointOperationResponse> {
    await this.repository.getOperationDetail(id);
    return this.toStatusResponse(id, this.registry.get(id));
  }

  private toStatusResponse(
    chargingPointId: string,
    actor: ChargingPointActor | undefined,
  ): ChargingPointOperationResponse {
    return {
      chargingPointId,
      status: actor?.status ?? "stopped",
    };
  }

  private toStoppedResponse(chargingPointId: string): ChargingPointOperationResponse {
    return {
      chargingPointId,
      status: "stopped",
    };
  }

  private toStartResponse(
    result: ChargingPointActorStartResult,
  ): ChargingPointOperationResponse {
    return {
      chargingPointId: result.chargingPointId,
      status: result.chargingPointActorStatus,
      bootStatus: result.bootStatus,
      retryAfterSec: "retryAfterSec" in result ? result.retryAfterSec : undefined,
    };
  }

  private mapStartError(error: unknown): AppError {
    if (
      error instanceof ChargingPointActorError &&
      error.code === "CHARGING_POINT_ACTOR_PROTOCOL_UNSUPPORTED"
    ) {
      return new AppError(
        400,
        "CHARGING_POINT_PROTOCOL_UNSUPPORTED",
        "Charging point protocol is not supported",
      );
    }

    return new AppError(
      502,
      "CHARGING_POINT_START_FAILED",
      "Charging point start failed",
    );
  }

  private mapStopError(error: unknown): AppError {
    return new AppError(502, "CHARGING_POINT_STOP_FAILED", "Charging point stop failed");
  }

  private async disposeQuietly(actor: ChargingPointActor): Promise<void> {
    try {
      await actor.dispose();
    } catch {
      // 启停错误优先返回，释放失败后续由进程日志或事件体系处理。
    }
  }
}
