import {
  chargingPointDetailResponseSchema,
  chargingPointEventStreamMessageSchema,
  chargingPointEventStreamTypes,
  chargingPointConnectorActionResponseSchema,
  type ChargingPointEventStreamMessage,
  type ChargingPointConnectorActionResponse,
  type ChargingPointDetailResponse,
  connectorResponseSchema,
  type ConnectorResponse,
  type CreateConnectorRequest,
  type CreateChargingPointRequest,
  listChargingPointsResponseSchema,
  type ListChargingPointsResponse,
  type PageSize,
  runtimeOperationResponseSchema,
  type RuntimeOperationResponse,
  runtimeAuthorizeRequestSchema,
  runtimeAuthorizeResponseSchema,
  type RuntimeAuthorizeRequest,
  type RuntimeAuthorizeResponse,
  runtimeSnapshotResponseSchema,
  type RuntimeSnapshotResponse,
  runtimeStartTransactionRequestSchema,
  runtimeStartTransactionResponseSchema,
  type RuntimeStartTransactionRequest,
  type RuntimeStartTransactionResponse,
  runtimeStopTransactionRequestSchema,
  runtimeStopTransactionResponseSchema,
  type RuntimeStopTransactionRequest,
  type RuntimeStopTransactionResponse,
  type UpdateChargingPointRequest,
  type UpdateConnectorRequest,
} from "@spark-bee/contracts";

export interface ListChargingPointsInput {
  keyword?: string;
  page?: number;
  pageSize?: PageSize;
}

export async function listChargingPoints(
  input: ListChargingPointsInput = {},
): Promise<ListChargingPointsResponse> {
  const search = new URLSearchParams({
    page: String(input.page ?? 1),
    pageSize: String(input.pageSize ?? 20),
  });
  const keyword = input.keyword?.trim();
  if (keyword) {
    search.set("keyword", keyword);
  }

  const response = await fetch(`/api/charging-points?${search.toString()}`);
  if (!response.ok) {
    throw new Error("充电桩列表加载失败");
  }

  return listChargingPointsResponseSchema.parse(await response.json());
}

export async function createChargingPoint(
  input: CreateChargingPointRequest,
): Promise<ChargingPointDetailResponse> {
  const response = await fetch("/api/charging-points", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("充电桩创建失败");
  }

  return chargingPointDetailResponseSchema.parse(await response.json());
}

export async function getChargingPoint(
  id: string,
): Promise<ChargingPointDetailResponse> {
  const response = await fetch(`/api/charging-points/${id}`);
  if (!response.ok) {
    throw new Error("桩实例详情加载失败");
  }

  return chargingPointDetailResponseSchema.parse(await response.json());
}

export async function updateChargingPoint(
  id: string,
  input: UpdateChargingPointRequest,
): Promise<ChargingPointDetailResponse> {
  const response = await fetch(`/api/charging-points/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("充电桩更新失败");
  }

  return chargingPointDetailResponseSchema.parse(await response.json());
}

export async function deleteChargingPoint(id: string): Promise<void> {
  const response = await fetch(`/api/charging-points/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("充电桩删除失败");
  }
}

export async function getChargingPointRuntimeStatus(
  id: string,
): Promise<RuntimeOperationResponse> {
  const response = await fetch(`/api/charging-points/${id}/status`);
  if (!response.ok) {
    throw new Error("桩实例运行状态加载失败");
  }

  return runtimeOperationResponseSchema.parse(await response.json());
}

export async function getChargingPointRuntimeSnapshot(
  id: string,
): Promise<RuntimeSnapshotResponse> {
  const response = await fetch(`/api/charging-points/${id}/runtime-snapshot`);
  if (!response.ok) {
    throw new Error("桩实例运行状态快照加载失败");
  }

  return runtimeSnapshotResponseSchema.parse(await response.json());
}

async function applyChargingPointRuntimeOperation(
  id: string,
  operation: "start" | "stop",
): Promise<RuntimeOperationResponse> {
  const response = await fetch(`/api/charging-points/${id}/${operation}`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(operation === "start" ? "桩实例启动失败" : "桩实例停止失败");
  }

  return runtimeOperationResponseSchema.parse(await response.json());
}

export function startChargingPoint(id: string): Promise<RuntimeOperationResponse> {
  return applyChargingPointRuntimeOperation(id, "start");
}

export function stopChargingPoint(id: string): Promise<RuntimeOperationResponse> {
  return applyChargingPointRuntimeOperation(id, "stop");
}

async function applyConnectorRuntimeAction(
  chargingPointId: string,
  connectorId: string,
  action: "plug" | "unplug",
): Promise<ChargingPointConnectorActionResponse> {
  const response = await fetch(
    `/api/charging-points/${chargingPointId}/connectors/${connectorId}/${action}`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(action === "plug" ? "插枪失败" : "拔枪失败");
  }

  return chargingPointConnectorActionResponseSchema.parse(await response.json());
}

export function plugConnector(
  chargingPointId: string,
  connectorId: string,
): Promise<ChargingPointConnectorActionResponse> {
  return applyConnectorRuntimeAction(chargingPointId, connectorId, "plug");
}

export function unplugConnector(
  chargingPointId: string,
  connectorId: string,
): Promise<ChargingPointConnectorActionResponse> {
  return applyConnectorRuntimeAction(chargingPointId, connectorId, "unplug");
}

export async function authorizeConnector(
  chargingPointId: string,
  connectorId: string,
  input: RuntimeAuthorizeRequest,
): Promise<RuntimeAuthorizeResponse> {
  const response = await fetch(
    `/api/charging-points/${chargingPointId}/connectors/${connectorId}/authorize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(runtimeAuthorizeRequestSchema.parse(input)),
    },
  );
  if (!response.ok) {
    throw new Error("鉴权失败");
  }

  return runtimeAuthorizeResponseSchema.parse(await response.json());
}

export async function startConnectorTransaction(
  chargingPointId: string,
  connectorId: string,
  input: RuntimeStartTransactionRequest,
): Promise<RuntimeStartTransactionResponse> {
  const response = await fetch(
    `/api/charging-points/${chargingPointId}/connectors/${connectorId}/start-transaction`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(runtimeStartTransactionRequestSchema.parse(input)),
    },
  );
  if (!response.ok) {
    throw new Error("启动充电失败");
  }

  return runtimeStartTransactionResponseSchema.parse(await response.json());
}

export async function authorizeAndStartConnectorTransaction(
  chargingPointId: string,
  connectorId: string,
  input: RuntimeStartTransactionRequest,
): Promise<RuntimeStartTransactionResponse> {
  const authorization = await authorizeConnector(chargingPointId, connectorId, {
    idTag: input.idTag,
  });

  if (authorization.status === "accepted") {
    return startConnectorTransaction(chargingPointId, connectorId, input);
  }

  if (authorization.status === "rejected") {
    return runtimeStartTransactionResponseSchema.parse({
      chargingPointId: authorization.chargingPointId,
      connectorId: authorization.connectorId,
      evseId: authorization.evseId,
      protocolConnectorId: authorization.protocolConnectorId,
      status: "rejected",
      idTag: authorization.idTag,
      reason: authorization.reason,
      authorizationStatus: authorization.authorizationStatus,
    });
  }

  return runtimeStartTransactionResponseSchema.parse({
    chargingPointId: authorization.chargingPointId,
    connectorId: authorization.connectorId,
    evseId: authorization.evseId,
    protocolConnectorId: authorization.protocolConnectorId,
    status: "rejected",
    idTag: authorization.idTag,
    reason: authorization.errorMessage,
  });
}

export async function stopConnectorTransaction(
  chargingPointId: string,
  connectorId: string,
  input: RuntimeStopTransactionRequest,
): Promise<RuntimeStopTransactionResponse> {
  const response = await fetch(
    `/api/charging-points/${chargingPointId}/connectors/${connectorId}/stop-transaction`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(runtimeStopTransactionRequestSchema.parse(input)),
    },
  );
  if (!response.ok) {
    throw new Error("停止充电失败");
  }

  return runtimeStopTransactionResponseSchema.parse(await response.json());
}

export interface ChargingPointEventSubscriptionHandlers {
  onEvent(message: ChargingPointEventStreamMessage): void;
  onError?(event: Event): void;
}

export function subscribeChargingPointEvents(
  id: string,
  handlers: ChargingPointEventSubscriptionHandlers,
): () => void {
  const source = new EventSource(`/api/charging-points/${id}/events`);
  const listeners = chargingPointEventStreamTypes.map((eventType) => {
    const listener = (event: MessageEvent<string>) => {
      handlers.onEvent(
        chargingPointEventStreamMessageSchema.parse({
          event: eventType,
          data: JSON.parse(event.data),
        }),
      );
    };
    source.addEventListener(eventType, listener);

    return { eventType, listener };
  });

  source.onerror = (event) => {
    handlers.onError?.(event);
  };

  return () => {
    for (const { eventType, listener } of listeners) {
      source.removeEventListener(eventType, listener);
    }
    source.close();
  };
}

export async function listConnectors(
  chargingPointId: string,
): Promise<ConnectorResponse[]> {
  const response = await fetch(
    `/api/charging-points/${chargingPointId}/connectors`,
  );
  if (!response.ok) {
    throw new Error("枪口列表加载失败");
  }

  return connectorResponseSchema.array().parse(await response.json());
}

export async function createConnector(
  chargingPointId: string,
  input: CreateConnectorRequest,
): Promise<ConnectorResponse> {
  const response = await fetch(`/api/charging-points/${chargingPointId}/connectors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("枪口创建失败");
  }

  return connectorResponseSchema.parse(await response.json());
}

export async function updateConnector(
  chargingPointId: string,
  connectorId: string,
  input: UpdateConnectorRequest,
): Promise<ConnectorResponse> {
  const response = await fetch(
    `/api/charging-points/${chargingPointId}/connectors/${connectorId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error("枪口更新失败");
  }

  return connectorResponseSchema.parse(await response.json());
}

export async function deleteConnector(
  chargingPointId: string,
  connectorId: string,
): Promise<void> {
  const response = await fetch(
    `/api/charging-points/${chargingPointId}/connectors/${connectorId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error("枪口删除失败");
  }
}
