import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "CHARGING_POINT_NOT_FOUND",
  "CONNECTOR_NOT_FOUND",
  "CONNECTOR_CONFLICT",
  "INTERNAL_SERVER_ERROR",
]);

export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.array(validationIssueSchema).optional(),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
