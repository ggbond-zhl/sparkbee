import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const AttributeEnumSchema = z.enum(["Actual","Target","MinSet","MaxSet"]);

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

const GetVariableDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "attributeType": AttributeEnumSchema.optional(),
  "component": ComponentSchema,
  "variable": VariableSchema
}).strict();

export const GetVariablesRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "getVariableData": z.array(GetVariableDataSchema).min(1)
}).strict();
export type GetVariablesRequest = z.infer<typeof GetVariablesRequestSchema>;
