import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const ReportChargingProfilesResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type ReportChargingProfilesResponse = z.infer<typeof ReportChargingProfilesResponseSchema>;
