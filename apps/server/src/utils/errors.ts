export class AppError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = "资源不存在"): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "未登录或登录已失效"): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}
