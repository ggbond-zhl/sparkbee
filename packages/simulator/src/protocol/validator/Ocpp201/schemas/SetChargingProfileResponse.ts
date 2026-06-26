import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingProfileStatusEnumSchema = z.enum(["Accepted","Rejected"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const SetChargingProfileResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": ChargingProfileStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type SetChargingProfileResponse = z.infer<typeof SetChargingProfileResponseSchema>;
