import { ModelError } from "../errors";

export function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ModelError("MODEL_INVALID_ARGUMENT", `${fieldName} 必须是正整数`);
  }
}

export function assertFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new ModelError("MODEL_INVALID_ARGUMENT", `${fieldName} 必须是有限数值`);
  }
}

export function assertNonNegativeFiniteNumber(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ModelError("MODEL_INVALID_ARGUMENT", `${fieldName} 必须是非负数`);
  }
}

export function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ModelError("MODEL_INVALID_ARGUMENT", `${fieldName} 必须是有效日期`);
  }
}
