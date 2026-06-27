import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const DataTransferRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "messageId": z.string().max(50).optional(),
  "data": z.unknown().optional(),
  "vendorId": z.string().max(255)
}).strict();
export type DataTransferRequest = z.infer<typeof DataTransferRequestSchema>;
