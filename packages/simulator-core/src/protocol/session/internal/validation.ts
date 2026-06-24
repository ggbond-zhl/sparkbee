import type {
  IValidator,
  ValidationDirection,
  ValidationIssue,
} from "../../types";

export type ValidationAttempt =
  | { kind: "valid" }
  | { kind: "invalid"; issues: ValidationIssue[] }
  | { kind: "internal_error"; cause: unknown };

export function runValidation(
  validator: IValidator,
  action: string,
  payload: unknown,
  direction: ValidationDirection,
): ValidationAttempt {
  try {
    const result = validator.validate(action, payload, direction);
    if (result.success) {
      return { kind: "valid" };
    }

    return { kind: "invalid", issues: result.issues };
  } catch (cause) {
    return { kind: "internal_error", cause };
  }
}

/** 优先返回首个 schema issue，避免错误消息被整组校验结果淹没。 */
export function buildValidationMessage(
  fallbackMessage: string,
  issues: ValidationIssue[],
): string {
  return issues[0]?.message ?? fallbackMessage;
}
