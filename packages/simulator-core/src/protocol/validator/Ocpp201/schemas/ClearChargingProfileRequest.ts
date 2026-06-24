import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingProfilePurposeEnumSchema = z.enum(["ChargingStationExternalConstraints","ChargingStationMaxProfile","TxDefaultProfile","TxProfile"]);

const ClearChargingProfileSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evseId": z.number().int().optional(),
  "chargingProfilePurpose": ChargingProfilePurposeEnumSchema.optional(),
  "stackLevel": z.number().int().optional()
}).strict();

export const ClearChargingProfileRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "chargingProfileId": z.number().int().optional(),
  "chargingProfileCriteria": ClearChargingProfileSchema.optional()
}).strict();
export type ClearChargingProfileRequest = z.infer<typeof ClearChargingProfileRequestSchema>;
