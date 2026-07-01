import type {
  ChargingPointConnectorActionResponse,
  ChargingPointDetailResponse,
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import {
  ChargingPointActorError,
  createChargingPointActor,
  type ChargingPointActor,
  type ChargingPointActorConnectorActionResult,
  type ChargingPointActorOptions,
  type ChargingPointActorStartResult,
} from "../../lib/chargingPointActor";
import { ChargingPointDiagnosticFileWriter } from "../../lib/chargingPointDiagnosticFileWriter";
import { ChargingPointActorRegistry } from "../../lib/chargingPointActorRegistry";
import { ChargingPointEventStreamHub } from "../../lib/chargingPointEventStreamHub";
import { AppError } from "../../utils/errors";
import { toChargingPointActorOptions } from "./chargingPointActorOptions";
import { RuntimeOperationRepository } from "./runtimeOperation.repo";

export type ChargingPointActorFactory = (
  options: ChargingPointActorOptions,
) => ChargingPointActor;

export interface RuntimeOperationServiceDependencies {
  chargingPointActorRegistry?: ChargingPointActorRegistry;
  chargingPointDiagnosticFileWriter?: ChargingPointDiagnosticFileWriter;
  chargingPointEventStreamHub?: ChargingPointEventStreamHub;
  createChargingPointActor?: ChargingPointActorFactory;
}

export function createRuntimeOperationService(
  database: ServerDatabase,
  dependencies: RuntimeOperationServiceDependencies = {},
) {
  return new RuntimeOperationService(
    new RuntimeOperationRepository(database),
    dependencies,
  );
}

export class RuntimeOperationService {
  private readonly registry: ChargingPointActorRegistry;
  private readonly diagnosticFileWriter?: ChargingPointDiagnosticFileWriter;
  private readonly eventStreamHub?: ChargingPointEventStreamHub;
  private readonly actorFactory: ChargingPointActorFactory;

  constructor(
    private readonly repository: RuntimeOperationRepository,
    dependencies: RuntimeOperationServiceDependencies = {},
  ) {
    this.registry =
      dependencies.chargingPointActorRegistry ?? new ChargingPointActorRegistry();
    this.diagnosticFileWriter = dependencies.chargingPointDiagnosticFileWriter;
    this.eventStreamHub = dependencies.chargingPointEventStreamHub;
    this.actorFactory = dependencies.createChargingPointActor ?? createChargingPointActor;
  }

  async start(id: string): Promise<RuntimeOperationResponse> {
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
        this.actorFactory(this.toActorOptions(chargingPoint)),
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

  async stop(id: string): Promise<RuntimeOperationResponse> {
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

  async getStatus(id: string): Promise<RuntimeOperationResponse> {
    await this.repository.getOperationDetail(id);
    return this.toStatusResponse(id, this.registry.get(id));
  }

  async plug(
    chargingPointId: string,
    connectorId: string,
  ): Promise<ChargingPointConnectorActionResponse> {
    return this.applyConnectorAction(chargingPointId, connectorId, "plug");
  }

  async unplug(
    chargingPointId: string,
    connectorId: string,
  ): Promise<ChargingPointConnectorActionResponse> {
    return this.applyConnectorAction(chargingPointId, connectorId, "unplug");
  }

  private async applyConnectorAction(
    chargingPointId: string,
    connectorId: string,
    action: "plug" | "unplug",
  ): Promise<ChargingPointConnectorActionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    const connector = this.requireConnector(chargingPoint, connectorId);
    const actor = this.requireRunningActor(chargingPointId);

    try {
      const result = await actor[action]({
        evseId: connector.evseId,
        connectorId: connector.connectorId,
      });

      return this.toConnectorActionResponse(connector.id, result);
    } catch (error) {
      throw this.mapConnectorActionError(error);
    }
  }

  private requireConnector(
    chargingPoint: ChargingPointDetailResponse,
    connectorId: string,
  ): ConnectorResponse {
    const connector = chargingPoint.connectors.find((connector) =>
      connector.id === connectorId
    );

    if (connector === undefined) {
      throw new AppError(404, "CONNECTOR_NOT_FOUND", "Connector not found");
    }

    return connector;
  }

  private requireRunningActor(chargingPointId: string): ChargingPointActor {
    const actor = this.registry.get(chargingPointId);
    if (actor === undefined) {
      throw new AppError(
        409,
        "CHARGING_POINT_NOT_RUNNING",
        "Charging point is not running",
      );
    }

    return actor;
  }

  private toStatusResponse(
    chargingPointId: string,
    actor: ChargingPointActor | undefined,
  ): RuntimeOperationResponse {
    return {
      chargingPointId,
      status: actor?.status ?? "stopped",
    };
  }

  private toStoppedResponse(chargingPointId: string): RuntimeOperationResponse {
    return {
      chargingPointId,
      status: "stopped",
    };
  }

  private toStartResponse(
    result: ChargingPointActorStartResult,
  ): RuntimeOperationResponse {
    return {
      chargingPointId: result.chargingPointId,
      status: result.chargingPointActorStatus,
      bootStatus: result.bootStatus,
      retryAfterSec: "retryAfterSec" in result ? result.retryAfterSec : undefined,
    };
  }

  private toConnectorActionResponse(
    connectorId: string,
    result: ChargingPointActorConnectorActionResult,
  ): ChargingPointConnectorActionResponse {
    return {
      chargingPointId: result.chargingPointId,
      connectorId,
      evseId: result.evseId,
      protocolConnectorId: result.connectorId,
      plugState: result.plugState,
      vehiclePresence: result.vehiclePresence,
      connectorStatus: result.connectorStatus,
    };
  }

  private toActorOptions(chargingPoint: ChargingPointDetailResponse): ChargingPointActorOptions {
    const options = toChargingPointActorOptions(chargingPoint);
    const diagnosticSink = this.diagnosticFileWriter?.createSink(chargingPoint.id);

    return diagnosticSink === undefined
      ? options
      : {
          ...options,
          diagnosticSink,
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

  private mapConnectorActionError(error: unknown): AppError {
    if (
      error instanceof ChargingPointActorError &&
      error.code === "CHARGING_POINT_ACTOR_NOT_RUNNING"
    ) {
      return new AppError(
        409,
        "CHARGING_POINT_NOT_RUNNING",
        "Charging point is not running",
      );
    }

    if (
      error instanceof ChargingPointActorError &&
      error.code === "CHARGING_POINT_ACTOR_INVALID_OPERATION"
    ) {
      return new AppError(409, "CONNECTOR_OPERATION_CONFLICT", error.message);
    }

    return new AppError(
      502,
      "CONNECTOR_OPERATION_FAILED",
      "Connector operation failed",
    );
  }

  private async disposeQuietly(actor: ChargingPointActor): Promise<void> {
    try {
      await actor.dispose();
    } catch {
      // 启停错误优先返回，释放失败后续由进程日志或事件体系处理。
    }
  }
}
