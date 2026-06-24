import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ClearChargingProfileStatusEnumSchema = z.enum(["Accepted","Unknown"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const ClearChargingProfileResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": ClearChargingProfileStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type ClearChargingProfileResponse = z.infer<typeof ClearChargingProfileResponseSchema>;
