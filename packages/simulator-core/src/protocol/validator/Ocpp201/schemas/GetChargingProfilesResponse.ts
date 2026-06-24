import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const GetChargingProfileStatusEnumSchema = z.enum(["Accepted","NoProfiles"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const GetChargingProfilesResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": GetChargingProfileStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type GetChargingProfilesResponse = z.infer<typeof GetChargingProfilesResponseSchema>;
