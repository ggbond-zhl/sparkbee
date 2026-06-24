import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const NotifyReportResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type NotifyReportResponse = z.infer<typeof NotifyReportResponseSchema>;
