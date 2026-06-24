import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ChargingStateEnumSchema = z.enum(["Charging","EVConnected","SuspendedEV","SuspendedEVSE","Idle"]);

const IdTokenEnumSchema = z.enum(["Central","eMAID","ISO14443","ISO15693","KeyCode","Local","MacAddress","NoAuthorization"]);

const LocationEnumSchema = z.enum(["Body","Cable","EV","Inlet","Outlet"]);

const MeasurandEnumSchema = z.enum(["Current.Export","Current.Import","Current.Offered","Energy.Active.Export.Register","Energy.Active.Import.Register","Energy.Reactive.Export.Register","Energy.Reactive.Import.Register","Energy.Active.Export.Interval","Energy.Active.Import.Interval","Energy.Active.Net","Energy.Reactive.Export.Interval","Energy.Reactive.Import.Interval","Energy.Reactive.Net","Energy.Apparent.Net","Energy.Apparent.Import","Energy.Apparent.Export","Frequency","Power.Active.Export","Power.Active.Import","Power.Factor","Power.Offered","Power.Reactive.Export","Power.Reactive.Import","SoC","Voltage"]);

const PhaseEnumSchema = z.enum(["L1","L2","L3","N","L1-N","L2-N","L3-N","L1-L2","L2-L3","L3-L1"]);

const ReadingContextEnumSchema = z.enum(["Interruption.Begin","Interruption.End","Other","Sample.Clock","Sample.Periodic","Transaction.Begin","Transaction.End","Trigger"]);

const ReasonEnumSchema = z.enum(["DeAuthorized","EmergencyStop","EnergyLimitReached","EVDisconnected","GroundFault","ImmediateReset","Local","LocalOutOfCredit","MasterPass","Other","OvercurrentFault","PowerLoss","PowerQuality","Reboot","Remote","SOCLimitReached","StoppedByEV","TimeLimitReached","Timeout"]);

const TransactionEventEnumSchema = z.enum(["Ended","Started","Updated"]);

const TriggerReasonEnumSchema = z.enum(["Authorized","CablePluggedIn","ChargingRateChanged","ChargingStateChanged","Deauthorized","EnergyLimitReached","EVCommunicationLost","EVConnectTimeout","MeterValueClock","MeterValuePeriodic","TimeLimitReached","Trigger","UnlockCommand","StopAuthorized","EVDeparted","EVDetected","RemoteStop","RemoteStart","AbnormalCondition","SignedDataReceived","ResetCommand"]);

const AdditionalInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "additionalIdToken": z.string().max(36),
  "type": z.string().max(50)
}).strict();

const EVSESchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "connectorId": z.number().int().optional()
}).strict();

const IdTokenSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "additionalInfo": z.array(AdditionalInfoSchema).min(1).optional(),
  "idToken": z.string().max(36),
  "type": IdTokenEnumSchema
}).strict();

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

const TransactionSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "transactionId": z.string().max(36),
  "chargingState": ChargingStateEnumSchema.optional(),
  "timeSpentCharging": z.number().int().optional(),
  "stoppedReason": ReasonEnumSchema.optional(),
  "remoteStartId": z.number().int().optional()
}).strict();

export const TransactionEventRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "eventType": TransactionEventEnumSchema,
  "meterValue": z.array(MeterValueSchema).min(1).optional(),
  "timestamp": z.string().datetime({ offset: true }),
  "triggerReason": TriggerReasonEnumSchema,
  "seqNo": z.number().int(),
  "offline": z.boolean().optional(),
  "numberOfPhasesUsed": z.number().int().optional(),
  "cableMaxCurrent": z.number().int().optional(),
  "reservationId": z.number().int().optional(),
  "transactionInfo": TransactionSchema,
  "evse": EVSESchema.optional(),
  "idToken": IdTokenSchema.optional()
}).strict();
export type TransactionEventRequest = z.infer<typeof TransactionEventRequestSchema>;
