import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const SetNetworkProfileStatusEnumSchema = z.enum(["Accepted","Rejected","Failed"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const SetNetworkProfileResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": SetNetworkProfileStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type SetNetworkProfileResponse = z.infer<typeof SetNetworkProfileResponseSchema>;
