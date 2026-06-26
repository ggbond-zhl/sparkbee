import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const CustomerInformationStatusEnumSchema = z.enum(["Accepted","Rejected","Invalid"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const CustomerInformationResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": CustomerInformationStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type CustomerInformationResponse = z.infer<typeof CustomerInformationResponseSchema>;
