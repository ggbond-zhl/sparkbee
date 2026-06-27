import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const MeterValuesResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type MeterValuesResponse = z.infer<typeof MeterValuesResponseSchema>;
