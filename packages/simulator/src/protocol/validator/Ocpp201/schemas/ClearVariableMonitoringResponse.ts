import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ClearMonitoringStatusEnumSchema = z.enum(["Accepted","Rejected","NotFound"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

const ClearMonitoringResultSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": ClearMonitoringStatusEnumSchema,
  "id": z.number().int(),
  "statusInfo": StatusInfoSchema.optional()
}).strict();

export const ClearVariableMonitoringResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "clearMonitoringResult": z.array(ClearMonitoringResultSchema).min(1)
}).strict();
export type ClearVariableMonitoringResponse = z.infer<typeof ClearVariableMonitoringResponseSchema>;
