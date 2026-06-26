import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const NotifyEVChargingNeedsStatusEnumSchema = z.enum(["Accepted","Rejected","Processing"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const NotifyEVChargingNeedsResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": NotifyEVChargingNeedsStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type NotifyEVChargingNeedsResponse = z.infer<typeof NotifyEVChargingNeedsResponseSchema>;
