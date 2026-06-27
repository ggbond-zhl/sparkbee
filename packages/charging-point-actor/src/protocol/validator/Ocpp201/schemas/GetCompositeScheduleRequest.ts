import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingRateUnitEnumSchema = z.enum(["W","A"]);

export const GetCompositeScheduleRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "duration": z.number().int(),
  "chargingRateUnit": ChargingRateUnitEnumSchema.optional(),
  "evseId": z.number().int()
}).strict();
export type GetCompositeScheduleRequest = z.infer<typeof GetCompositeScheduleRequestSchema>;
