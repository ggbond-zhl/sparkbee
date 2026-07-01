import {
  listChargingPointsResponseSchema,
  type ListChargingPointsResponse,
} from "@spark-bee/contracts";

export interface ListChargingPointsInput {
  keyword?: string;
}

export async function listChargingPoints(
  input: ListChargingPointsInput = {},
): Promise<ListChargingPointsResponse> {
  const search = new URLSearchParams({
    page: "1",
    pageSize: "20",
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
