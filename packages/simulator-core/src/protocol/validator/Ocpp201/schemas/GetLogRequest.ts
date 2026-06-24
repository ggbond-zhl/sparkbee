import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const LogEnumSchema = z.enum(["DiagnosticsLog","SecurityLog"]);

const LogParametersSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "remoteLocation": z.string().max(512),
  "oldestTimestamp": z.string().datetime({ offset: true }).optional(),
  "latestTimestamp": z.string().datetime({ offset: true }).optional()
}).strict();

export const GetLogRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "log": LogParametersSchema,
  "logType": LogEnumSchema,
  "requestId": z.number().int(),
  "retries": z.number().int().optional(),
  "retryInterval": z.number().int().optional()
}).strict();
export type GetLogRequest = z.infer<typeof GetLogRequestSchema>;
