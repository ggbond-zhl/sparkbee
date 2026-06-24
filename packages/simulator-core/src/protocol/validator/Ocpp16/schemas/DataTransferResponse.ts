import { z } from 'zod';

export const DataTransferResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected', 'UnknownMessageId', 'UnknownVendorId']),
  data: z.string().optional(),
}).strict();
export type DataTransferResponse = z.infer<typeof DataTransferResponseSchema>;
