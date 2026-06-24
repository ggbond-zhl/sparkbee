import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const MessageFormatEnumSchema = z.enum(["ASCII","HTML","URI","UTF8"]);

const MessagePriorityEnumSchema = z.enum(["AlwaysFront","InFront","NormalCycle"]);

const MessageStateEnumSchema = z.enum(["Charging","Faulted","Idle","Unavailable"]);

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

const MessageContentSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "format": MessageFormatEnumSchema,
  "language": z.string().max(8).optional(),
  "content": z.string().max(512)
}).strict();

const MessageInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "display": ComponentSchema.optional(),
  "id": z.number().int(),
  "priority": MessagePriorityEnumSchema,
  "state": MessageStateEnumSchema.optional(),
  "startDateTime": z.string().datetime({ offset: true }).optional(),
  "endDateTime": z.string().datetime({ offset: true }).optional(),
  "transactionId": z.string().max(36).optional(),
  "message": MessageContentSchema
}).strict();

export const NotifyDisplayMessagesRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "messageInfo": z.array(MessageInfoSchema).min(1).optional(),
  "requestId": z.number().int(),
  "tbc": z.boolean().optional()
}).strict();
export type NotifyDisplayMessagesRequest = z.infer<typeof NotifyDisplayMessagesRequestSchema>;
