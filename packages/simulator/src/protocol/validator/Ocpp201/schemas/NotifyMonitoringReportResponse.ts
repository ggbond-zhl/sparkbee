import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const NotifyMonitoringReportResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type NotifyMonitoringReportResponse = z.infer<typeof NotifyMonitoringReportResponseSchema>;
