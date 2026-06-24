import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingLimitSourceEnumSchema = z.enum(["EMS","Other","SO","CSO"]);

const ChargingProfilePurposeEnumSchema = z.enum(["ChargingStationExternalConstraints","ChargingStationMaxProfile","TxDefaultProfile","TxProfile"]);

const ChargingProfileCriterionSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "chargingProfilePurpose": ChargingProfilePurposeEnumSchema.optional(),
  "stackLevel": z.number().int().optional(),
  "chargingProfileId": z.array(z.number().int()).min(1).optional(),
  "chargingLimitSource": z.array(ChargingLimitSourceEnumSchema).min(1).max(4).optional()
}).strict();

export const GetChargingProfilesRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "requestId": z.number().int(),
  "evseId": z.number().int().optional(),
  "chargingProfile": ChargingProfileCriterionSchema
}).strict();
export type GetChargingProfilesRequest = z.infer<typeof GetChargingProfilesRequestSchema>;
