import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const GetLocalListVersionRequestSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type GetLocalListVersionRequest = z.infer<typeof GetLocalListVersionRequestSchema>;
