import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const EnergyTransferModeEnumSchema = z.enum(["DC","AC_single_phase","AC_two_phase","AC_three_phase"]);

const ACChargingParametersSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "energyAmount": z.number().int(),
  "evMinCurrent": z.number().int(),
  "evMaxCurrent": z.number().int(),
  "evMaxVoltage": z.number().int()
}).strict();

const DCChargingParametersSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evMaxCurrent": z.number().int(),
  "evMaxVoltage": z.number().int(),
  "energyAmount": z.number().int().optional(),
  "evMaxPower": z.number().int().optional(),
  "stateOfCharge": z.number().int().gte(0).lte(100).optional(),
  "evEnergyCapacity": z.number().int().optional(),
  "fullSoC": z.number().int().gte(0).lte(100).optional(),
  "bulkSoC": z.number().int().gte(0).lte(100).optional()
}).strict();

const ChargingNeedsSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "acChargingParameters": ACChargingParametersSchema.optional(),
  "dcChargingParameters": DCChargingParametersSchema.optional(),
  "requestedEnergyTransfer": EnergyTransferModeEnumSchema,
  "departureTime": z.string().datetime({ offset: true }).optional()
}).strict();

export const NotifyEVChargingNeedsRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "maxScheduleTuples": z.number().int().optional(),
  "chargingNeeds": ChargingNeedsSchema,
  "evseId": z.number().int()
}).strict();
export type NotifyEVChargingNeedsRequest = z.infer<typeof NotifyEVChargingNeedsRequestSchema>;
