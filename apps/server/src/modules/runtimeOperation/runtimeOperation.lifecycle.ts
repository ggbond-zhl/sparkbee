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
import { AuthorizationRepository } from "../authorization/authorization.repo";
import { TransactionDeliveryRepository } from "../transactionDelivery/transactionDelivery.repo";
import { ProtocolConfigurationRepository } from "../protocolConfiguration/protocolConfiguration.repo";
import { toChargingPointActorOptions } from "./chargingPointActorOptions";
import {
  RuntimeOperationRepository,
  type RuntimeOperationDetail,
} from "./runtimeOperation.repo";

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
  private readonly operationTails = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: RuntimeOperationRepository,
    private readonly transactionDeliveryRepository: TransactionDeliveryRepository,
    private readonly authorizationPersistenceRepository: AuthorizationRepository,
    private readonly protocolConfigurationRuntime: ProtocolConfigurationRuntime,
    private readonly dependencies: RuntimeOperationLifecycleDependencies,
  ) {
    this.actorFactory = dependencies.actorFactory ?? createChargingPointActor;
  }

  async start(id: string): Promise<RuntimeOperationResponse> {
    return this.runSerially(id, async () => {
      const chargingPoint = await this.repository.getOperationDetail(id);
      this.requireRunnable(chargingPoint);
      await this.repository.setRunningIntent(id, "running");
      return this.startActor(id, chargingPoint);
    });
  }

  async stop(id: string): Promise<RuntimeOperationResponse> {
    return this.runSerially(id, async () => {
      await this.repository.getOperationDetail(id);
      await this.repository.setRunningIntent(id, "stopped");
      try {
        await this.dependencies.actorHost.stop(id);
        return {
          chargingPointId: id,
          status: "stopped",
          runningIntent: "stopped",
        };
      } catch {
        throw new AppError(
          502,
          "CHARGING_POINT_STOP_FAILED",
          "Charging point stop failed",
        );
      }
    });
  }

  async recoverRunningChargingPoints(): Promise<{
    recovered: string[];
    failed: Array<{ chargingPointId: string; error: unknown }>;
  }> {
    const chargingPointIds = await this.repository.listRunningChargingPointIds();
    const results = await Promise.all(
      chargingPointIds.map(async (chargingPointId) => {
        try {
          const recovered = await this.runSerially(chargingPointId, async () => {
            const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
            if (chargingPoint.runningIntent === "stopped") {
              return false;
            }

            this.requireRunnable(chargingPoint);
            await this.startActor(chargingPointId, chargingPoint);
            return true;
          });
          return { chargingPointId, recovered };
        } catch (error) {
          return { chargingPointId, recovered: false as const, error };
        }
      }),
    );

    return {
      recovered: results.flatMap((result) =>
        result.recovered ? [result.chargingPointId] : [],
      ),
      failed: results.flatMap((result) =>
        "error" in result
          ? [{ chargingPointId: result.chargingPointId, error: result.error }]
          : [],
      ),
    };
  }

  private requireRunnable(
    chargingPoint: RuntimeOperationDetail,
  ): void {
    if (chargingPoint.connectors.length === 0) {
      throw new AppError(
        409,
        "CHARGING_POINT_NOT_RUNNABLE",
        "Charging point requires at least one connector",
      );
    }
  }

  private async startActor(
    id: string,
    chargingPoint: RuntimeOperationDetail,
  ): Promise<RuntimeOperationResponse> {
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
      ? toRuntimeOperationResponse(id, entry.actor, "running", entry.result)
      : toRuntimeOperationResponse(id, entry.actor, "running");
  }

  private async runSerially<T>(
    id: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.operationTails.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.operationTails.set(id, current);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.operationTails.get(id) === current) {
        this.operationTails.delete(id);
      }
    }
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
  runningIntent: RuntimeOperationResponse["runningIntent"],
  startResult?: ChargingPointActorStartResult,
): RuntimeOperationResponse {
  if (startResult !== undefined) {
    return {
      chargingPointId: startResult.chargingPointId,
      status: startResult.chargingPointActorStatus,
      runningIntent,
      bootStatus: startResult.bootStatus,
      retryAfterSec: "retryAfterSec" in startResult
        ? startResult.retryAfterSec
        : undefined,
    };
  }
  if (actor?.status === "running") {
    return {
      chargingPointId,
      status: "running",
      runningIntent,
      bootStatus: "Accepted",
    };
  }
  if (actor?.status === "starting") {
    return {
      chargingPointId,
      status: "starting",
      runningIntent,
      bootStatus: "Pending",
    };
  }
  return {
    chargingPointId,
    status: actor?.status ?? "stopped",
    runningIntent,
  };
}
