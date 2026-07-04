import type { z } from "zod";

import type {
  chargingPointDetailResponseSchema,
  chargingPointConnectorActionResponseSchema,
  runtimeOperationResponseSchema,
  runtimeSnapshotResponseSchema,
  runtimeAuthorizeRequestSchema,
  runtimeAuthorizeResponseSchema,
  runtimeStartTransactionRequestSchema,
  runtimeStartTransactionResponseSchema,
  runtimeStopTransactionRequestSchema,
  runtimeStopTransactionResponseSchema,
  runtimeTransactionStopReasonSchema,
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
export type RuntimeSnapshotResponse = z.infer<typeof runtimeSnapshotResponseSchema>;
export type ChargingPointConnectorActionResponse = z.infer<
  typeof chargingPointConnectorActionResponseSchema
>;
export type RuntimeAuthorizeRequest = z.infer<typeof runtimeAuthorizeRequestSchema>;
export type RuntimeAuthorizeResponse = z.infer<typeof runtimeAuthorizeResponseSchema>;
export type RuntimeStartTransactionRequest = z.infer<
  typeof runtimeStartTransactionRequestSchema
>;
export type RuntimeStartTransactionResponse = z.infer<
  typeof runtimeStartTransactionResponseSchema
>;
export type RuntimeTransactionStopReason = z.infer<
  typeof runtimeTransactionStopReasonSchema
>;
export type RuntimeStopTransactionRequest = z.infer<
  typeof runtimeStopTransactionRequestSchema
>;
export type RuntimeStopTransactionResponse = z.infer<
  typeof runtimeStopTransactionResponseSchema
>;
export type ListChargingPointsQuery = z.infer<typeof listChargingPointsQuerySchema>;
export type ListChargingPointsResponse = z.infer<typeof listChargingPointsResponseSchema>;
export type CreateConnectorRequest = z.infer<typeof createConnectorRequestSchema>;
export type UpdateConnectorRequest = z.infer<typeof updateConnectorRequestSchema>;
export type ConnectorResponse = z.infer<typeof connectorResponseSchema>;
