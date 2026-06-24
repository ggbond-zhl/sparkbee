import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const MonitoringCriterionEnumSchema = z.enum(["ThresholdMonitoring","DeltaMonitoring","PeriodicMonitoring"]);

const EVSESchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "connectorId": z.number().int().optional()
}).strict();

const ComponentSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evse": EVSESchema.optional(),
  "name": z.string().max(50),
  "instance": z.string().max(50).optional()
}).strict();

const VariableSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "name": z.string().max(50),
  "instance": z.string().max(50).optional()
}).strict();

const ComponentVariableSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "component": ComponentSchema,
  "variable": VariableSchema.optional()
}).strict();

export const GetMonitoringReportRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "componentVariable": z.array(ComponentVariableSchema).min(1).optional(),
  "requestId": z.number().int(),
  "monitoringCriteria": z.array(MonitoringCriterionEnumSchema).min(1).max(3).optional()
}).strict();
export type GetMonitoringReportRequest = z.infer<typeof GetMonitoringReportRequestSchema>;
