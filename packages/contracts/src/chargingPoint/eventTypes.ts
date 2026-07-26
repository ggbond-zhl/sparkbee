import type { z } from "zod";

import type {
  authorizationStatusEventSchema,
  authorizationRuntimeSourceSchema,
  authorizationRuntimeStatusSchema,
  chargingPointActorEventSchema,
  chargingPointActorStatusSchema,
  chargingPointAvailabilityEventSchema,
  chargingPointEventErrorSchema,
  chargingPointEventStreamMessageSchema,
  chargingPointLifecycleEventSchema,
  chargingPointBootEventSchema,
  chargingPointSessionStatusSchema,
  chargingPointStatusEventSchema,
  connectorAvailabilityEventSchema,
  connectorStatusEventSchema,
  evseStatusEventSchema,
  protocolMessageEventSchema,
  protocolEventSchema,
  sessionOfflineReasonSchema,
  sessionStatusEventSchema,
  transactionMeterValueEventSchema,
  transactionStatusEventSchema,
  configurationChangedEventSchema,
  transactionDeliveryChangedEventSchema,
} from "./eventSchemas";
import type {
  connectorRuntimeStatusSchema,
  runtimeAvailabilitySchema,
  runtimeAvailabilityStatusSchema,
  runtimeEvseStatusSchema,
  runtimeTransactionStatusSchema,
} from "./schemas";

export type ChargingPointActorStatus = z.infer<typeof chargingPointActorStatusSchema>;
export type ChargingPointSessionStatus = z.infer<
  typeof chargingPointSessionStatusSchema
>;
export type ChargingPointAvailabilityStatus = z.infer<
  typeof runtimeAvailabilityStatusSchema
>;
export type RuntimeAvailability = z.infer<typeof runtimeAvailabilitySchema>;
export type ConnectorRuntimeStatus = z.infer<typeof connectorRuntimeStatusSchema>;
export type EVSERuntimeStatus = z.infer<typeof runtimeEvseStatusSchema>;
export type AuthorizationRuntimeStatus = z.infer<
  typeof authorizationRuntimeStatusSchema
>;
export type AuthorizationRuntimeSource = z.infer<
  typeof authorizationRuntimeSourceSchema
>;
export type TransactionRuntimeStatus = z.infer<
  typeof runtimeTransactionStatusSchema
>;
export type SessionOfflineReason = z.infer<typeof sessionOfflineReasonSchema>;
export type ChargingPointActorEventError = z.infer<
  typeof chargingPointEventErrorSchema
>;

export type ChargingPointLifecycleEvent = z.infer<
  typeof chargingPointLifecycleEventSchema
>;
export type ChargingPointBootEvent = z.infer<typeof chargingPointBootEventSchema>;
export type SessionStatusEvent = z.infer<typeof sessionStatusEventSchema>;
export type ChargingPointStatusEvent = z.infer<typeof chargingPointStatusEventSchema>;
export type ChargingPointAvailabilityEvent = z.infer<
  typeof chargingPointAvailabilityEventSchema
>;
export type EVSEStatusEvent = z.infer<typeof evseStatusEventSchema>;
export type ConnectorStatusEvent = z.infer<typeof connectorStatusEventSchema>;
export type ConnectorAvailabilityEvent = z.infer<
  typeof connectorAvailabilityEventSchema
>;
export type AuthorizationStatusEvent = z.infer<typeof authorizationStatusEventSchema>;
export type TransactionStatusEvent = z.infer<typeof transactionStatusEventSchema>;
export type TransactionMeterValueEvent = z.infer<
  typeof transactionMeterValueEventSchema
>;
export type ProtocolMessageEvent = z.infer<typeof protocolMessageEventSchema>;
export type ConfigurationChangedEvent = z.infer<
  typeof configurationChangedEventSchema
>;
export type TransactionDeliveryChangedEvent = z.infer<
  typeof transactionDeliveryChangedEventSchema
>;
export type ProtocolEvent = z.infer<typeof protocolEventSchema>;
export type HistoricalObservationEvent = z.infer<typeof protocolEventSchema>;
export type ChargingPointActorEvent = z.infer<typeof chargingPointActorEventSchema>;
export type ChargingPointEventStreamMessage = z.infer<
  typeof chargingPointEventStreamMessageSchema
>;
