import { queryOptions } from "@tanstack/react-query";

import {
  listChargingPoints,
  type ListChargingPointsInput,
} from "@/features/charging-points/api/chargingPoints";

export function chargingPointListQueryKey(input: ListChargingPointsInput) {
  return ["charging-points", { keyword: input.keyword ?? "" }] as const;
}

export function chargingPointListQueryOptions(input: ListChargingPointsInput) {
  return queryOptions({
    queryKey: chargingPointListQueryKey(input),
    queryFn: () => listChargingPoints(input),
  });
}
