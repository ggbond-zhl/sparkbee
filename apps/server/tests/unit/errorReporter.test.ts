import { describe, expect, test, vi } from "vitest";

import { createSentryErrorReporter } from "../../src/config/errorReporter";

describe("createSentryErrorReporter", () => {
  test("does not initialize or send events without a DSN", () => {
    const sdk = {
      init: vi.fn(),
      captureException: vi.fn(),
      withScope: vi.fn(),
    };
    const reporter = createSentryErrorReporter({
      dsn: undefined,
      environment: "development",
    }, sdk);

    reporter.captureException(new Error("not sent"), { module: "test" });

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.withScope).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  test("initializes Sentry without tracing and removes sensitive event data", () => {
    const scope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
    };
    const sdk = {
      init: vi.fn(),
      captureException: vi.fn(),
      withScope: vi.fn((callback: (value: typeof scope) => void) => callback(scope)),
    };
    const reporter = createSentryErrorReporter({
      dsn: "https://public@example.com/1",
      environment: "production",
    }, sdk);

    const error = new Error("failure");
    reporter.captureException(error, {
      module: "http",
      requestId: "request-1",
      method: "POST",
      path: "/api/charging-points",
    });

    expect(sdk.init).toHaveBeenCalledOnce();
    const options = sdk.init.mock.calls[0]![0];
    expect(options).toMatchObject({
      dsn: "https://public@example.com/1",
      environment: "production",
      sendDefaultPii: false,
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
    });
    const event = options.beforeSend!({
      request: {
        data: { password: "secret" },
        headers: { authorization: "Bearer secret" },
        query_string: "token=secret",
      },
      extra: {
        databaseUrl: "postgres://user:password@example.com/db",
        nested: { token: "secret-token", count: 2 },
      },
    }, {} as never);
    expect(event?.request).toBeUndefined();
    expect(event?.extra).toEqual({
      databaseUrl: "[Redacted]",
      nested: { token: "[Redacted]", count: 2 },
    });
    expect(scope.setTag).toHaveBeenCalledWith("module", "http");
    expect(scope.setContext).toHaveBeenCalledWith("sparkbee", {
      module: "http",
      requestId: "request-1",
      method: "POST",
      path: "/api/charging-points",
    });
    expect(sdk.captureException).toHaveBeenCalledWith(error);
  });
});
