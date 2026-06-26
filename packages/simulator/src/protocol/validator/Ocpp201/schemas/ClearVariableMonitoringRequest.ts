import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const ClearVariableMonitoringRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.array(z.number().int()).min(1)
}).strict();
export type ClearVariableMonitoringRequest = z.infer<typeof ClearVariableMonitoringRequestSchema>;
