import type { z } from "zod";

import type {
  chargingPointDetailResponseSchema,
  chargingPointSummaryResponseSchema,
  createChargingPointRequestSchema,
  createConnectorRequestSchema,
  listChargingPointsQuerySchema,
  listChargingPointsResponseSchema,
  updateChargingPointRequestSchema,
  updateConnectorRequestSchema,
  connectorResponseSchema,
} from "./schemas";

export type CreateChargingPointRequest = z.infer<typeof createChargingPointRequestSchema>;
export type UpdateChargingPointRequest = z.infer<typeof updateChargingPointRequestSchema>;
export type ChargingPointSummaryResponse = z.infer<typeof chargingPointSummaryResponseSchema>;
export type ChargingPointDetailResponse = z.infer<typeof chargingPointDetailResponseSchema>;
export type ListChargingPointsQuery = z.infer<typeof listChargingPointsQuerySchema>;
export type ListChargingPointsResponse = z.infer<typeof listChargingPointsResponseSchema>;
export type CreateConnectorRequest = z.infer<typeof createConnectorRequestSchema>;
export type UpdateConnectorRequest = z.infer<typeof updateConnectorRequestSchema>;
export type ConnectorResponse = z.infer<typeof connectorResponseSchema>;
