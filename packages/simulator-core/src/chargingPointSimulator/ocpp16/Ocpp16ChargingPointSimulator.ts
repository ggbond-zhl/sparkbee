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
import { ChargingPointSimulatorError } from "../errors";
import type {
  Ocpp16ChargingPointSimulatorOptions,
  ChargingPointSimulator,
  ChargingPointSimulatorAuthorizeInput,
  ChargingPointSimulatorAuthorizeResult,
  ChargingPointSimulatorConnectorActionInput,
  ChargingPointSimulatorConnectorActionResult,
  ChargingPointSimulatorEventBus,
  ChargingPointSimulatorMeterValueInput,
  ChargingPointSimulatorMeterValueResult,
  ChargingPointSimulatorResourceRef,
  ChargingPointSimulatorStartResult,
  ChargingPointSimulatorStartTransactionInput,
  ChargingPointSimulatorStatus,
  ChargingPointSimulatorStopResult,
  ChargingPointSimulatorStopTransactionInput,
  ChargingPointSimulatorStopTransactionResult,
  ChargingPointSimulatorTransactionStartResult,
} from "../types";
import {
  createDefaultOcpp16Runtime,
  createDefaultSession,
} from "./defaults";
import {
  toPublicAuthorizeResult,
  toPublicTransactionStartResult,
  toChargingPointSimulatorAuthorizeResult,
  toChargingPointSimulatorConnectorActionResult,
  toChargingPointSimulatorMeterValueResult,
  toChargingPointSimulatorStopTransactionResult,
  toChargingPointSimulatorTransactionStartResult,
} from "./resultMapping";
import type {
  Ocpp16ChargingPointSimulatorDependencies,
} from "./types";
import { Ocpp16EventEnvelope } from "./Ocpp16EventEnvelope";
import { Ocpp16StartupLifecycle } from "./Ocpp16StartupLifecycle";

export class Ocpp16ChargingPointSimulator implements ChargingPointSimulator {
  private status: ChargingPointSimulatorStatus = "stopped";
  private readonly clock: ProtocolClock;
  private readonly idGenerator: () => string;
  private readonly session: ISession;
  private readonly ocpp16Runtime: Ocpp16Runtime;
  private disposed = false;

  private readonly eventEnvelope: Ocpp16EventEnvelope;
  private readonly startupLifecycle: Ocpp16StartupLifecycle;

  readonly id: string;
  readonly protocol = "OCPP16J" as const;
  readonly events: ChargingPointSimulatorEventBus;
  constructor(
    options: Ocpp16ChargingPointSimulatorOptions,
    dependencies: Ocpp16ChargingPointSimulatorDependencies = {},
  ) {
    if (options.chargingPoint === undefined) {
      throw new ChargingPointSimulatorError(
        "CHARGING_POINT_SIMULATOR_INVALID_OPERATION",
        "OCPP16J simulator 需要 chargingPoint",
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
      chargingPointSimulatorId: this.id,
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
        this.transitionChargingPointSimulatorStatus(currentStatus, error),
    });
    this.events = this.eventEnvelope.events;
  }

  async start(): Promise<ChargingPointSimulatorStartResult> {
    this.requireNotDisposed();
    if (this.status !== "stopped") {
      throw new ChargingPointSimulatorError(
        "CHARGING_POINT_SIMULATOR_ALREADY_RUNNING",
        `充电桩 ${this.id} 已在运行`,
      );
    }

    return this.startupLifecycle.start();
  }

  async stop(): Promise<ChargingPointSimulatorStopResult> {
    if (this.status === "stopped") {
      return {
        chargingPointId: this.id,
        chargingPointSimulatorStatus: "stopped",
      };
    }

    try {
      this.startupLifecycle.clearBootRetryTimer();
      this.ocpp16Runtime.stopRuntime();
      if (this.session.isConnected()) {
        await this.session.disconnect();
      }
      this.transitionChargingPointSimulatorStatus("stopped");

      return {
        chargingPointId: this.id,
        chargingPointSimulatorStatus: "stopped",
      };
    } catch (cause) {
      throw new ChargingPointSimulatorError(
        "CHARGING_POINT_SIMULATOR_STOP_FAILED",
        "simulator 停止失败",
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
    input: ChargingPointSimulatorConnectorActionInput,
  ): Promise<ChargingPointSimulatorConnectorActionResult> {
    this.requireStarted();
    const result = toChargingPointSimulatorConnectorActionResult(
      await this.ocpp16Runtime.plugConnector(input),
    );

    return { chargingPointId: this.id, ...result };
  }

  async unplug(
    input: ChargingPointSimulatorConnectorActionInput,
  ): Promise<ChargingPointSimulatorConnectorActionResult> {
    this.requireStarted();
    const result = toChargingPointSimulatorConnectorActionResult(
      await this.ocpp16Runtime.unplugConnector(input),
    );

    return { chargingPointId: this.id, ...result };
  }

  async authorize(
    input: ChargingPointSimulatorAuthorizeInput,
  ): Promise<ChargingPointSimulatorAuthorizeResult> {
    this.requireStarted();
    const result = toChargingPointSimulatorAuthorizeResult(
      await this.ocpp16Runtime.authorize({
        connectorId: input.connectorId,
        idTag: input.idTag,
      }),
    );

    return toPublicAuthorizeResult(result);
  }

  async startTransaction(
    input: ChargingPointSimulatorStartTransactionInput,
  ): Promise<ChargingPointSimulatorTransactionStartResult> {
    this.requireStarted();
    if (this.ocpp16Runtime.getConnectorStatus(input) === undefined) {
      return {
        status: "rejected",
        reason: `枪口 ${input.evseId}/${input.connectorId} 不存在`,
      };
    }

    const result = toChargingPointSimulatorTransactionStartResult(
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
    input: ChargingPointSimulatorMeterValueInput,
  ): Promise<ChargingPointSimulatorMeterValueResult> {
    this.requireStarted();
    this.requireTransactionResource(input.transactionId);
    return toChargingPointSimulatorMeterValueResult(
      await this.ocpp16Runtime.reportMeterValue(input),
    );
  }

  async stopTransaction(
    input: ChargingPointSimulatorStopTransactionInput,
  ): Promise<ChargingPointSimulatorStopTransactionResult> {
    this.requireStarted();
    this.requireTransactionResource(input.transactionId);
    return toChargingPointSimulatorStopTransactionResult(
      await this.ocpp16Runtime.stopTransaction(input),
    );
  }

  private requireNotDisposed(): void {
    if (this.disposed) {
      throw new ChargingPointSimulatorError(
        "CHARGING_POINT_SIMULATOR_INVALID_OPERATION",
        "simulator 已释放，不能继续使用",
      );
    }
  }

  private requireStarted(): void {
    this.requireNotDisposed();
    if (this.status !== "running" && this.status !== "starting") {
      throw new ChargingPointSimulatorError("CHARGING_POINT_SIMULATOR_NOT_RUNNING", "simulator 未运行");
    }
  }

  private readonly handleOnline = (): void => {
    this.startupLifecycle.handleOnline();
  };

  private transitionChargingPointSimulatorStatus(
    currentStatus: ChargingPointSimulatorStatus,
    error?: { code: string; message: string },
  ): void {
    const previousStatus = this.status;
    this.status = currentStatus;
    this.eventEnvelope.publishChargingPointSimulatorStatus(previousStatus, currentStatus, error);
  }

  private requireTransactionResource(
    transactionId: string | undefined,
  ): Extract<ChargingPointSimulatorResourceRef, { scope: "transaction" }> {
    if (transactionId === undefined || transactionId.length === 0) {
      throw new ChargingPointSimulatorError(
        "CHARGING_POINT_SIMULATOR_INVALID_OPERATION",
        "transactionId 不能为空",
      );
    }

    const resource = this.ocpp16Runtime.getTransactionResource(transactionId);
    if (resource === undefined) {
      throw new ChargingPointSimulatorError(
        "CHARGING_POINT_SIMULATOR_INVALID_OPERATION",
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
