import type {
  Ocpp16Runtime,
} from "../../protocol/runtime";
import type {
  ISession,
} from "../../protocol/session/types";
import {
  createProtocolClock,
  type ProtocolClock,
} from "../../protocol/runtime/ocpp16/protocolClock";
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
  private status: ChargingPointActorStatus = "stopped";
  private readonly clock: ProtocolClock;
  private readonly idGenerator: () => string;
  private readonly session: ISession;
  private readonly ocpp16Runtime: Ocpp16Runtime;
  private disposed = false;

  private readonly eventEnvelope: Ocpp16EventEnvelope;
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
    this.ocpp16Runtime =
      dependencies.ocpp16Runtime ??
      createDefaultOcpp16Runtime(this.session, options, {
        protocolClock: this.clock,
        idGenerator: this.idGenerator,
        configurationCatalog:
          dependencies.configurationCatalog ?? options.configurationCatalog,
      });
    this.eventEnvelope = new Ocpp16EventEnvelope({
      chargingPointActorId: this.id,
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
      getStatus: () => this.status,
      isDisposed: () => this.disposed,
      transitionStatus: (currentStatus, error) =>
        this.transitionChargingPointActorStatus(currentStatus, error),
    });
    this.events = this.eventEnvelope.events;
  }

  async start(): Promise<ChargingPointActorStartResult> {
    this.requireNotDisposed();
    if (this.status !== "stopped") {
      throw new ChargingPointActorError(
        "CHARGING_POINT_ACTOR_ALREADY_RUNNING",
        `充电桩 ${this.id} 已在运行`,
      );
    }

    return this.startupLifecycle.start();
  }

  async stop(): Promise<ChargingPointActorStopResult> {
    if (this.status === "stopped") {
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
      this.eventEnvelope.dispose();
      this.ocpp16Runtime.dispose();
      this.disposed = true;
    }
  }

  async plug(
    input: ChargingPointActorConnectorActionInput,
  ): Promise<ChargingPointActorConnectorActionResult> {
    this.requireStarted();
    const result = toChargingPointActorConnectorActionResult(
      await this.ocpp16Runtime.plugConnector(input),
    );

    return { chargingPointId: this.id, ...result };
  }

  async unplug(
    input: ChargingPointActorConnectorActionInput,
  ): Promise<ChargingPointActorConnectorActionResult> {
    this.requireStarted();
    const result = toChargingPointActorConnectorActionResult(
      await this.ocpp16Runtime.unplugConnector(input),
    );

    return { chargingPointId: this.id, ...result };
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
    if (this.status !== "running" && this.status !== "starting") {
      throw new ChargingPointActorError("CHARGING_POINT_ACTOR_NOT_RUNNING", "actor 未运行");
    }
  }

  private readonly handleOnline = (): void => {
    this.startupLifecycle.handleOnline();
  };

  private transitionChargingPointActorStatus(
    currentStatus: ChargingPointActorStatus,
    error?: { code: string; message: string },
  ): void {
    const previousStatus = this.status;
    this.status = currentStatus;
    this.eventEnvelope.publishChargingPointActorStatus(previousStatus, currentStatus, error);
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
