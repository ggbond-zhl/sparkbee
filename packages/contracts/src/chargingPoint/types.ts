import type { z } from "zod";

import type {
  chargingPointDetailResponseSchema,
  chargingPointConnectorActionResponseSchema,
  runtimeOperationResponseSchema,
  chargingPointSummaryResponseSchema,
  connectorResponseSchema,
  createChargingPointRequestSchema,
  createConnectorRequestSchema,
  listChargingPointsQuerySchema,
  listChargingPointsResponseSchema,
  updateChargingPointRequestSchema,
  updateConnectorRequestSchema,
} from "./schemas";

export type CreateChargingPointRequest = z.infer<typeof createChargingPointRequestSchema>;
export type UpdateChargingPointRequest = z.infer<typeof updateChargingPointRequestSchema>;
export type ChargingPointSummaryResponse = z.infer<typeof chargingPointSummaryResponseSchema>;
export type ChargingPointDetailResponse = z.infer<typeof chargingPointDetailResponseSchema>;
export type RuntimeOperationResponse = z.infer<typeof runtimeOperationResponseSchema>;
export type ChargingPointConnectorActionResponse = z.infer<
  typeof chargingPointConnectorActionResponseSchema
>;
export type ListChargingPointsQuery = z.infer<typeof listChargingPointsQuerySchema>;
export type ListChargingPointsResponse = z.infer<typeof listChargingPointsResponseSchema>;
export type CreateConnectorRequest = z.infer<typeof createConnectorRequestSchema>;
export type UpdateConnectorRequest = z.infer<typeof updateConnectorRequestSchema>;
export type ConnectorResponse = z.infer<typeof connectorResponseSchema>;
