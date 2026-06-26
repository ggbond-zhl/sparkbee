import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingRateUnitEnumSchema = z.enum(["W","A"]);

const GenericStatusEnumSchema = z.enum(["Accepted","Rejected"]);

const ChargingSchedulePeriodSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "startPeriod": z.number().int(),
  "limit": z.number(),
  "numberPhases": z.number().int().optional(),
  "phaseToUse": z.number().int().optional()
}).strict();

const CompositeScheduleSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "chargingSchedulePeriod": z.array(ChargingSchedulePeriodSchema).min(1),
  "evseId": z.number().int(),
  "duration": z.number().int(),
  "scheduleStart": z.string().datetime({ offset: true }),
  "chargingRateUnit": ChargingRateUnitEnumSchema
}).strict();

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const GetCompositeScheduleResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": GenericStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional(),
  "schedule": CompositeScheduleSchema.optional()
}).strict();
export type GetCompositeScheduleResponse = z.infer<typeof GetCompositeScheduleResponseSchema>;
