import type { RuntimeOperationResponse } from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import {
  ChargingPointActorError,
  createChargingPointActor,
  type ChargingPointActor,
  type ChargingPointActorOptions,
  type ChargingPointActorLogSink,
  type ChargingPointActorStartResult,
  type ChargingPointActorConfigurationPersistence,
  type ChargingPointActorProtocol,
} from "../../lib/chargingPointActor";
import {
  ChargingPointActorHost,
  type ChargingPointActorHostStartResult,
} from "../../lib/chargingPointActorHost";
import { AppError } from "../../utils/errors";
import { ChargingTransactionRepository } from "../chargingTransaction/chargingTransaction.repo";
import { AuthorizationRepository } from "../authorization/authorization.repo";
import { TransactionDeliveryRepository } from "../transactionDelivery/transactionDelivery.repo";
import { ProtocolConfigurationRepository } from "../protocolConfiguration/protocolConfiguration.repo";
import { toChargingPointActorOptions } from "./chargingPointActorOptions";
import { RuntimeOperationRepository } from "./runtimeOperation.repo";

export type ChargingPointActorFactory = (
  options: ChargingPointActorOptions,
) => ChargingPointActor;

export interface ProtocolConfigurationRuntime {
  loadCatalog(
    chargingPointId: string,
  ): Promise<NonNullable<ChargingPointActorOptions["configurationCatalog"]>>;
  forChargingPoint(
    chargingPointId: string,
    protocol: ChargingPointActorProtocol,
  ): ChargingPointActorConfigurationPersistence;
}

export function createProtocolConfigurationRuntime(
  database: ServerDatabase,
): ProtocolConfigurationRuntime {
  return new ProtocolConfigurationRepository(database);
}

interface RuntimeOperationLifecycleDependencies {
  actorHost: ChargingPointActorHost;
  actorFactory?: ChargingPointActorFactory;
}

export class RuntimeOperationLifecycle {
  private readonly actorFactory: ChargingPointActorFactory;

  constructor(
    private readonly repository: RuntimeOperationRepository,
    private readonly chargingTransactionRepository: ChargingTransactionRepository,
    private readonly transactionDeliveryRepository: TransactionDeliveryRepository,
    private readonly authorizationPersistenceRepository: AuthorizationRepository,
    private readonly protocolConfigurationRuntime: ProtocolConfigurationRuntime,
    private readonly dependencies: RuntimeOperationLifecycleDependencies,
  ) {
    this.actorFactory = dependencies.actorFactory ?? createChargingPointActor;
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

    let entry: ChargingPointActorHostStartResult;
    try {
      const configurationCatalog =
        await this.protocolConfigurationRuntime.loadCatalog(chargingPoint.id);
      const configurationPersistence =
        this.protocolConfigurationRuntime.forChargingPoint(
          chargingPoint.id,
          chargingPoint.protocol,
        );
      entry = await this.dependencies.actorHost.start(id, (actorLogSink) =>
        this.actorFactory(this.toActorOptions(
          chargingPoint,
          configurationCatalog,
          configurationPersistence,
          actorLogSink,
        )),
      );
    } catch (error) {
      throw this.mapStartError(error);
    }

    return entry.created
      ? toRuntimeOperationResponse(id, entry.actor, entry.result)
      : toRuntimeOperationResponse(id, entry.actor);
  }

  async stop(id: string): Promise<RuntimeOperationResponse> {
    await this.repository.getOperationDetail(id);
    try {
      await this.dependencies.actorHost.stop(id);
      return { chargingPointId: id, status: "stopped" };
    } catch {
      throw new AppError(
        502,
        "CHARGING_POINT_STOP_FAILED",
        "Charging point stop failed",
      );
    }
  }

  async recoverActiveTransactions(): Promise<{
    recovered: string[];
    failed: Array<{ chargingPointId: string; error: unknown }>;
  }> {
    const chargingPointIds =
      await this.chargingTransactionRepository.listRecoverableChargingPointIds();
    const recovered: string[] = [];
    const failed: Array<{ chargingPointId: string; error: unknown }> = [];

    for (const chargingPointId of chargingPointIds) {
      try {
        await this.start(chargingPointId);
        recovered.push(chargingPointId);
      } catch (error) {
        failed.push({ chargingPointId, error });
      }
    }

    return { recovered, failed };
  }

  private toActorOptions(
    chargingPoint: Parameters<typeof toChargingPointActorOptions>[0],
    configurationCatalog: NonNullable<ChargingPointActorOptions["configurationCatalog"]>,
    configurationPersistence: NonNullable<
      ChargingPointActorOptions["configurationPersistence"]
    >,
    actorLogSink?: ChargingPointActorLogSink,
  ): ChargingPointActorOptions {
    return {
      ...toChargingPointActorOptions(chargingPoint),
      configurationCatalog: {
        ...configurationCatalog,
        chargingPointId: chargingPoint.identity,
      },
      configurationPersistence,
      transactionStore: this.transactionDeliveryRepository.forChargingPoint(
        chargingPoint.id,
      ),
      authorizationStore: this.authorizationPersistenceRepository.forChargingPoint(
        chargingPoint.id,
        chargingPoint.protocol,
      ),
      ...(actorLogSink === undefined ? {} : { actorLogSink }),
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
}

export function toRuntimeOperationResponse(
  chargingPointId: string,
  actor: ChargingPointActor | undefined,
  startResult?: ChargingPointActorStartResult,
): RuntimeOperationResponse {
  if (startResult !== undefined) {
    return {
      chargingPointId: startResult.chargingPointId,
      status: startResult.chargingPointActorStatus,
      bootStatus: startResult.bootStatus,
      retryAfterSec: "retryAfterSec" in startResult
        ? startResult.retryAfterSec
        : undefined,
    };
  }
  if (actor?.status === "running") {
    return { chargingPointId, status: "running", bootStatus: "Accepted" };
  }
  if (actor?.status === "starting") {
    return { chargingPointId, status: "starting", bootStatus: "Pending" };
  }
  return { chargingPointId, status: actor?.status ?? "stopped" };
}
