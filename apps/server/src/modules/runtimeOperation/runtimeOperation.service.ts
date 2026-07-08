import type {
  ChargingPointConnectorActionResponse,
  ChargingPointDetailResponse,
  RuntimeAuthorizeRequest,
  RuntimeAuthorizeResponse,
  RuntimeOperationResponse,
  RuntimeStartTransactionRequest,
  RuntimeStartTransactionResponse,
  RuntimeSnapshotResponse,
  RuntimeStopTransactionRequest,
  RuntimeStopTransactionResponse,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import {
  ChargingPointActorError,
  createChargingPointActor,
  type ChargingPointActor,
  type ChargingPointActorOptions,
  type ChargingPointActorStartResult,
} from "../../lib/chargingPointActor";
import { ChargingPointRuntimeLogFileWriter } from "../../lib/chargingPointRuntimeLogFileWriter";
import { ChargingPointActorRegistry } from "../../lib/chargingPointActorRegistry";
import { ChargingPointEventStreamHub } from "../../lib/chargingPointEventStreamHub";
import { AppError } from "../../utils/errors";
import { toChargingPointActorOptions } from "./chargingPointActorOptions";
import { RuntimeOperationCommandExecutor } from "./runtimeOperation.command";
import { RuntimeOperationRepository } from "./runtimeOperation.repo";

export type ChargingPointActorFactory = (
  options: ChargingPointActorOptions,
) => ChargingPointActor;

export interface RuntimeOperationServiceDependencies {
  chargingPointActorRegistry?: ChargingPointActorRegistry;
  chargingPointRuntimeLogFileWriter?: ChargingPointRuntimeLogFileWriter;
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
  private readonly runtimeLogFileWriter?: ChargingPointRuntimeLogFileWriter;
  private readonly eventStreamHub?: ChargingPointEventStreamHub;
  private readonly actorFactory: ChargingPointActorFactory;
  private readonly commandExecutor: RuntimeOperationCommandExecutor;

  constructor(
    private readonly repository: RuntimeOperationRepository,
    dependencies: RuntimeOperationServiceDependencies = {},
  ) {
    this.registry =
      dependencies.chargingPointActorRegistry ?? new ChargingPointActorRegistry();
    this.runtimeLogFileWriter = dependencies.chargingPointRuntimeLogFileWriter;
    this.eventStreamHub = dependencies.chargingPointEventStreamHub;
    this.actorFactory = dependencies.createChargingPointActor ?? createChargingPointActor;
    this.commandExecutor = new RuntimeOperationCommandExecutor(this.registry);
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

  async getRuntimeSnapshot(id: string): Promise<RuntimeSnapshotResponse> {
    await this.repository.getOperationDetail(id);
    const runtimeStatus = this.toStatusResponse(id, this.registry.get(id));

    return this.eventStreamHub?.getRuntimeSnapshot(id, runtimeStatus) ?? {
      chargingPointId: id,
      runtimeStatus,
      sessionStatus: null,
      chargingPointStatus: null,
      evseStatuses: [],
      connectorStatuses: [],
      transactionStatuses: [],
      lastHeartbeatAt: null,
      recentIssue: null,
    };
  }

  async plug(
    chargingPointId: string,
    connectorId: string,
  ): Promise<ChargingPointConnectorActionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    return this.commandExecutor.plug(chargingPoint, connectorId);
  }

  async unplug(
    chargingPointId: string,
    connectorId: string,
  ): Promise<ChargingPointConnectorActionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    return this.commandExecutor.unplug(chargingPoint, connectorId);
  }

  async authorize(
    chargingPointId: string,
    connectorId: string,
    input: RuntimeAuthorizeRequest,
  ): Promise<RuntimeAuthorizeResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    return this.commandExecutor.authorize(chargingPoint, connectorId, input);
  }

  async startTransaction(
    chargingPointId: string,
    connectorId: string,
    input: RuntimeStartTransactionRequest,
  ): Promise<RuntimeStartTransactionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    return this.commandExecutor.startTransaction(chargingPoint, connectorId, input);
  }

  async stopTransaction(
    chargingPointId: string,
    connectorId: string,
    input: RuntimeStopTransactionRequest,
  ): Promise<RuntimeStopTransactionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    return this.commandExecutor.stopTransaction(chargingPoint, connectorId, input);
  }

  private toStatusResponse(
    chargingPointId: string,
    actor: ChargingPointActor | undefined,
  ): RuntimeOperationResponse {
    if (actor?.status === "running") {
      return {
        chargingPointId,
        status: actor.status,
        bootStatus: "Accepted",
      };
    }

    if (actor?.status === "starting") {
      return {
        chargingPointId,
        status: actor.status,
        bootStatus: "Pending",
      };
    }

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

  private toActorOptions(chargingPoint: ChargingPointDetailResponse): ChargingPointActorOptions {
    const options = toChargingPointActorOptions(chargingPoint);
    const runtimeLogSink = this.runtimeLogFileWriter?.createSink(chargingPoint.id);

    return runtimeLogSink === undefined
      ? options
      : {
          ...options,
          runtimeLogSink,
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
