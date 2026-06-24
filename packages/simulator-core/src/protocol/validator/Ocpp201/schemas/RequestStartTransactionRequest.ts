import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingProfileKindEnumSchema = z.enum(["Absolute","Recurring","Relative"]);

const ChargingProfilePurposeEnumSchema = z.enum(["ChargingStationExternalConstraints","ChargingStationMaxProfile","TxDefaultProfile","TxProfile"]);

const ChargingRateUnitEnumSchema = z.enum(["W","A"]);

const CostKindEnumSchema = z.enum(["CarbonDioxideEmission","RelativePricePercentage","RenewableGenerationPercentage"]);

const IdTokenEnumSchema = z.enum(["Central","eMAID","ISO14443","ISO15693","KeyCode","Local","MacAddress","NoAuthorization"]);

const RecurrencyKindEnumSchema = z.enum(["Daily","Weekly"]);

const AdditionalInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "additionalIdToken": z.string().max(36),
  "type": z.string().max(50)
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

const ChargingProfileSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "stackLevel": z.number().int(),
  "chargingProfilePurpose": ChargingProfilePurposeEnumSchema,
  "chargingProfileKind": ChargingProfileKindEnumSchema,
  "recurrencyKind": RecurrencyKindEnumSchema.optional(),
  "validFrom": z.string().datetime({ offset: true }).optional(),
  "validTo": z.string().datetime({ offset: true }).optional(),
  "chargingSchedule": z.array(ChargingScheduleSchema).min(1).max(3),
  "transactionId": z.string().max(36).optional()
}).strict();

const IdTokenSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "additionalInfo": z.array(AdditionalInfoSchema).min(1).optional(),
  "idToken": z.string().max(36),
  "type": IdTokenEnumSchema
}).strict();

export const RequestStartTransactionRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evseId": z.number().int().optional(),
  "groupIdToken": IdTokenSchema.optional(),
  "idToken": IdTokenSchema,
  "remoteStartId": z.number().int(),
  "chargingProfile": ChargingProfileSchema.optional()
}).strict();
export type RequestStartTransactionRequest = z.infer<typeof RequestStartTransactionRequestSchema>;
