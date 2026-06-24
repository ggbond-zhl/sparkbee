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
import { SimulatorError } from "../errors";
import type {
  Ocpp16SimulatorOptions,
  Simulator,
  SimulatorAuthorizeInput,
  SimulatorAuthorizeResult,
  SimulatorConnectorActionInput,
  SimulatorConnectorActionResult,
  SimulatorEventBus,
  SimulatorMeterValueInput,
  SimulatorMeterValueResult,
  SimulatorResourceRef,
  SimulatorStartResult,
  SimulatorStartTransactionInput,
  SimulatorStatus,
  SimulatorStopResult,
  SimulatorStopTransactionInput,
  SimulatorStopTransactionResult,
  SimulatorTransactionStartResult,
} from "../types";
import {
  createDefaultOcpp16Runtime,
  createDefaultSession,
} from "./defaults";
import {
  toPublicAuthorizeResult,
  toPublicTransactionStartResult,
  toSimulatorAuthorizeResult,
  toSimulatorConnectorActionResult,
  toSimulatorMeterValueResult,
  toSimulatorStopTransactionResult,
  toSimulatorTransactionStartResult,
} from "./resultMapping";
import type {
  Ocpp16SimulatorDependencies,
} from "./types";
import { Ocpp16EventEnvelope } from "./Ocpp16EventEnvelope";
import { Ocpp16StartupLifecycle } from "./Ocpp16StartupLifecycle";

export class Ocpp16Simulator implements Simulator {
  private status: SimulatorStatus = "stopped";
  private readonly clock: ProtocolClock;
  private readonly idGenerator: () => string;
  private readonly session: ISession;
  private readonly ocpp16Runtime: Ocpp16Runtime;
  private disposed = false;

  private readonly eventEnvelope: Ocpp16EventEnvelope;
  private readonly startupLifecycle: Ocpp16StartupLifecycle;

  readonly id: string;
  readonly protocol = "OCPP16J" as const;
  readonly events: SimulatorEventBus;
  constructor(
    options: Ocpp16SimulatorOptions,
    dependencies: Ocpp16SimulatorDependencies = {},
  ) {
    if (options.chargingPoint === undefined) {
      throw new SimulatorError(
        "SIMULATOR_INVALID_OPERATION",
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
      simulatorId: this.id,
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
        this.transitionSimulatorStatus(currentStatus, error),
    });
    this.events = this.eventEnvelope.events;
  }

  async start(): Promise<SimulatorStartResult> {
    this.requireNotDisposed();
    if (this.status !== "stopped") {
      throw new SimulatorError(
        "SIMULATOR_ALREADY_RUNNING",
        `充电桩 ${this.id} 已在运行`,
      );
    }

    return this.startupLifecycle.start();
  }

  async stop(): Promise<SimulatorStopResult> {
    if (this.status === "stopped") {
      return {
        chargingPointId: this.id,
        simulatorStatus: "stopped",
      };
    }

    try {
      this.startupLifecycle.clearBootRetryTimer();
      this.ocpp16Runtime.stopRuntime();
      if (this.session.isConnected()) {
        await this.session.disconnect();
      }
      this.transitionSimulatorStatus("stopped");

      return {
        chargingPointId: this.id,
        simulatorStatus: "stopped",
      };
    } catch (cause) {
      throw new SimulatorError(
        "SIMULATOR_STOP_FAILED",
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
    input: SimulatorConnectorActionInput,
  ): Promise<SimulatorConnectorActionResult> {
    this.requireStarted();
    const result = toSimulatorConnectorActionResult(
      await this.ocpp16Runtime.plugConnector(input),
    );

    return { chargingPointId: this.id, ...result };
  }

  async unplug(
    input: SimulatorConnectorActionInput,
  ): Promise<SimulatorConnectorActionResult> {
    this.requireStarted();
    const result = toSimulatorConnectorActionResult(
      await this.ocpp16Runtime.unplugConnector(input),
    );

    return { chargingPointId: this.id, ...result };
  }

  async authorize(
    input: SimulatorAuthorizeInput,
  ): Promise<SimulatorAuthorizeResult> {
    this.requireStarted();
    const result = toSimulatorAuthorizeResult(
      await this.ocpp16Runtime.authorize({
        connectorId: input.connectorId,
        idTag: input.idTag,
      }),
    );

    return toPublicAuthorizeResult(result);
  }

  async startTransaction(
    input: SimulatorStartTransactionInput,
  ): Promise<SimulatorTransactionStartResult> {
    this.requireStarted();
    if (this.ocpp16Runtime.getConnectorStatus(input) === undefined) {
      return {
        status: "rejected",
        reason: `枪口 ${input.evseId}/${input.connectorId} 不存在`,
      };
    }

    const result = toSimulatorTransactionStartResult(
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
    input: SimulatorMeterValueInput,
  ): Promise<SimulatorMeterValueResult> {
    this.requireStarted();
    this.requireTransactionResource(input.transactionId);
    return toSimulatorMeterValueResult(
      await this.ocpp16Runtime.reportMeterValue(input),
    );
  }

  async stopTransaction(
    input: SimulatorStopTransactionInput,
  ): Promise<SimulatorStopTransactionResult> {
    this.requireStarted();
    this.requireTransactionResource(input.transactionId);
    return toSimulatorStopTransactionResult(
      await this.ocpp16Runtime.stopTransaction(input),
    );
  }

  private requireNotDisposed(): void {
    if (this.disposed) {
      throw new SimulatorError(
        "SIMULATOR_INVALID_OPERATION",
        "simulator 已释放，不能继续使用",
      );
    }
  }

  private requireStarted(): void {
    this.requireNotDisposed();
    if (this.status !== "running" && this.status !== "starting") {
      throw new SimulatorError("SIMULATOR_NOT_RUNNING", "simulator 未运行");
    }
  }

  private readonly handleOnline = (): void => {
    this.startupLifecycle.handleOnline();
  };

  private transitionSimulatorStatus(
    currentStatus: SimulatorStatus,
    error?: { code: string; message: string },
  ): void {
    const previousStatus = this.status;
    this.status = currentStatus;
    this.eventEnvelope.publishSimulatorStatus(previousStatus, currentStatus, error);
  }

  private requireTransactionResource(
    transactionId: string | undefined,
  ): Extract<SimulatorResourceRef, { scope: "transaction" }> {
    if (transactionId === undefined || transactionId.length === 0) {
      throw new SimulatorError(
        "SIMULATOR_INVALID_OPERATION",
        "transactionId 不能为空",
      );
    }

    const resource = this.ocpp16Runtime.getTransactionResource(transactionId);
    if (resource === undefined) {
      throw new SimulatorError(
        "SIMULATOR_INVALID_OPERATION",
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
