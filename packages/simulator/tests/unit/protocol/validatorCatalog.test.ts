import { describe, expect, test } from "vitest";
import { z } from "zod";

import { ProtocolError } from "../../../src/protocol/types.ts";
import type {
  RequestOf,
  ResponseOf,
} from "../../../src/protocol/validator/catalog.ts";
import { ocpp201SchemaCatalog } from "../../../src/protocol/validator/Ocpp201/Ocpp201SchemaCatalog.ts";
import { BootNotificationRequestSchema } from "../../../src/protocol/validator/Ocpp201/schemas/BootNotificationRequest.ts";
import { BootNotificationResponseSchema } from "../../../src/protocol/validator/Ocpp201/schemas/BootNotificationResponse.ts";
import { defineSchemaCatalog } from "../../../src/protocol/validator/internal/catalogBuilder.ts";
import {
  createUnknownActionIssue,
  createValidateError,
} from "../../../src/protocol/validator/internal/validatorErrors.ts";

describe("validator catalog helpers", () => {
  test("builds a schema catalog from action pairs", () => {
    const requestSchema = z.object({ foo: z.string() });
    const responseSchema = z.object({ ok: z.boolean() });
    const catalog = defineSchemaCatalog([
      ["DemoAction", requestSchema, responseSchema],
    ] as const);

    expect(catalog.DemoAction).toEqual({
      request: requestSchema,
      response: responseSchema,
    });
  });

  test("RequestOf and ResponseOf infer from shared catalog types", () => {
    const catalog = defineSchemaCatalog([
      [
        "DemoAction",
        z.object({ foo: z.string() }),
        z.object({ ok: z.boolean() }),
      ],
    ] as const);

    const request: RequestOf<typeof catalog, "DemoAction"> = { foo: "bar" };
    const response: ResponseOf<typeof catalog, "DemoAction"> = { ok: true };

    expect(request.foo).toBe("bar");
    expect(response.ok).toBe(true);
  });

  test("formats versioned unknown-action issues and validate errors", () => {
    expect(
      createUnknownActionIssue("OCPP201", "UnknownAction", "response"),
    ).toEqual({
      path: ["action"],
      message: "[OCPP201] 未注册 UnknownAction.response schema",
      code: "UNKNOWN_ACTION",
    });

    const error = createValidateError(
      "OCPP16J",
      "Heartbeat",
      "request",
      new Error("boom"),
    );

    expect(error).toBeInstanceOf(ProtocolError);
    expect(error).toMatchObject({
      code: "VALIDATE_ERROR",
      message: "[OCPP16J] 校验 Heartbeat.request 时发生内部异常",
    });
  });

  test("exposes generated OCPP201 schemas through the hand-maintained catalog", () => {
    expect(ocpp201SchemaCatalog.BootNotification.request).toBe(
      BootNotificationRequestSchema,
    );
    expect(ocpp201SchemaCatalog.BootNotification.response).toBe(
      BootNotificationResponseSchema,
    );
  });
});
