import { normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test, vi } from "vitest";

describe("server config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("loads dotenv quietly from the workspace root", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const workspaceEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));

    vi.resetModules();
    const { serverEnvPath } = await import("../../src/config/env");

    expect(normalize(serverEnvPath)).toBe(normalize(workspaceEnvPath));
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("loads the allowed web origin with a local development default", async () => {
    vi.resetModules();
    const { loadServerConfig } = await import("../../src/config/env");

    expect(loadServerConfig({}).corsAllowedOrigin).toBe("http://localhost:3001");
    expect(loadServerConfig({
      CORS_ALLOWED_ORIGIN: "https://sparkbee-test-web.pages.dev",
    }).corsAllowedOrigin).toBe("https://sparkbee-test-web.pages.dev");
  });

  test("uses environment-specific default log levels", async () => {
    vi.resetModules();
    const { loadServerConfig } = await import("../../src/config/env");

    expect(loadServerConfig({})).toMatchObject({
      environment: "development",
      logLevel: "debug",
      sentryDsn: undefined,
    });
    expect(loadServerConfig({ NODE_ENV: "production" })).toMatchObject({
      environment: "production",
      logLevel: "info",
    });
  });

  test("rejects invalid log levels", async () => {
    vi.resetModules();
    const { loadServerConfig } = await import("../../src/config/env");

    expect(() => loadServerConfig({ LOG_LEVEL: "verbose" })).toThrow(
      /Invalid server config: LOG_LEVEL/,
    );
  });
});
