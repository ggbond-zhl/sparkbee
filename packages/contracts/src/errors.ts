import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "CHARGING_POINT_NOT_FOUND",
  "CHARGING_POINT_NOT_RUNNABLE",
  "CHARGING_POINT_PROTOCOL_UNSUPPORTED",
  "CHARGING_POINT_START_FAILED",
  "CHARGING_POINT_STOP_FAILED",
  "CHARGING_POINT_NOT_RUNNING",
  "CONNECTOR_NOT_FOUND",
  "CONNECTOR_CONFLICT",
  "CONNECTOR_OPERATION_CONFLICT",
  "CONNECTOR_OPERATION_FAILED",
  "INTERNAL_SERVER_ERROR",
]);

export const validationIssueSchema = z.object({
  path: z
    .array(z.union([z.string(), z.number()]))
    .describe("校验失败字段在请求数据中的路径。"),
  message: z.string().describe("字段级校验失败原因。"),
});

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema.describe("稳定的机器可读错误码。"),
    message: z.string().describe("面向开发者的英文错误说明。"),
    details: z.array(validationIssueSchema).optional().describe("字段级校验错误列表。"),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
