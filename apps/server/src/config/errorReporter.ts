import * as Sentry from "@sentry/node";
import type { Logger } from "pino";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "databaseurl",
  "password",
  "secret",
  "token",
]);

export interface ErrorReportContext extends Record<string, unknown> {
  requestId?: string;
  method?: string;
  path?: string;
  module: string;
  batchSize?: number;
}

export interface ErrorReporter {
  captureException(error: unknown, context: ErrorReportContext): void;
}

export const noopErrorReporter: ErrorReporter = {
  captureException() {},
};

interface SentryScope {
  setTag(key: string, value: string): void;
  setContext(name: string, context: Record<string, unknown> | null): void;
}

interface SentrySdk {
  init(options: Parameters<typeof Sentry.init>[0]): void;
  captureException(error: unknown): unknown;
  withScope(callback: (scope: SentryScope) => void): void;
}

const defaultSentrySdk: SentrySdk = {
  init: Sentry.init,
  captureException: Sentry.captureException,
  withScope(callback) {
    Sentry.withScope((scope) => callback(scope));
  },
};

export function createSentryErrorReporter(
  {
    dsn,
    environment,
    logger,
  }: {
    dsn?: string;
    environment: string;
    logger?: Logger;
  },
  sdk: SentrySdk = defaultSentrySdk,
): ErrorReporter {
  if (dsn === undefined) return noopErrorReporter;

  try {
    sdk.init({
      dsn,
      environment,
      maxBreadcrumbs: 0,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend(event) {
        event.request = undefined;
        if (event.extra !== undefined) {
          event.extra = redactSensitive(event.extra) as typeof event.extra;
        }
        if (event.contexts !== undefined) {
          event.contexts = redactSensitive(event.contexts) as typeof event.contexts;
        }
        return event;
      },
    });
  } catch (error) {
    logger?.error({
      event: "sentry.init.failed",
      error,
    }, "初始化 Sentry 失败");
    return noopErrorReporter;
  }

  return {
    captureException(error, context) {
      try {
        sdk.withScope((scope) => {
          scope.setTag("module", context.module);
          scope.setContext("sparkbee", context);
          sdk.captureException(error);
        });
      } catch (captureError) {
        logger?.error({
          event: "sentry.capture.failed",
          error: captureError,
        }, "发送 Sentry 事件失败");
      }
    },
  };
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase())
        ? "[Redacted]"
        : redactSensitive(nestedValue),
    ]),
  );
}
