import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ReportBaseEnumSchema = z.enum(["ConfigurationInventory","FullInventory","SummaryInventory"]);

export const GetBaseReportRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "requestId": z.number().int(),
  "reportBase": ReportBaseEnumSchema
}).strict();
export type GetBaseReportRequest = z.infer<typeof GetBaseReportRequestSchema>;
