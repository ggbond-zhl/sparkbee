import { describe, expect, test } from "vitest";

import type { IValidator } from "../../../src/protocol/types.ts";
import {
  buildValidationMessage,
  runValidation,
} from "../../../src/protocol/session/internal/validation.ts";

describe("session validation helpers", () => {
  test("returns valid when validator accepts the payload", () => {
    const validator: IValidator = {
      validate() {
        return { success: true };
      },
    };

    expect(runValidation(validator, "Heartbeat", {}, "request")).toEqual({
      kind: "valid",
    });
  });

  test("returns invalid issues when validator rejects the payload", () => {
    const validator: IValidator = {
      validate() {
        return {
          success: false,
          issues: [
            {
              path: ["payload"],
              message: "payload invalid",
              code: "invalid_type",
            },
          ],
        };
      },
    };

    expect(runValidation(validator, "Heartbeat", {}, "response")).toEqual({
      kind: "invalid",
      issues: [
        {
          path: ["payload"],
          message: "payload invalid",
          code: "invalid_type",
        },
      ],
    });
  });

  test("returns internal errors when validator throws", () => {
    const validator: IValidator = {
      validate() {
        throw new Error("validator exploded");
      },
    };
    const result = runValidation(validator, "Heartbeat", {}, "request");

    expect(result.kind).toBe("internal_error");
    if (result.kind !== "internal_error") {
      throw new Error("Expected internal_error result");
    }

    expect(result.cause).toBeInstanceOf(Error);
  });

  test("prefers the first validation issue message", () => {
    expect(
      buildValidationMessage("fallback", [
        {
          path: ["payload"],
          message: "first issue",
          code: "invalid_type",
        },
        {
          path: ["payload"],
          message: "second issue",
          code: "too_small",
        },
      ]),
    ).toBe("first issue");
  });
});
