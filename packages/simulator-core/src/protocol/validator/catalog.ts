import { ZodError, z, type ZodTypeAny } from "zod";

import type { ValidationIssue } from "../types";

export type MessageSchema = ZodTypeAny;

export type SchemaCatalogEntry<
  TRequestSchema extends MessageSchema = MessageSchema,
  TResponseSchema extends MessageSchema = MessageSchema,
> = Readonly<{
  request: TRequestSchema;
  response: TResponseSchema;
}>;

export type SchemaCatalog = Readonly<Record<string, SchemaCatalogEntry>>;

export type RequestOf<
  TCatalog extends SchemaCatalog,
  TAction extends keyof TCatalog,
> = z.output<TCatalog[TAction]["request"]>;

export type ResponseOf<
  TCatalog extends SchemaCatalog,
  TAction extends keyof TCatalog,
> = z.output<TCatalog[TAction]["response"]>;

export function mapZodIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === "number" ? segment : String(segment),
    ),
    message: issue.message,
    code: issue.code,
  }));
}
