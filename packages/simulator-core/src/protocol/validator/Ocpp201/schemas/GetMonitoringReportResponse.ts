import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const GenericDeviceModelStatusEnumSchema = z.enum(["Accepted","Rejected","NotSupported","EmptyResultSet"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const GetMonitoringReportResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": GenericDeviceModelStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type GetMonitoringReportResponse = z.infer<typeof GetMonitoringReportResponseSchema>;
