import { z } from "zod";

import { paginatedResponseSchema, paginationQuerySchema } from "../pagination";

export const chargingPointProtocolSchema = z.enum(["OCPP16J"]);
export const connectorFormatSchema = z.enum(["socket", "cable", "unknown"]);
export const connectorPowerTypeSchema = z.enum(["ac", "dc", "unknown"]);

const trimmedRequiredString = z.string().trim().min(1);
const optionalTrimmedString = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().min(1).nullable(),
);
const nonNegativeIntegerSchema = z.number().int().nonnegative().nullable();

export const createChargingPointRequestSchema = z.object({
  identity: trimmedRequiredString.regex(/^[A-Za-z0-9_.-]+$/),
  protocol: chargingPointProtocolSchema,
  centralSystemUrl: trimmedRequiredString,
  vendor: trimmedRequiredString,
  model: trimmedRequiredString,
  firmwareVersion: optionalTrimmedString.optional(),
  serialNumber: optionalTrimmedString.optional(),
});

export const updateChargingPointRequestSchema = createChargingPointRequestSchema.partial();

export const createConnectorRequestSchema = z.object({
  evseId: z.number().int().positive(),
  connectorId: z.number().int().positive(),
  type: trimmedRequiredString,
  format: connectorFormatSchema,
  powerType: connectorPowerTypeSchema,
  maxVoltage: nonNegativeIntegerSchema.optional(),
  maxCurrent: nonNegativeIntegerSchema.optional(),
  maxPower: nonNegativeIntegerSchema.optional(),
});

export const updateConnectorRequestSchema = createConnectorRequestSchema.partial();

export const connectorResponseSchema = z.object({
  id: z.string().uuid(),
  chargingPointId: z.string().uuid(),
  evseId: z.number().int().positive(),
  connectorId: z.number().int().positive(),
  type: z.string(),
  format: connectorFormatSchema,
  powerType: connectorPowerTypeSchema,
  maxVoltage: z.number().int().nonnegative().nullable(),
  maxCurrent: z.number().int().nonnegative().nullable(),
  maxPower: z.number().int().nonnegative().nullable(),
  sortOrder: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const chargingPointSummaryResponseSchema = z.object({
  id: z.string().uuid(),
  identity: z.string(),
  protocol: chargingPointProtocolSchema,
  centralSystemUrl: z.string(),
  vendor: z.string(),
  model: z.string(),
  firmwareVersion: z.string().nullable(),
  serialNumber: z.string().nullable(),
  connectorCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const chargingPointDetailResponseSchema = chargingPointSummaryResponseSchema
  .omit({ connectorCount: true })
  .extend({
    connectors: z.array(connectorResponseSchema),
  });

export const listChargingPointsQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().optional(),
});

export const listChargingPointsResponseSchema = paginatedResponseSchema(
  chargingPointSummaryResponseSchema,
);
