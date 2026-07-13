import type {
  Ocpp16Runtime,
} from "../../protocol/runtime";
import type {
  ISession,
  SessionLogEntry,
  SessionError,
  SessionOfflineReason,
} from "../../protocol/session/types";
import {
  createProtocolClock,
  type ProtocolClock,
} from "../../protocol/runtime/ocpp16/protocolClock";
import { ProtocolRuntimeError } from "../../protocol/runtime/ocpp16/errors";
import { ChargingPointActorError } from "../errors";
import type {
  Ocpp16ChargingPointActorOptions,
  ChargingPointActor,
  ChargingPointActorAuthorizeInput,
  ChargingPointActorAuthorizeResult,
  ChargingPointActorConnectorActionInput,
  ChargingPointActorConnectorActionResult,
  ChargingPointActorEventBus,
  ChargingPointActorMeterValueInput,
  ChargingPointActorMeterValueResult,
  ChargingPointActorResourceRef,
  ChargingPointActorStartResult,
  ChargingPointActorStartTransactionInput,
  ChargingPointActorStatus,
  ChargingPointActorStopResult,
  ChargingPointActorStopTransactionInput,
  ChargingPointActorStopTransactionResult,
  ChargingPointActorTransactionStartResult,
} from "../types";
import {
  createDefaultOcpp16Runtime,
  createDefaultSession,
} from "./defaults";
import { RuntimeLogRecordPublisher } from "./RuntimeLogRecordPublisher";
import {
  toPublicAuthorizeResult,
  toPublicTransactionStartResult,
  toChargingPointActorAuthorizeResult,
  toChargingPointActorConnectorActionResult,
  toChargingPointActorMeterValueResult,
  toChargingPointActorStopTransactionResult,
  toChargingPointActorTransactionStartResult,
} from "./resultMapping";
import type {
  Ocpp16ChargingPointActorDependencies,
} from "./types";
import { Ocpp16EventEnvelope } from "./Ocpp16EventEnvelope";
import { Ocpp16StartupLifecycle } from "./Ocpp16StartupLifecycle";

export class Ocpp16ChargingPointActor implements ChargingPointActor {
  private currentStatus: ChargingPointActorStatus = "stopped";
  private readonly clock: ProtocolClock;
  private readonly idGenerator: () => string;
  private readonly session: ISession;
  private readonly ocpp16Runtime: Ocpp16Runtime;
  private disposed = false;

  private readonly eventEnvelope: Ocpp16EventEnvelope;
  private readonly runtimeLogRecords: RuntimeLogRecordPublisher;
  private readonly startupLifecycle: Ocpp16StartupLifecycle;

  readonly id: string;
  readonly protocol = "OCPP16J" as const;
  readonly events: ChargingPointActorEventBus;
  constructor(
    options: Ocpp16ChargingPointActorOptions,
    dependencies: Ocpp16ChargingPointActorDependencies = {},
  ) {
    if (options.chargingPoint === undefined) {
      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_INVALID_OPERATION",
        "OCPP16J actor 需要 chargingPoint",
      );
    }

    this.id = options.id;
    this.clock = createProtocolClock(dependencies.clock ?? (() => new Date()));
    this.idGenerator =
      dependencies.idGenerator ?? crypto.randomUUID.bind(crypto);
    this.session = dependencies.session ?? createDefaultSession(options);
    this.runtimeLogRecords = new RuntimeLogRecordPublisher({
      chargingPointId: this.id,
      clock: this.clock,
      idGenerator: this.idGenerator,
      sink: options.runtimeLogSink,
    });
    this.ocpp16Runtime =
      dependencies.ocpp16Runtime ??
      createDefaultOcpp16Runtime(this.session, options, {
        protocolClock: this.clock,
        idGenerator: this.idGenerator,
        configurationCatalog:
          dependencies.configurationCatalog ?? options.configurationCatalog,
        emitRuntimeLog: (runtimeLog) => this.runtimeLogRecords.publish(runtimeLog),
        onTriggeredBootResult: (result) =>
          this.startupLifecycle.handleTriggeredBootResult(result),
      });
    this.eventEnvelope = new Ocpp16EventEnvelope({
      chargingPointId: this.id,
      connectionUrl: options.centralSystemUrl,
      protocol: this.protocol,
      clock: this.clock,
      idGenerator: this.idGenerator,
      session: this.session,
      runtime: this.ocpp16Runtime,
      onOnline: this.handleOnline,
    });
    this.startupLifecycle = new Ocpp16StartupLifecycle({
      chargingPointId: this.id,
      session: this.session,
      runtime: this.ocpp16Runtime,
      getStatus: () => this.currentStatus,
      isDisposed: () => this.disposed,
      transitionStatus: (currentStatus, error) =>
        this.transitionChargingPointActorStatus(currentStatus, error),
      publishBootStatus: (status, retryAfterSec) =>
        this.eventEnvelope.publishChargingPointBoot(status, retryAfterSec),
    });
    this.session.on("sessionError", this.handleSessionLog);
    this.session.on("online", this.handleSessionOnlineLog);
    this.session.on("reconnecting", this.handleSessionReconnectingLog);
    this.session.on("offline", this.handleSessionOfflineLog);
    this.events = this.eventEnvelope.events;
  }

  get status(): ChargingPointActorStatus {
    return this.currentStatus;
  }

  async start(): Promise<ChargingPointActorStartResult> {
    this.requireNotDisposed();
    if (this.currentStatus !== "stopped") {
      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_ALREADY_RUNNING",
        `充电桩 ${this.id} 已在运行`,
      );
    }

    this.transitionChargingPointActorStatus("starting");
    return this.startupLifecycle.start();
  }

  async stop(): Promise<ChargingPointActorStopResult> {
    if (this.currentStatus === "stopped") {
      return {
        chargingPointId: this.id,
        chargingPointActorStatus: "stopped",
      };
    }

    try {
      this.startupLifecycle.clearBootRetryTimer();
      this.ocpp16Runtime.stopRuntime();
      if (this.session.isConnected()) {
        await this.session.disconnect();
      }
      this.transitionChargingPointActorStatus("stopped");

      return {
        chargingPointId: this.id,
        chargingPointActorStatus: "stopped",
      };
    } catch (cause) {
      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_STOP_FAILED",
        "actor 停止失败",
        cause,
      );
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      await this.stop();
    } finally {
      this.session.off("sessionError", this.handleSessionLog);
      this.session.off("online", this.handleSessionOnlineLog);
      this.session.off("reconnecting", this.handleSessionReconnectingLog);
      this.session.off("offline", this.handleSessionOfflineLog);
      this.eventEnvelope.dispose();
      this.ocpp16Runtime.dispose();
      this.disposed = true;
    }
  }

  async plug(
    input: ChargingPointActorConnectorActionInput,
  ): Promise<ChargingPointActorConnectorActionResult> {
    this.requireStarted();
    try {
      const result = toChargingPointActorConnectorActionResult(
        await this.ocpp16Runtime.plugConnector(input),
      );

      return { chargingPointId: this.id, ...result };
    } catch (error) {
      throw this.mapConnectorActionError(error);
    }
  }

  async unplug(
    input: ChargingPointActorConnectorActionInput,
  ): Promise<ChargingPointActorConnectorActionResult> {
    this.requireStarted();
    try {
      const result = toChargingPointActorConnectorActionResult(
        await this.ocpp16Runtime.unplugConnector(input),
      );

      return { chargingPointId: this.id, ...result };
    } catch (error) {
      throw this.mapConnectorActionError(error);
    }
  }

  async authorize(
    input: ChargingPointActorAuthorizeInput,
  ): Promise<ChargingPointActorAuthorizeResult> {
    this.requireStarted();
    const result = toChargingPointActorAuthorizeResult(
      await this.ocpp16Runtime.authorize({
        connectorId: input.connectorId,
        idTag: input.idTag,
      }),
    );

    return toPublicAuthorizeResult(result);
  }

  async startTransaction(
    input: ChargingPointActorStartTransactionInput,
  ): Promise<ChargingPointActorTransactionStartResult> {
    this.requireStarted();
    if (this.ocpp16Runtime.getConnectorStatus(input) === undefined) {
      return {
        status: "rejected",
        reason: `枪口 ${input.evseId}/${input.connectorId} 不存在`,
      };
    }

    const result = toChargingPointActorTransactionStartResult(
      await this.ocpp16Runtime.startLocalTransaction({
        connectorId: input.connectorId,
        idTag: input.idTag,
        meterStartWh: input.meterStartWh ?? 0,
        reservationId: input.reservationId,
      }),
    );

    return toPublicTransactionStartResult(result);
  }

  async reportMeterValue(
    input: ChargingPointActorMeterValueInput,
  ): Promise<ChargingPointActorMeterValueResult> {
    this.requireStarted();
    this.requireTransactionResource(input.transactionId);
    return toChargingPointActorMeterValueResult(
      await this.ocpp16Runtime.reportMeterValue(input),
    );
  }

  getTransactionResource(
    transactionId: string,
  ): Extract<ChargingPointActorResourceRef, { scope: "transaction" }> | undefined {
    if (transactionId.length === 0) {
      return undefined;
    }

    const resource = this.ocpp16Runtime.getTransactionResource(transactionId);
    if (resource === undefined) {
      return undefined;
    }

    return {
      scope: "transaction",
      evseId: resource.evseId,
      connectorId: resource.connectorId,
      transactionId,
    };
  }

  async stopTransaction(
    input: ChargingPointActorStopTransactionInput,
  ): Promise<ChargingPointActorStopTransactionResult> {
    this.requireStarted();
    this.requireTransactionResource(input.transactionId);
    return toChargingPointActorStopTransactionResult(
      await this.ocpp16Runtime.stopTransaction(input),
    );
  }

  private requireNotDisposed(): void {
    if (this.disposed) {
      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_INVALID_OPERATION",
        "actor 已释放，不能继续使用",
      );
    }
  }

  private requireStarted(): void {
    this.requireNotDisposed();
    if (this.currentStatus !== "running" && this.currentStatus !== "starting") {
      throw new ChargingPointActorError("CHARGING_POINT_ACTOR_NOT_RUNNING", "actor 未运行");
    }
  }

  private mapConnectorActionError(error: unknown): Error {
    if (error instanceof ProtocolRuntimeError) {
      const actorErrorCode = error.code === "PROTOCOL_RUNTIME_INVALID_OPERATION" ||
        error.code === "PROTOCOL_RUNTIME_CONNECTOR_NOT_FOUND"
        ? "CHARGING_POINT_ACTOR_INVALID_OPERATION"
        : "CHARGING_POINT_ACTOR_OPERATION_FAILED";

      return new ChargingPointActorError(actorErrorCode, error.message, error);
    }

    return error instanceof Error
      ? error
      : new ChargingPointActorError(
          "CHARGING_POINT_ACTOR_OPERATION_FAILED",
          "actor 操作失败",
          error,
        );
  }

  private readonly handleOnline = (): void => {
    this.startupLifecycle.handleOnline();
  };

  private readonly handleSessionLog = (runtimeLog: SessionLogEntry): void => {
    this.runtimeLogRecords.publish({
      level: "error",
      message: "Charging point session reported session error",
      code: runtimeLog.error.code,
      context: {
        source: runtimeLog.source,
        ...(runtimeLog.action === undefined ? {} : { action: runtimeLog.action }),
        ...(runtimeLog.messageId === undefined ? {} : { messageId: runtimeLog.messageId }),
        error: {
          code: runtimeLog.error.code,
          message: runtimeLog.error.message,
        },
      },
    });
  };

  private readonly handleSessionOnlineLog = (): void => {
    this.runtimeLogRecords.publish({
      level: "info",
      message: "Charging point session went online",
      code: "CHARGING_POINT_SESSION_ONLINE",
    });
  };

  private readonly handleSessionReconnectingLog = (
    attempt: number,
    error?: SessionError,
  ): void => {
    this.runtimeLogRecords.publish({
      level: "warn",
      message: "Charging point session is reconnecting",
      code: "CHARGING_POINT_SESSION_RECONNECTING",
      context: {
        attempt,
        ...(error === undefined
          ? {}
          : {
              error: {
                code: error.code,
                message: error.message,
              },
            }),
      },
    });
  };

  private readonly handleSessionOfflineLog = (
    reason: SessionOfflineReason,
  ): void => {
    this.runtimeLogRecords.publish({
      level: reason === "intentional" ? "info" : "warn",
      message: "Charging point session went offline",
      code: "CHARGING_POINT_SESSION_OFFLINE",
      context: { reason },
    });
  };

  private transitionChargingPointActorStatus(
    currentStatus: ChargingPointActorStatus,
    error?: { code: string; message: string },
  ): void {
    const previousStatus = this.currentStatus;
    this.currentStatus = currentStatus;
    this.eventEnvelope.publishChargingPointLifecycle(previousStatus, currentStatus, error);
    this.runtimeLogRecords.publish({
      level: error === undefined ? "info" : "error",
      message: error === undefined
        ? "Charging point actor status changed"
        : "Charging point actor status transition reported error",
      code: error?.code ?? "CHARGING_POINT_ACTOR_STATUS_CHANGED",
      context: {
        previousStatus,
        currentStatus,
        ...(error === undefined ? {} : { error }),
      },
    });
  }

  private requireTransactionResource(
    transactionId: string | undefined,
  ): Extract<ChargingPointActorResourceRef, { scope: "transaction" }> {
    if (transactionId === undefined || transactionId.length === 0) {
      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_INVALID_OPERATION",
        "transactionId 不能为空",
      );
    }

    const resource = this.ocpp16Runtime.getTransactionResource(transactionId);
    if (resource === undefined) {
      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_INVALID_OPERATION",
        `交易 ${transactionId} 不存在`,
      );
    }

    return {
      scope: "transaction",
      evseId: resource.evseId,
      connectorId: resource.connectorId,
      transactionId,
    };
  }
}
