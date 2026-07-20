import type { Ocpp16BootResult, Ocpp16Runtime } from "../../protocol/runtime";
import type { ISession } from "../../protocol/session/types";
import { ChargingPointActorError } from "../errors";
import type {
  ChargingPointActorStartResult,
  ChargingPointActorStatus,
} from "../types";
import { toChargingPointActorBootResult } from "./resultMapping";

export interface Ocpp16StartupLifecycleOptions {
  chargingPointId: string;
  session: ISession;
  runtime: Ocpp16Runtime;
  getStatus(): ChargingPointActorStatus;
  isDisposed(): boolean;
  transitionStatus(
    currentStatus: ChargingPointActorStatus,
    error?: { code: string; message: string },
  ): void;
  publishBootStatus(
    status: "Accepted" | "Pending" | "Rejected",
    retryAfterSec?: number,
  ): void;
}

export class Ocpp16StartupLifecycle {
  private bootRetryTimerId: ReturnType<typeof setTimeout> | null = null;
  private initialConnectInProgress = false;

  constructor(private readonly options: Ocpp16StartupLifecycleOptions) {}

  async start(): Promise<ChargingPointActorStartResult> {
    try {
      this.initialConnectInProgress = true;
      try {
        await this.options.session.connect();
      } finally {
        this.initialConnectInProgress = false;
      }

      const bootResult = await this.options.runtime.boot();
      this.options.publishBootStatus(
        bootResult.status,
        bootResult.status === "Pending" ? bootResult.interval : undefined,
      );

      if (bootResult.status === "Accepted") {
        await this.completeAcceptedBoot();

        return {
          chargingPointId: this.options.chargingPointId,
          chargingPointActorStatus: "running",
          bootStatus: bootResult.status,
        };
      }

      if (bootResult.status === "Pending") {
        this.scheduleBootRetry(bootResult.interval);
        if (this.options.getStatus() !== "starting") {
          this.options.transitionStatus("starting");
        }

        return {
          chargingPointId: this.options.chargingPointId,
          chargingPointActorStatus: "starting",
          bootStatus: bootResult.status,
          retryAfterSec: bootResult.interval,
        };
      }

      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_START_FAILED",
        `BootNotification ${bootResult.status}`,
        toChargingPointActorBootResult(bootResult),
      );
    } catch (cause) {
      if (this.options.session.state === "reconnecting") {
        if (this.options.getStatus() !== "starting") {
          this.options.transitionStatus("starting", {
            code: cause instanceof Error ? cause.name : "CHARGING_POINT_ACTOR_START_FAILED",
            message: toErrorMessage(cause),
          });
        }
        return {
          chargingPointId: this.options.chargingPointId,
          chargingPointActorStatus: "starting",
          bootStatus: "Pending",
          retryAfterSec: 0,
        };
      }

      await this.stopAfterFailure(cause);

      if (cause instanceof ChargingPointActorError) {
        throw cause;
      }

      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_START_FAILED",
        "actor 启动失败",
        cause,
      );
    }
  }

  handleOnline(): void {
    if (
      this.initialConnectInProgress ||
      this.options.isDisposed() ||
      this.options.getStatus() !== "starting"
    ) {
      return;
    }

    void this.retryBoot().catch(() => undefined);
  }

  async handleTriggeredBootResult(bootResult: Ocpp16BootResult): Promise<void> {
    if (this.options.getStatus() !== "starting" || this.options.isDisposed()) {
      return;
    }

    try {
      await this.handleBackgroundBootResult(bootResult);
    } catch (cause) {
      await this.stopAfterFailure(cause);
    }
  }

  clearBootRetryTimer(): void {
    if (this.bootRetryTimerId === null) {
      return;
    }

    clearTimeout(this.bootRetryTimerId);
    this.bootRetryTimerId = null;
  }

  private async completeAcceptedBoot(): Promise<void> {
    this.options.runtime.startHeartbeatLoop({
      onReconnectRequired: (result) => {
        if (
          this.options.getStatus() !== "running" ||
          this.options.isDisposed()
        ) {
          return;
        }

        this.options.transitionStatus(this.options.getStatus(), {
          code: result.errorCode,
          message: result.errorMessage,
        });
      },
    });
    await this.reportStartupStatuses();
    this.options.runtime.resumeActiveTransactionSampling();
    this.options.transitionStatus("running");
  }

  private async reportStartupStatuses(): Promise<void> {
    this.options.runtime.publishChargingPointAvailabilitySnapshot();
    await this.options.runtime.reportChargingPointStatus();

    for (const connectorRef of this.options.runtime.listConnectorRefs()) {
      this.options.runtime.publishConnectorAvailabilitySnapshot(connectorRef);
      await this.options.runtime.reportConnectorStatus({
        connectorId: connectorRef.connectorId,
      });
    }
  }

  private scheduleBootRetry(intervalSec: number): void {
    this.clearBootRetryTimer();
    this.bootRetryTimerId = setTimeout(() => {
      this.bootRetryTimerId = null;
      void this.retryBoot().catch(() => undefined);
    }, Math.max(0, intervalSec * 1_000));
  }

  private async retryBoot(): Promise<void> {
    if (this.options.getStatus() !== "starting" || this.options.isDisposed()) {
      return;
    }

    try {
      const bootResult = await this.options.runtime.boot();
      await this.handleBackgroundBootResult(bootResult);
    } catch (cause) {
      await this.stopAfterFailure(cause);
    }
  }

  private async handleBackgroundBootResult(
    bootResult: Ocpp16BootResult,
  ): Promise<void> {
    this.options.publishBootStatus(
      bootResult.status,
      bootResult.status === "Pending" ? bootResult.interval : undefined,
    );
    if (this.options.getStatus() !== "starting" || this.options.isDisposed()) {
      return;
    }

    if (bootResult.status === "Pending") {
      this.scheduleBootRetry(bootResult.interval);
      return;
    }

    this.clearBootRetryTimer();
    if (bootResult.status === "Accepted") {
      await this.completeAcceptedBoot();
      return;
    }

    await this.stopAfterFailure(new ChargingPointActorError(
      "CHARGING_POINT_ACTOR_START_FAILED",
      `BootNotification ${bootResult.status}`,
      toChargingPointActorBootResult(bootResult),
    ));
  }

  private async stopAfterFailure(cause: unknown): Promise<void> {
    this.clearBootRetryTimer();
    this.options.runtime.stopRuntime();
    if (this.options.session.isConnected()) {
      await this.options.session.disconnect();
    }
    this.options.transitionStatus("stopped", {
      code: cause instanceof ChargingPointActorError
        ? cause.code
        : "CHARGING_POINT_ACTOR_START_FAILED",
      message: toErrorMessage(cause),
    });
  }
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
