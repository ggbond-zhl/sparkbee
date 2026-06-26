import { z } from 'zod';

export const DateTimeStringSchema = z.string().datetime({ offset: true });
export const TenthsNumberSchema = z.number().multipleOf(0.1);

/** IdTagInfo – used in Authorize / Start / Stop / SendLocalList responses */
export const IdTagInfoSchema = z.object({
  expiryDate: DateTimeStringSchema.optional(),
  parentIdTag: z.string().max(20).optional(),
  status: z.enum(['Accepted', 'Blocked', 'Expired', 'Invalid', 'ConcurrentTx']),
}).strict();
export type IdTagInfo = z.infer<typeof IdTagInfoSchema>;

/** ChargingSchedulePeriod – single time slot in a charging schedule */
export const ChargingSchedulePeriodSchema = z.object({
  startPeriod: z.number().int(),
  limit: TenthsNumberSchema,
  numberPhases: z.number().int().optional(),
}).strict();
export type ChargingSchedulePeriod = z.infer<typeof ChargingSchedulePeriodSchema>;

/** ChargingSchedule – charging plan with rate + periods */
export const ChargingScheduleSchema = z.object({
  duration: z.number().int().optional(),
  startSchedule: DateTimeStringSchema.optional(),
  chargingRateUnit: z.enum(['A', 'W']),
  chargingSchedulePeriod: z.array(ChargingSchedulePeriodSchema).min(1),
  minChargingRate: TenthsNumberSchema.optional(),
}).strict();
export type ChargingSchedule = z.infer<typeof ChargingScheduleSchema>;

/** ChargingProfile – full charging profile object */
export const ChargingProfileSchema = z.object({
  chargingProfileId: z.number().int(),
  transactionId: z.number().int().optional(),
  stackLevel: z.number().int(),
  chargingProfilePurpose: z.enum(['ChargePointMaxProfile', 'TxDefaultProfile', 'TxProfile']),
  chargingProfileKind: z.enum(['Absolute', 'Recurring', 'Relative']),
  recurrencyKind: z.enum(['Daily', 'Weekly']).optional(),
  validFrom: DateTimeStringSchema.optional(),
  validTo: DateTimeStringSchema.optional(),
  chargingSchedule: ChargingScheduleSchema,
}).strict();
export type ChargingProfile = z.infer<typeof ChargingProfileSchema>;

/** SampledValue – one sampled reading within a MeterValue */
export const SampledValueSchema = z.object({
  value: z.string(),
  context: z.enum([
    'Interruption.Begin', 'Interruption.End', 'Sample.Clock', 'Sample.Periodic',
    'Transaction.Begin', 'Transaction.End', 'Trigger', 'Other',
  ]).optional(),
  format: z.enum(['Raw', 'SignedData']).optional(),
  measurand: z.enum([
    'Energy.Active.Export.Register', 'Energy.Active.Import.Register',
    'Energy.Reactive.Export.Register', 'Energy.Reactive.Import.Register',
    'Energy.Active.Export.Interval', 'Energy.Active.Import.Interval',
    'Energy.Reactive.Export.Interval', 'Energy.Reactive.Import.Interval',
    'Power.Active.Export', 'Power.Active.Import', 'Power.Offered',
    'Power.Reactive.Export', 'Power.Reactive.Import', 'Power.Factor',
    'Current.Import', 'Current.Export', 'Current.Offered',
    'Voltage', 'Frequency', 'Temperature', 'SoC', 'RPM',
  ]).optional(),
  phase: z.enum(['L1', 'L2', 'L3', 'N', 'L1-N', 'L2-N', 'L3-N', 'L1-L2', 'L2-L3', 'L3-L1']).optional(),
  location: z.enum(['Cable', 'EV', 'Inlet', 'Outlet', 'Body']).optional(),
  unit: z.enum([
    'Wh', 'kWh', 'varh', 'kvarh', 'W', 'kW', 'VA', 'kVA',
    'var', 'kvar', 'A', 'V', 'K', 'Celcius', 'Celsius', 'Fahrenheit', 'Percent',
  ]).optional(),
}).strict();
export type SampledValue = z.infer<typeof SampledValueSchema>;

/** MeterValue – timestamp + array of sampled values */
export const MeterValueSchema = z.object({
  timestamp: DateTimeStringSchema,
  sampledValue: z.array(SampledValueSchema).min(1),
}).strict();
export type MeterValue = z.infer<typeof MeterValueSchema>;
