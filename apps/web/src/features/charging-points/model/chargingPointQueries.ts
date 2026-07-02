import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  listChargingPoints,
  type ListChargingPointsInput,
} from "@/features/charging-points/api/chargingPoints";

export function chargingPointListQueryKey(input: ListChargingPointsInput) {
  return [
    "charging-points",
    {
      keyword: input.keyword ?? "",
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 20,
    },
  ] as const;
}

export function chargingPointListQueryOptions(input: ListChargingPointsInput) {
  return queryOptions({
    queryKey: chargingPointListQueryKey(input),
    queryFn: () => listChargingPoints(input),
    placeholderData: keepPreviousData,
  });
}
