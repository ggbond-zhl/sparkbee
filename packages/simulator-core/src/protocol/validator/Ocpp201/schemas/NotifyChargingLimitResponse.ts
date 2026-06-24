import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const NotifyChargingLimitResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type NotifyChargingLimitResponse = z.infer<typeof NotifyChargingLimitResponseSchema>;
