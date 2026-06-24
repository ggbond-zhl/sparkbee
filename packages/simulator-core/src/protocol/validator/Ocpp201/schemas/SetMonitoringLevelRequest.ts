import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const SetMonitoringLevelRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "severity": z.number().int()
}).strict();
export type SetMonitoringLevelRequest = z.infer<typeof SetMonitoringLevelRequestSchema>;
