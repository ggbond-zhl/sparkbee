import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const LocationEnumSchema = z.enum(["Body","Cable","EV","Inlet","Outlet"]);

const MeasurandEnumSchema = z.enum(["Current.Export","Current.Import","Current.Offered","Energy.Active.Export.Register","Energy.Active.Import.Register","Energy.Reactive.Export.Register","Energy.Reactive.Import.Register","Energy.Active.Export.Interval","Energy.Active.Import.Interval","Energy.Active.Net","Energy.Reactive.Export.Interval","Energy.Reactive.Import.Interval","Energy.Reactive.Net","Energy.Apparent.Net","Energy.Apparent.Import","Energy.Apparent.Export","Frequency","Power.Active.Export","Power.Active.Import","Power.Factor","Power.Offered","Power.Reactive.Export","Power.Reactive.Import","SoC","Voltage"]);

const PhaseEnumSchema = z.enum(["L1","L2","L3","N","L1-N","L2-N","L3-N","L1-L2","L2-L3","L3-L1"]);

const ReadingContextEnumSchema = z.enum(["Interruption.Begin","Interruption.End","Other","Sample.Clock","Sample.Periodic","Transaction.Begin","Transaction.End","Trigger"]);

const SignedMeterValueSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "signedMeterData": z.string().max(2500),
  "signingMethod": z.string().max(50),
  "encodingMethod": z.string().max(50),
  "publicKey": z.string().max(2500)
}).strict();

const UnitOfMeasureSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "unit": z.string().max(20).optional(),
  "multiplier": z.number().int().optional()
}).strict();

const SampledValueSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "value": z.number(),
  "context": ReadingContextEnumSchema.optional(),
  "measurand": MeasurandEnumSchema.optional(),
  "phase": PhaseEnumSchema.optional(),
  "location": LocationEnumSchema.optional(),
  "signedMeterValue": SignedMeterValueSchema.optional(),
  "unitOfMeasure": UnitOfMeasureSchema.optional()
}).strict();

const MeterValueSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "sampledValue": z.array(SampledValueSchema).min(1),
  "timestamp": z.string().datetime({ offset: true })
}).strict();

export const MeterValuesRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evseId": z.number().int(),
  "meterValue": z.array(MeterValueSchema).min(1)
}).strict();
export type MeterValuesRequest = z.infer<typeof MeterValuesRequestSchema>;
