import type {
  RuntimeOperationResponse,
  RuntimeSnapshotResponse,
} from "@spark-bee/contracts";

import type {
  ChargingPointActor,
  ChargingPointActorLogSink,
  ChargingPointActorStartResult,
} from "./chargingPointActor";
import { ChargingPointEventStreamHub } from "./chargingPointEventStreamHub";
import type { ChargingPointStreamEvent } from "./chargingPointEventStreamHub";
import type { ActorLogSinkFactory } from "./actorLogWriter";
import { ChargingPointRuntimeProjection } from "./chargingPointRuntimeProjection";

export type ChargingPointActorHostFactory = (
  actorLogSink?: ChargingPointActorLogSink,
) => ChargingPointActor;

export type ChargingPointActorHostStartResult =
  | { actor: ChargingPointActor; created: false }
  | {
      actor: ChargingPointActor;
      created: true;
      result: ChargingPointActorStartResult;
    };

export interface ChargingPointActorHostDependencies {
  eventStreamHub?: ChargingPointEventStreamHub;
  actorLogWriter?: ActorLogSinkFactory;
  runtimeProjection?: ChargingPointRuntimeProjection;
}

export class ChargingPointActorHost {
  private readonly actors = new Map<string, ChargingPointActor>();
  private readonly actorUnsubscribers = new Map<string, () => void>();
  private readonly eventStreamHub: ChargingPointEventStreamHub;
  private readonly actorLogWriter?: ActorLogSinkFactory;
  private readonly runtimeProjection: ChargingPointRuntimeProjection;

  constructor(dependencies: ChargingPointActorHostDependencies = {}) {
    this.eventStreamHub =
      dependencies.eventStreamHub ?? new ChargingPointEventStreamHub();
    this.actorLogWriter = dependencies.actorLogWriter;
    this.runtimeProjection =
      dependencies.runtimeProjection ?? new ChargingPointRuntimeProjection();
  }

  get(chargingPointId: string): ChargingPointActor | undefined {
    return this.actors.get(chargingPointId);
  }

  list(): ChargingPointActor[] {
    return [...this.actors.values()];
  }

  async start(
    chargingPointId: string,
    factory: ChargingPointActorHostFactory,
  ): Promise<ChargingPointActorHostStartResult> {
    const existing = this.actors.get(chargingPointId);
    if (existing !== undefined) {
      return { actor: existing, created: false };
    }

    const actor = factory(this.actorLogWriter?.createSink(chargingPointId));
    this.actors.set(chargingPointId, actor);
    this.actorUnsubscribers.set(
      chargingPointId,
      actor.events.subscribe((event) => {
        this.runtimeProjection.projectActorEvent(event);
        this.eventStreamHub.publishActorEvent(event);
      }),
    );

    try {
      const result = await actor.start();
      return { actor, created: true, result };
    } catch (error) {
      await this.release(chargingPointId, actor, "clear");
      throw error;
    }
  }

  async stop(chargingPointId: string) {
    const actor = this.actors.get(chargingPointId);
    if (actor === undefined) {
      return undefined;
    }

    try {
      return await actor.stop();
    } finally {
      await this.release(chargingPointId, actor, "clear");
    }
  }

  async delete(chargingPointId: string): Promise<void> {
    const actor = this.actors.get(chargingPointId);
    if (actor !== undefined) {
      try {
        await actor.stop();
      } catch {
        // 删除已完成持久化，运行态停止失败不阻止清理进程内资源。
      } finally {
        await this.release(chargingPointId, actor, "delete");
      }
    } else {
      this.runtimeProjection.delete(chargingPointId);
    }

    this.eventStreamHub.delete(chargingPointId);
  }

  getRuntimeSnapshot(
    chargingPointId: string,
    runtimeStatus: RuntimeOperationResponse,
  ): RuntimeSnapshotResponse {
    return this.runtimeProjection.getRuntimeSnapshot(chargingPointId, runtimeStatus);
  }

  subscribe(
    chargingPointId: string,
    listener: (event: ChargingPointStreamEvent) => void,
  ): () => void {
    return this.eventStreamHub.subscribe(chargingPointId, listener);
  }

  subscribeWithSnapshot(
    chargingPointId: string,
    runtimeStatus: RuntimeOperationResponse,
    listener: (event: ChargingPointStreamEvent) => void,
  ): { snapshot: RuntimeSnapshotResponse; unsubscribe: () => void } {
    const unsubscribe = this.subscribe(chargingPointId, listener);
    return {
      snapshot: this.getRuntimeSnapshot(chargingPointId, runtimeStatus),
      unsubscribe,
    };
  }

  private async release(
    chargingPointId: string,
    actor: ChargingPointActor,
    projectionMode: "clear" | "delete",
  ): Promise<void> {
    if (this.actors.get(chargingPointId) === actor) {
      this.actors.delete(chargingPointId);
    }
    this.actorUnsubscribers.get(chargingPointId)?.();
    this.actorUnsubscribers.delete(chargingPointId);
    if (projectionMode === "delete") {
      this.runtimeProjection.delete(chargingPointId);
    } else {
      this.runtimeProjection.clear(chargingPointId);
    }

    try {
      await actor.dispose();
    } catch {
      // 启停错误优先返回；释放失败由 Actor 日志处理。
    }
  }
}
