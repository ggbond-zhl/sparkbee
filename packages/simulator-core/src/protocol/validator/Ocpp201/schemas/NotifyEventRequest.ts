import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const EventNotificationEnumSchema = z.enum(["HardWiredNotification","HardWiredMonitor","PreconfiguredMonitor","CustomMonitor"]);

const EventTriggerEnumSchema = z.enum(["Alerting","Delta","Periodic"]);

const EVSESchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "connectorId": z.number().int().optional()
}).strict();

const ComponentSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evse": EVSESchema.optional(),
  "name": z.string().max(50),
  "instance": z.string().max(50).optional()
}).strict();

const VariableSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "name": z.string().max(50),
  "instance": z.string().max(50).optional()
}).strict();

const EventDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "eventId": z.number().int(),
  "timestamp": z.string().datetime({ offset: true }),
  "trigger": EventTriggerEnumSchema,
  "cause": z.number().int().optional(),
  "actualValue": z.string().max(2500),
  "techCode": z.string().max(50).optional(),
  "techInfo": z.string().max(500).optional(),
  "cleared": z.boolean().optional(),
  "transactionId": z.string().max(36).optional(),
  "component": ComponentSchema,
  "variableMonitoringId": z.number().int().optional(),
  "eventNotificationType": EventNotificationEnumSchema,
  "variable": VariableSchema
}).strict();

export const NotifyEventRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "generatedAt": z.string().datetime({ offset: true }),
  "tbc": z.boolean().optional(),
  "seqNo": z.number().int(),
  "eventData": z.array(EventDataSchema).min(1)
}).strict();
export type NotifyEventRequest = z.infer<typeof NotifyEventRequestSchema>;
