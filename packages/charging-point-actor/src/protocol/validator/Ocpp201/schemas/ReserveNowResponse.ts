import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ReserveNowStatusEnumSchema = z.enum(["Accepted","Faulted","Occupied","Rejected","Unavailable"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const ReserveNowResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": ReserveNowStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type ReserveNowResponse = z.infer<typeof ReserveNowResponseSchema>;
