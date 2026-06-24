import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const LogStatusEnumSchema = z.enum(["Accepted","Rejected","AcceptedCanceled"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const GetLogResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": LogStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional(),
  "filename": z.string().max(255).optional()
}).strict();
export type GetLogResponse = z.infer<typeof GetLogResponseSchema>;
