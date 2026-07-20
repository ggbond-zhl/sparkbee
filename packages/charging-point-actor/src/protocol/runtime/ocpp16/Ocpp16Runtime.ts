import type { InboundRequest } from "../../session/types";
import type {
  ChargingPointStatus,
  TransactionState,
  ConnectorStatus,
  EVSEStatus,
} from "../../../model";
import { boot as bootAction } from "./actions/boot";
import {
  markPlatformOffline,
  sendHeartbeat as sendHeartbeatAction,
  startHeartbeatLoop as startHeartbeatLoopAction,
  stopHeartbeatLoop as stopHeartbeatLoopAction,
} from "./actions/heartbeat";
import { handleInboundRequest as handleInboundRequestAction } from "./commands";
import { Ocpp16ConnectorTopology } from "./Ocpp16ConnectorTopology";
import {
  plugConnector as plugConnectorAction,
  unplugConnector as unplugConnectorAction,
} from "./actions/connectorActions";
import { authorize as authorizeAction } from "./actions/authorization";
import {
  reportChargingPointStatus as reportChargingPointStatusAction,
  reportConnectorStatus as reportConnectorStatusAction,
} from "./actions/statusNotification";
import {
  createOcpp16RuntimeContext,
  type Ocpp16RuntimeContext,
} from "./state";
import {
  getOcpp16TransactionDelivery,
  type Ocpp16TransactionDelivery,
} from "./Ocpp16TransactionDelivery";
import {
  emitChargingPointAvailabilitySnapshot,
  emitConnectorAvailabilitySnapshot,
} from "./events";
import { restartActiveMeterValueLoops } from "./actions/meterValues";
import { restorePersistedTransactions } from "./transactionPersistence";
import type {
  Ocpp16BootResult,
  Ocpp16AuthorizeInput,
  Ocpp16AuthorizeResult,
  Ocpp16RuntimeOptions,
  Ocpp16ConnectorActionInput,
  Ocpp16ConnectorActionResult,
  Ocpp16HeartbeatLoopOptions,
  Ocpp16HeartbeatResult,
  Ocpp16MeterValueInput,
  Ocpp16MeterValuesResult,
  Ocpp16ReportConnectorStatusInput,
  Ocpp16RuntimeSnapshot,
  Ocpp16RuntimeEvents,
  Ocpp16RuntimeEventListener,
  Ocpp16StartTransactionInput,
  Ocpp16StatusNotificationResult,
  Ocpp16StopTransactionInput,
  Ocpp16StopTransactionResult,
  Ocpp16TransactionStartResult,
} from "./types";

export class Ocpp16Runtime {
  private readonly context: Ocpp16RuntimeContext;

  private readonly connectorTopology: Ocpp16ConnectorTopology;

  private readonly transactionDelivery: Ocpp16TransactionDelivery;

  private readonly runtimeEventListeners = new Set<Ocpp16RuntimeEventListener>();

  private inboundRequestListener!: (request: InboundRequest) => void;

  private onlineListener!: () => void;

  private offlineListener!: () => void;

  constructor(options: Ocpp16RuntimeOptions) {
    this.context = createOcpp16RuntimeContext(options, this.emitRuntimeEvent);
    this.connectorTopology = new Ocpp16ConnectorTopology(this.context);
    this.transactionDelivery = getOcpp16TransactionDelivery(this.context);
    this.initializeListeners();
    this.bindContextEvents();
  }

  private initializeListeners(): void {
    this.inboundRequestListener = (request: InboundRequest): void => {
      void this.handleInboundRequest(request).catch(() => {
        void request.reject("InternalError", "处理入站请求失败");
      });
    };
    this.onlineListener = (): void => {
      const heartbeatLoopOptions = this.context.heartbeatLoopOptions;
      if (
        heartbeatLoopOptions === null ||
        this.context.registrationStatus !== "Accepted"
      ) {
        return;
      }

      startHeartbeatLoopAction(this.context, heartbeatLoopOptions);
      void sendHeartbeatAction(this.context).catch(() => undefined);
    };
    this.offlineListener = (): void => {
      markPlatformOffline(this.context);
    };
  }

  private bindContextEvents(): void {
    this.context.session.on("inboundRequest", this.inboundRequestListener);
    this.context.session.on("online", this.onlineListener);
    this.context.session.on("offline", this.offlineListener);
  }

  boot(): Promise<Ocpp16BootResult> {
    return bootAction(this.context);
  }

  sendHeartbeat(): Promise<Ocpp16HeartbeatResult> {
    return sendHeartbeatAction(this.context);
  }

  reportConnectorStatus(
    input: Ocpp16ReportConnectorStatusInput,
  ): Promise<Ocpp16StatusNotificationResult> {
    return reportConnectorStatusAction(this.context, input);
  }

  reportChargingPointStatus(): Promise<Ocpp16StatusNotificationResult> {
    return reportChargingPointStatusAction(this.context);
  }

  publishChargingPointAvailabilitySnapshot(): void {
    emitChargingPointAvailabilitySnapshot(this.context, {});
  }

  publishConnectorAvailabilitySnapshot(
    input: Ocpp16ConnectorActionInput,
  ): void {
    emitConnectorAvailabilitySnapshot(this.context, input);
  }

  startHeartbeatLoop(options: Ocpp16HeartbeatLoopOptions = {}): void {
    startHeartbeatLoopAction(this.context, options);
  }

  stopHeartbeatLoop(): void {
    stopHeartbeatLoopAction(this.context);
  }

  plugConnector(
    input: Ocpp16ConnectorActionInput,
  ): Promise<Ocpp16ConnectorActionResult> {
    return plugConnectorAction(this.context, input);
  }

  unplugConnector(
    input: Ocpp16ConnectorActionInput,
  ): Promise<Ocpp16ConnectorActionResult> {
    return unplugConnectorAction(this.context, input);
  }

  authorize(input: Ocpp16AuthorizeInput): Promise<Ocpp16AuthorizeResult> {
    return authorizeAction(this.context, input);
  }

  startLocalTransaction(
    input: Ocpp16StartTransactionInput,
  ): Promise<Ocpp16TransactionStartResult> {
    return this.transactionDelivery.start(input);
  }

  restorePersistedTransactions(): Promise<void> {
    return restorePersistedTransactions(this.context);
  }

  resumeActiveTransactionSampling(): void {
    restartActiveMeterValueLoops(this.context);
  }

  reportMeterValue(
    input: Ocpp16MeterValueInput,
  ): Promise<Ocpp16MeterValuesResult> {
    return this.transactionDelivery.recordMeterValue(input);
  }

  stopTransaction(
    input: Ocpp16StopTransactionInput,
  ): Promise<Ocpp16StopTransactionResult> {
    return this.transactionDelivery.stop(input);
  }

  on<K extends keyof Ocpp16RuntimeEvents>(
    event: K,
    listener: Ocpp16RuntimeEvents[K],
  ): this {
    if (event === "runtimeEvent") {
      this.runtimeEventListeners.add(listener);
    }

    return this;
  }

  off<K extends keyof Ocpp16RuntimeEvents>(
    event: K,
    listener: Ocpp16RuntimeEvents[K],
  ): this {
    if (event === "runtimeEvent") {
      this.runtimeEventListeners.delete(listener);
    }

    return this;
  }

  handleInboundRequest(request: InboundRequest): Promise<void> {
    return handleInboundRequestAction(this.context, request);
  }

  getChargingPointStatus(): ChargingPointStatus {
    return this.context.chargingPoint.status;
  }

  getEvseStatus(evseId: number): EVSEStatus | undefined {
    return this.connectorTopology.getEvseStatus(evseId);
  }

  getConnectorStatus(input: {
    evseId: number;
    connectorId: number;
  }): ConnectorStatus | undefined {
    return this.connectorTopology.getConnectorStatus(input);
  }

  listConnectorRefs(): Array<{ evseId: number; connectorId: number }> {
    return this.connectorTopology.listConnectorRefs();
  }

  getTransactionState(transactionId: string): TransactionState | undefined {
    return this.context.transactions.get(transactionId)?.state;
  }

  getTransactionResource(transactionId: string): {
    evseId: number;
    connectorId: number;
    ocppTransactionId: number | null;
  } | undefined {
    return this.connectorTopology.getTransactionResource(transactionId);
  }

  getRuntimeSnapshot(): Ocpp16RuntimeSnapshot {
    return {
      chargingPoint: {
        status: this.context.chargingPoint.status,
        availability: this.context.chargingPoint.availability,
        evses: this.context.chargingPoint.listEvses(),
      },
      configurationStore: this.context.configurationStore,
      authorizationGrants: [...this.context.authorizationGrants.values()],
      transactions: [...this.context.transactions.values()],
      heartbeatTimerActive: this.context.heartbeatTimerId !== null,
    };
  }

  stopRuntime(): void {
    this.stopHeartbeatLoop();
    this.context.heartbeatLoopOptions = null;
    this.transactionDelivery.stopAll();
  }

  dispose(): void {
    this.stopRuntime();
    this.context.session.off("inboundRequest", this.inboundRequestListener);
    this.context.session.off("online", this.onlineListener);
    this.context.session.off("offline", this.offlineListener);
    this.runtimeEventListeners.clear();
  }

  private readonly emitRuntimeEvent: Ocpp16RuntimeEventListener = (event): void => {
    for (const listener of [...this.runtimeEventListeners]) {
      try {
        listener(event);
      } catch {
        // Runtime observers are runtime-log only and must not affect protocol flow.
      }
    }
  };
}
