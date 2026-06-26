import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const ClearedChargingLimitResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type ClearedChargingLimitResponse = z.infer<typeof ClearedChargingLimitResponseSchema>;
