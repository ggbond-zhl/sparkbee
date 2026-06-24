import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const NotifyEventResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type NotifyEventResponse = z.infer<typeof NotifyEventResponseSchema>;
