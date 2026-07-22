import type {
  ChargingPointConnectorActionResponse,
  ChargingPointDetailResponse,
  ConnectorResponse,
  RuntimeAuthorizeRequest,
  RuntimeAuthorizeResponse,
  ActiveTransactionSamplesResponse,
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
  type ChargingPointActor,
  type ChargingPointActorAuthorizeResult,
  type ChargingPointActorConnectorActionResult,
  type ChargingPointActorStopTransactionResult,
  type ChargingPointActorTransactionStartResult,
} from "../../lib/chargingPointActor";
import { ChargingPointActorHost } from "../../lib/chargingPointActorHost";
import type { ChargingPointStreamEvent } from "../../lib/chargingPointEventStreamHub";
import { AppError } from "../../utils/errors";
import { RuntimeOperationRepository } from "./runtimeOperation.repo";
import { ChargingTransactionRepository } from "../chargingTransaction/chargingTransaction.repo";
import {
  RuntimeOperationLifecycle,
  toRuntimeOperationResponse,
  type ChargingPointActorFactory,
} from "./runtimeOperation.lifecycle";

export type { ChargingPointActorFactory } from "./runtimeOperation.lifecycle";

export interface RuntimeOperationServiceDependencies {
  chargingPointActorHost?: ChargingPointActorHost;
  createChargingPointActor?: ChargingPointActorFactory;
  chargingTransactionRepository?: ChargingTransactionRepository;
}

export function createRuntimeOperationService(
  database: ServerDatabase,
  dependencies: RuntimeOperationServiceDependencies = {},
) {
  return new RuntimeOperationService(
    new RuntimeOperationRepository(database),
    dependencies.chargingTransactionRepository ??
      new ChargingTransactionRepository(database),
    dependencies,
  );
}

export class RuntimeOperationService {
  private readonly actorHost: ChargingPointActorHost;
  private readonly lifecycle: RuntimeOperationLifecycle;

  constructor(
    private readonly repository: RuntimeOperationRepository,
    private readonly chargingTransactionRepository: ChargingTransactionRepository,
    dependencies: RuntimeOperationServiceDependencies = {},
  ) {
    this.actorHost = dependencies.chargingPointActorHost ?? new ChargingPointActorHost();
    this.lifecycle = new RuntimeOperationLifecycle(
      repository,
      chargingTransactionRepository,
      {
        actorHost: this.actorHost,
        actorFactory: dependencies.createChargingPointActor,
      },
    );
  }

  async start(id: string): Promise<RuntimeOperationResponse> {
    return this.lifecycle.start(id);
  }

  async stop(id: string): Promise<RuntimeOperationResponse> {
    return this.lifecycle.stop(id);
  }

  async getStatus(id: string): Promise<RuntimeOperationResponse> {
    await this.repository.getOperationDetail(id);
    return toRuntimeOperationResponse(id, this.actorHost.get(id));
  }

  async getRuntimeSnapshot(id: string): Promise<RuntimeSnapshotResponse> {
    await this.repository.getOperationDetail(id);
    const runtimeStatus = toRuntimeOperationResponse(id, this.actorHost.get(id));

    return this.actorHost.getRuntimeSnapshot(id, runtimeStatus);
  }

  async getActiveTransactionSamples(
    id: string,
  ): Promise<ActiveTransactionSamplesResponse> {
    await this.repository.getOperationDetail(id);
    return this.chargingTransactionRepository.listActiveSamples(id);
  }

  async recoverActiveTransactions(): Promise<{
    recovered: string[];
    failed: Array<{ chargingPointId: string; error: unknown }>;
  }> {
    return this.lifecycle.recoverActiveTransactions();
  }

  async subscribeToEvents(
    id: string,
    listener: (event: ChargingPointStreamEvent) => void,
  ): Promise<{ snapshot: RuntimeSnapshotResponse; unsubscribe: () => void }> {
    await this.repository.getOperationDetail(id);
    const runtimeStatus = toRuntimeOperationResponse(id, this.actorHost.get(id));
    return this.actorHost.subscribeWithSnapshot(id, runtimeStatus, listener);
  }

  async plug(
    chargingPointId: string,
    connectorId: string,
  ): Promise<ChargingPointConnectorActionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    return this.applyConnectorAction(chargingPoint, connectorId, "plug");
  }

  async unplug(
    chargingPointId: string,
    connectorId: string,
  ): Promise<ChargingPointConnectorActionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    return this.applyConnectorAction(chargingPoint, connectorId, "unplug");
  }

  async authorize(
    chargingPointId: string,
    connectorId: string,
    input: RuntimeAuthorizeRequest,
  ): Promise<RuntimeAuthorizeResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    const connector = this.requireConnector(chargingPoint, connectorId);
    const actor = this.requireRunningActor(chargingPoint.id);

    try {
      const result = await actor.authorize({
        evseId: connector.evseId,
        connectorId: connector.connectorId,
        idTag: input.idTag,
      });

      return this.toAuthorizeResponse(chargingPoint.id, connector, result, input);
    } catch (error) {
      throw this.mapAuthorizeError(error);
    }
  }

  async startTransaction(
    chargingPointId: string,
    connectorId: string,
    input: RuntimeStartTransactionRequest,
  ): Promise<RuntimeStartTransactionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    const connector = this.requireConnector(chargingPoint, connectorId);
    const actor = this.requireRunningActor(chargingPoint.id);

    try {
      const result = await actor.startTransaction({
        evseId: connector.evseId,
        connectorId: connector.connectorId,
        idTag: input.idTag,
        meterStartWh: input.meterStartWh,
        reservationId: input.reservationId,
      });
      return this.toStartTransactionResponse(
        chargingPoint.id,
        connector,
        result,
        input,
      );
    } catch (error) {
      throw this.mapTransactionError(error);
    }
  }

  async stopTransaction(
    chargingPointId: string,
    connectorId: string,
    input: RuntimeStopTransactionRequest,
  ): Promise<RuntimeStopTransactionResponse> {
    const chargingPoint = await this.repository.getOperationDetail(chargingPointId);
    const connector = this.requireConnector(chargingPoint, connectorId);
    const actor = this.requireRunningActor(chargingPoint.id);
    const resource = actor.getTransactionResource(input.transactionId);
    if (
      resource === undefined ||
      resource.evseId !== connector.evseId ||
      resource.connectorId !== connector.connectorId
    ) {
      throw new AppError(
        409,
        "TRANSACTION_CONNECTOR_MISMATCH",
        "Transaction does not belong to connector",
      );
    }

    try {
      const result = await actor.stopTransaction({
        transactionId: input.transactionId,
        reason: input.reason,
        meterStopWh: input.meterStopWh,
        idTag: input.idTag,
      });
      return this.toStopTransactionResponse(
        chargingPoint.id,
        connector,
        result,
        input.transactionId,
      );
    } catch (error) {
      throw this.mapTransactionError(error);
    }
  }

  private async applyConnectorAction(
    chargingPoint: ChargingPointDetailResponse,
    connectorId: string,
    action: "plug" | "unplug",
  ): Promise<ChargingPointConnectorActionResponse> {
    const connector = this.requireConnector(chargingPoint, connectorId);
    const actor = this.requireRunningActor(chargingPoint.id);

    try {
      const result = await actor[action]({
        evseId: connector.evseId,
        connectorId: connector.connectorId,
      });

      return this.toConnectorActionResponse(connector.id, result);
    } catch (error) {
      throw this.mapConnectorActionError(error);
    }
  }

  private requireConnector(
    chargingPoint: ChargingPointDetailResponse,
    connectorId: string,
  ): ConnectorResponse {
    const connector = chargingPoint.connectors.find((item) => item.id === connectorId);
    if (connector === undefined) {
      throw new AppError(404, "CONNECTOR_NOT_FOUND", "Connector not found");
    }

    return connector;
  }

  private requireRunningActor(chargingPointId: string): ChargingPointActor {
    const actor = this.actorHost.get(chargingPointId);
    if (actor === undefined) {
      throw new AppError(
        409,
        "CHARGING_POINT_NOT_RUNNING",
        "Charging point is not running",
      );
    }

    return actor;
  }

  private toConnectorActionResponse(
    connectorId: string,
    result: ChargingPointActorConnectorActionResult,
  ): ChargingPointConnectorActionResponse {
    return {
      chargingPointId: result.chargingPointId,
      connectorId,
      evseId: result.evseId,
      protocolConnectorId: result.connectorId,
      plugState: result.plugState,
      vehiclePresence: result.vehiclePresence,
      connectorStatus: result.connectorStatus,
    };
  }

  private toAuthorizeResponse(
    chargingPointId: string,
    connector: ConnectorResponse,
    result: ChargingPointActorAuthorizeResult,
    input: RuntimeAuthorizeRequest,
  ): RuntimeAuthorizeResponse {
    const base = {
      chargingPointId,
      connectorId: connector.id,
      evseId: connector.evseId,
      protocolConnectorId: connector.connectorId,
      idTag: input.idTag,
    };

    if (result.status === "accepted") {
      return { ...base, status: "accepted" };
    }

    if (result.status === "rejected") {
      return {
        ...base,
        status: "rejected",
        reason: result.reason,
        authorizationStatus: result.authorizationStatus,
      };
    }

    return {
      ...base,
      status: "failed",
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      shouldReconnect: result.shouldReconnect,
    };
  }

  private toStartTransactionResponse(
    chargingPointId: string,
    connector: ConnectorResponse,
    result: ChargingPointActorTransactionStartResult,
    input: RuntimeStartTransactionRequest,
  ): RuntimeStartTransactionResponse {
    const base = this.toConnectorOperationBase(chargingPointId, connector);

    if (result.status === "accepted") {
      return {
        ...base,
        status: "accepted",
        transactionId: result.transactionId,
        idTag: input.idTag,
      };
    }

    return {
      ...base,
      status: "rejected",
      idTag: input.idTag,
      reason: result.reason,
      authorizationStatus: result.authorizationStatus,
    };
  }

  private toStopTransactionResponse(
    chargingPointId: string,
    connector: ConnectorResponse,
    result: ChargingPointActorStopTransactionResult,
    transactionId: string,
  ): RuntimeStopTransactionResponse {
    const base = this.toConnectorOperationBase(chargingPointId, connector);

    if (result.status === "accepted") {
      return {
        ...base,
        status: "accepted",
        transactionId: result.transactionId,
        meterStopWh: result.meterStopWh,
        stoppedAt: result.stoppedAt.toISOString(),
      };
    }

    return {
      ...base,
      status: "failed",
      transactionId,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      shouldReconnect: result.shouldReconnect,
    };
  }

  private toConnectorOperationBase(
    chargingPointId: string,
    connector: ConnectorResponse,
  ) {
    return {
      chargingPointId,
      connectorId: connector.id,
      evseId: connector.evseId,
      protocolConnectorId: connector.connectorId,
    };
  }

  private mapConnectorActionError(error: unknown): AppError {
    if (
      error instanceof ChargingPointActorError &&
      error.code === "CHARGING_POINT_ACTOR_NOT_RUNNING"
    ) {
      return new AppError(
        409,
        "CHARGING_POINT_NOT_RUNNING",
        "Charging point is not running",
      );
    }

    if (
      error instanceof ChargingPointActorError &&
      error.code === "CHARGING_POINT_ACTOR_INVALID_OPERATION"
    ) {
      return new AppError(409, "CONNECTOR_OPERATION_CONFLICT", error.message);
    }

    return new AppError(
      502,
      "CONNECTOR_OPERATION_FAILED",
      "Connector operation failed",
    );
  }

  private mapAuthorizeError(error: unknown): AppError {
    if (
      error instanceof ChargingPointActorError &&
      error.code === "CHARGING_POINT_ACTOR_NOT_RUNNING"
    ) {
      return new AppError(
        409,
        "CHARGING_POINT_NOT_RUNNING",
        "Charging point is not running",
      );
    }

    return new AppError(
      502,
      "AUTHORIZATION_OPERATION_FAILED",
      "Authorization operation failed",
    );
  }

  private mapTransactionError(error: unknown): AppError {
    if (
      error instanceof ChargingPointActorError &&
      error.code === "CHARGING_POINT_ACTOR_NOT_RUNNING"
    ) {
      return new AppError(
        409,
        "CHARGING_POINT_NOT_RUNNING",
        "Charging point is not running",
      );
    }

    if (
      error instanceof ChargingPointActorError &&
      error.code === "CHARGING_POINT_ACTOR_INVALID_OPERATION"
    ) {
      return new AppError(409, "TRANSACTION_OPERATION_FAILED", error.message);
    }

    return new AppError(
      502,
      "TRANSACTION_OPERATION_FAILED",
      "Transaction operation failed",
    );
  }

}
