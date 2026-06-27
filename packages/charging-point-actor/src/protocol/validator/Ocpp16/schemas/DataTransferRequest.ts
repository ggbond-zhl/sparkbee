import { z } from 'zod';

export const DataTransferRequestSchema = z.object({
  vendorId: z.string().max(255),
  messageId: z.string().max(50).optional(),
  data: z.string().optional(),
}).strict();
export type DataTransferRequest = z.infer<typeof DataTransferRequestSchema>;
