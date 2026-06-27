import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const MessagePriorityEnumSchema = z.enum(["AlwaysFront","InFront","NormalCycle"]);

const MessageStateEnumSchema = z.enum(["Charging","Faulted","Idle","Unavailable"]);

export const GetDisplayMessagesRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.array(z.number().int()).min(1).optional(),
  "requestId": z.number().int(),
  "priority": MessagePriorityEnumSchema.optional(),
  "state": MessageStateEnumSchema.optional()
}).strict();
export type GetDisplayMessagesRequest = z.infer<typeof GetDisplayMessagesRequestSchema>;
