import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ComponentCriterionEnumSchema = z.enum(["Active","Available","Enabled","Problem"]);

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

export const GetReportRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "componentVariable": z.array(ComponentVariableSchema).min(1).optional(),
  "requestId": z.number().int(),
  "componentCriteria": z.array(ComponentCriterionEnumSchema).min(1).max(4).optional()
}).strict();
export type GetReportRequest = z.infer<typeof GetReportRequestSchema>;
