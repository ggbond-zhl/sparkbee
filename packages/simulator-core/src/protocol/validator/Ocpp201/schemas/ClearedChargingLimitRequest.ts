import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingLimitSourceEnumSchema = z.enum(["EMS","Other","SO","CSO"]);

export const ClearedChargingLimitRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "chargingLimitSource": ChargingLimitSourceEnumSchema,
  "evseId": z.number().int().optional()
}).strict();
export type ClearedChargingLimitRequest = z.infer<typeof ClearedChargingLimitRequestSchema>;
