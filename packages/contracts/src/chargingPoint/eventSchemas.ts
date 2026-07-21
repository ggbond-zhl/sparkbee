import { z } from "zod";

import {
  chargingPointProtocolSchema,
  connectorRuntimeStatusSchema,
  runtimeAvailabilitySchema,
  runtimeAvailabilityStatusSchema,
  runtimeEvseStatusSchema,
  runtimeSnapshotResponseSchema,
  runtimeTransactionStatusSchema,
} from "./schemas";

export const chargingPointActorStatusSchema = z.enum([
  "starting",
  "running",
  "stopped",
]);

export const chargingPointSessionStatusSchema = z.enum([
  "online",
  "reconnecting",
  "offline",
]);

export const authorizationRuntimeStatusSchema = z.enum([
  "accepted",
  "blocked",
  "expired",
  "invalid",
  "concurrent-transaction",
]);

export const authorizationRuntimeSourceSchema = z.enum([
  "online",
  "local-list",
  "cache",
  "default-policy",
]);

export const sessionOfflineReasonSchema = z.enum([
  "intentional",
  "unexpected_disconnect",
  "reconnect_exhausted",
]);

interface ChargingPointEventErrorCause {
  name?: string;
  code?: string;
  message?: string;
  cause?: ChargingPointEventErrorCause;
}

export const chargingPointEventErrorCauseSchema: z.ZodType<
  ChargingPointEventErrorCause
> = z.lazy(() =>
  z.object({
    name: z.string().optional(),
    code: z.string().optional(),
    message: z.string().optional(),
    cause: chargingPointEventErrorCauseSchema.optional(),
  }),
).meta({
  id: "ChargingPointEventErrorCause",
  description: "协议事件错误原因，可递归包含底层原因。",
});

export const chargingPointEventErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  cause: chargingPointEventErrorCauseSchema.optional(),
});

const chargingPointResourceSchema = z.object({ scope: z.literal("chargingPoint") });
const sessionResourceSchema = z.object({ scope: z.literal("session") });
const evseResourceSchema = z.object({
  scope: z.literal("evse"),
  evseId: z.number().int().positive(),
});
const connectorResourceSchema = z.object({
  scope: z.literal("connector"),
  evseId: z.number().int().positive(),
  connectorId: z.number().int().positive(),
});
const authorizationResourceSchema = z.object({
  scope: z.literal("authorization"),
  idTag: z.string(),
  evseId: z.number().int().positive().optional(),
  connectorId: z.number().int().positive().optional(),
});
const transactionResourceSchema = z.object({
  scope: z.literal("transaction"),
  evseId: z.number().int().positive(),
  connectorId: z.number().int().positive(),
  transactionId: z.string().optional(),
});
const transactionMeterValueResourceSchema = transactionResourceSchema.extend({
  transactionId: z.string(),
});
const protocolResourceSchema = z.object({ scope: z.literal("protocol") });

const eventBaseSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  chargingPointId: z.string().uuid(),
  protocol: chargingPointProtocolSchema,
  occurredAt: z.string().datetime(),
});

export const chargingPointLifecycleEventSchema = eventBaseSchema.extend({
  type: z.literal("chargingPoint.lifecycle"),
  resource: chargingPointResourceSchema,
  previousStatus: chargingPointActorStatusSchema.nullable(),
  currentStatus: chargingPointActorStatusSchema,
  error: chargingPointEventErrorSchema.optional(),
});

export const chargingPointBootEventSchema = eventBaseSchema.extend({
  type: z.literal("chargingPoint.boot"),
  resource: chargingPointResourceSchema,
  status: z.enum(["Accepted", "Pending", "Rejected"]),
  retryAfterSec: z.number().int().nonnegative().optional(),
});

export const sessionStatusEventSchema = eventBaseSchema.extend({
  type: z.literal("session.status"),
  resource: sessionResourceSchema,
  previousStatus: chargingPointSessionStatusSchema.nullable(),
  currentStatus: chargingPointSessionStatusSchema,
  connectionUrl: z.string(),
  attempt: z.number().int().positive().optional(),
  reason: sessionOfflineReasonSchema.optional(),
  error: chargingPointEventErrorSchema.optional(),
});

export const chargingPointStatusEventSchema = eventBaseSchema.extend({
  type: z.literal("chargingPoint.status"),
  resource: chargingPointResourceSchema,
  previousStatus: runtimeAvailabilityStatusSchema.nullable(),
  currentStatus: runtimeAvailabilityStatusSchema,
  error: chargingPointEventErrorSchema.optional(),
});

export const chargingPointAvailabilityEventSchema = eventBaseSchema.extend({
  type: z.literal("chargingPoint.availability"),
  resource: chargingPointResourceSchema,
  previousAvailability: runtimeAvailabilitySchema.nullable(),
  currentAvailability: runtimeAvailabilitySchema,
  requestedAvailability: runtimeAvailabilitySchema.optional(),
});

export const evseStatusEventSchema = eventBaseSchema.extend({
  type: z.literal("evse.status"),
  resource: evseResourceSchema,
  previousStatus: runtimeEvseStatusSchema.nullable(),
  currentStatus: runtimeEvseStatusSchema,
  error: chargingPointEventErrorSchema.optional(),
});

export const connectorStatusEventSchema = eventBaseSchema.extend({
  type: z.literal("connector.status"),
  resource: connectorResourceSchema,
  previousStatus: connectorRuntimeStatusSchema.nullable(),
  currentStatus: connectorRuntimeStatusSchema,
  error: chargingPointEventErrorSchema.optional(),
});

export const connectorAvailabilityEventSchema = eventBaseSchema.extend({
  type: z.literal("connector.availability"),
  resource: connectorResourceSchema,
  previousAvailability: runtimeAvailabilitySchema.nullable(),
  currentAvailability: runtimeAvailabilitySchema,
  requestedAvailability: runtimeAvailabilitySchema.optional(),
});

export const authorizationStatusEventSchema = eventBaseSchema.extend({
  type: z.literal("authorization.status"),
  resource: authorizationResourceSchema,
  status: authorizationRuntimeStatusSchema,
  source: authorizationRuntimeSourceSchema,
  protocolStatus: z.string().optional(),
});

export const transactionStatusEventSchema = eventBaseSchema.extend({
  type: z.literal("transaction.status"),
  resource: transactionResourceSchema,
  previousStatus: runtimeTransactionStatusSchema.nullable(),
  currentStatus: runtimeTransactionStatusSchema,
  reason: z.string().optional(),
  error: chargingPointEventErrorSchema.optional(),
});

export const transactionMeterValueEventSchema = eventBaseSchema.extend({
  type: z.literal("transaction.meterValue"),
  resource: transactionMeterValueResourceSchema,
  meterWh: z.number().nonnegative(),
  powerW: z.number().nonnegative(),
  currentA: z.number().nonnegative(),
  voltageV: z.number().nonnegative(),
  sampledAt: z.string().datetime(),
});

export const protocolMessageEventSchema = eventBaseSchema.extend({
  type: z.literal("protocol.message"),
  resource: protocolResourceSchema,
  direction: z.enum(["sent", "received"]),
  action: z.string().optional(),
  messageId: z.string().optional(),
  body: z.unknown().optional(),
});

export const protocolEventTypeSchema = z.enum([
  "chargingPoint.lifecycle",
  "chargingPoint.boot",
  "session.status",
  "chargingPoint.status",
  "chargingPoint.availability",
  "evse.status",
  "connector.status",
  "connector.availability",
  "authorization.status",
  "transaction.status",
  "transaction.meterValue",
]);

export const protocolEventSchema = z.discriminatedUnion("type", [
  chargingPointLifecycleEventSchema,
  chargingPointBootEventSchema,
  sessionStatusEventSchema,
  chargingPointStatusEventSchema,
  chargingPointAvailabilityEventSchema,
  evseStatusEventSchema,
  connectorStatusEventSchema,
  connectorAvailabilityEventSchema,
  authorizationStatusEventSchema,
  transactionStatusEventSchema,
  transactionMeterValueEventSchema,
]);

export const chargingPointActorEventSchema = z.discriminatedUnion("type", [
  chargingPointLifecycleEventSchema,
  chargingPointBootEventSchema,
  sessionStatusEventSchema,
  chargingPointStatusEventSchema,
  chargingPointAvailabilityEventSchema,
  evseStatusEventSchema,
  connectorStatusEventSchema,
  connectorAvailabilityEventSchema,
  authorizationStatusEventSchema,
  transactionStatusEventSchema,
  transactionMeterValueEventSchema,
  protocolMessageEventSchema,
]);

export const chargingPointEventStreamTypes = [
  "snapshot",
  "chargingPoint.lifecycle",
  "chargingPoint.boot",
  "session.status",
  "chargingPoint.status",
  "chargingPoint.availability",
  "evse.status",
  "connector.status",
  "connector.availability",
  "authorization.status",
  "transaction.status",
  "transaction.meterValue",
  "protocol.message",
  "deleted",
] as const;

export const chargingPointEventStreamMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("snapshot"), data: runtimeSnapshotResponseSchema }),
  z.object({
    event: z.literal("chargingPoint.lifecycle"),
    data: chargingPointLifecycleEventSchema,
  }),
  z.object({
    event: z.literal("chargingPoint.boot"),
    data: chargingPointBootEventSchema,
  }),
  z.object({ event: z.literal("session.status"), data: sessionStatusEventSchema }),
  z.object({
    event: z.literal("chargingPoint.status"),
    data: chargingPointStatusEventSchema,
  }),
  z.object({
    event: z.literal("chargingPoint.availability"),
    data: chargingPointAvailabilityEventSchema,
  }),
  z.object({ event: z.literal("evse.status"), data: evseStatusEventSchema }),
  z.object({
    event: z.literal("connector.status"),
    data: connectorStatusEventSchema,
  }),
  z.object({
    event: z.literal("connector.availability"),
    data: connectorAvailabilityEventSchema,
  }),
  z.object({
    event: z.literal("authorization.status"),
    data: authorizationStatusEventSchema,
  }),
  z.object({
    event: z.literal("transaction.status"),
    data: transactionStatusEventSchema,
  }),
  z.object({
    event: z.literal("transaction.meterValue"),
    data: transactionMeterValueEventSchema,
  }),
  z.object({
    event: z.literal("protocol.message"),
    data: protocolMessageEventSchema,
  }),
  z.object({
    event: z.literal("deleted"),
    data: z.object({ chargingPointId: z.string().uuid() }),
  }),
]);
