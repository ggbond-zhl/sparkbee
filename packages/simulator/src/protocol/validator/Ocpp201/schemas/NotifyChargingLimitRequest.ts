import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingLimitSourceEnumSchema = z.enum(["EMS","Other","SO","CSO"]);

const ChargingRateUnitEnumSchema = z.enum(["W","A"]);

const CostKindEnumSchema = z.enum(["CarbonDioxideEmission","RelativePricePercentage","RenewableGenerationPercentage"]);

const ChargingLimitSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "chargingLimitSource": ChargingLimitSourceEnumSchema,
  "isGridCritical": z.boolean().optional()
}).strict();

const ChargingSchedulePeriodSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "startPeriod": z.number().int(),
  "limit": z.number(),
  "numberPhases": z.number().int().optional(),
  "phaseToUse": z.number().int().optional()
}).strict();

const RelativeTimeIntervalSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "start": z.number().int(),
  "duration": z.number().int().optional()
}).strict();

const CostSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "costKind": CostKindEnumSchema,
  "amount": z.number().int(),
  "amountMultiplier": z.number().int().optional()
}).strict();

const ConsumptionCostSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "startValue": z.number(),
  "cost": z.array(CostSchema).min(1).max(3)
}).strict();

const SalesTariffEntrySchema = z.object({
  "customData": CustomDataSchema.optional(),
  "relativeTimeInterval": RelativeTimeIntervalSchema,
  "ePriceLevel": z.number().int().gte(0).optional(),
  "consumptionCost": z.array(ConsumptionCostSchema).min(1).max(3).optional()
}).strict();

const SalesTariffSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "salesTariffDescription": z.string().max(32).optional(),
  "numEPriceLevels": z.number().int().optional(),
  "salesTariffEntry": z.array(SalesTariffEntrySchema).min(1).max(1024)
}).strict();

const ChargingScheduleSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "startSchedule": z.string().datetime({ offset: true }).optional(),
  "duration": z.number().int().optional(),
  "chargingRateUnit": ChargingRateUnitEnumSchema,
  "chargingSchedulePeriod": z.array(ChargingSchedulePeriodSchema).min(1).max(1024),
  "minChargingRate": z.number().optional(),
  "salesTariff": SalesTariffSchema.optional()
}).strict();

export const NotifyChargingLimitRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "chargingSchedule": z.array(ChargingScheduleSchema).min(1).optional(),
  "evseId": z.number().int().optional(),
  "chargingLimit": ChargingLimitSchema
}).strict();
export type NotifyChargingLimitRequest = z.infer<typeof NotifyChargingLimitRequestSchema>;
