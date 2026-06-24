import { z } from "zod";

export const stationIdParamSchema = z.object({
  id: z.string().uuid()
});

export const connectorParamSchema = stationIdParamSchema.extend({
  connectorId: z.coerce.number().int().positive()
});

export const transactionParamSchema = stationIdParamSchema.extend({
  transactionId: z.string().min(1)
});

export const stationEventQuerySchema = z.object({
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export const createStationSchema = z.object({
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

export const updateStationSchema = createStationSchema.partial();

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

export type CreateStationInput = z.infer<typeof createStationSchema>;
export type UpdateStationInput = z.infer<typeof updateStationSchema>;
