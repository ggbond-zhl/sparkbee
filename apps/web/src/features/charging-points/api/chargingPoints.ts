import {
  chargingPointDetailResponseSchema,
  type ChargingPointDetailResponse,
  connectorResponseSchema,
  type ConnectorResponse,
  type CreateConnectorRequest,
  type CreateChargingPointRequest,
  listChargingPointsResponseSchema,
  type ListChargingPointsResponse,
  type PageSize,
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
