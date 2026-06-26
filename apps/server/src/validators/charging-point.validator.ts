import { z } from "zod";

export const chargingPointIdParamSchema = z.object({
  id: z.string().uuid()
});

export const connectorParamSchema = chargingPointIdParamSchema.extend({
  connectorId: z.coerce.number().int().positive()
});

export const transactionParamSchema = chargingPointIdParamSchema.extend({
  transactionId: z.string().min(1)
});

export const chargingPointEventQuerySchema = z.object({
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export const createChargingPointSchema = z.object({
  name: z.string().min(1).max(80),
  csmsBaseUrl: z.string().url().refine((value) => value.startsWith("ws://") || value.startsWith("wss://"), {
    message: "CSMS base URL 必须以 ws:// 或 wss:// 开头"
  }),
  identity: z.string().min(1).max(120),
  vendor: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  connectorCount: z.number().int().min(1).max(16),
  connectorMaxPowerW: z.number().int().min(1)
});

export const updateChargingPointSchema = createChargingPointSchema.partial();

export const authorizeSchema = z.object({
  connectorId: z.number().int().positive(),
  idTag: z.string().min(1).max(40)
});

export const startTransactionSchema = authorizeSchema.extend({
  meterStartWh: z.number().int().min(0).optional()
});

export const meterValueSchema = z.object({
  meterWh: z.number().int().min(0),
  sampledAt: z.string().datetime().optional()
});

export const stopTransactionSchema = z.object({
  reason: z.enum(["local", "remote", "unlock-command", "ev-disconnected", "deauthorized", "emergency-stop", "other"]),
  meterStopWh: z.number().int().min(0).optional()
});

export type CreateChargingPointInput = z.infer<typeof createChargingPointSchema>;
export type UpdateChargingPointInput = z.infer<typeof updateChargingPointSchema>;
