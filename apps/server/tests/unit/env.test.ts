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

  test("loads the charging point runtime log directory with a development default", async () => {
    vi.resetModules();
    const { loadServerConfig } = await import("../../src/config/env");

    expect(loadServerConfig({}).runtimeLogDirectory).toBe("logs/runtime");
    expect(loadServerConfig({
      CHARGING_POINT_RUNTIME_LOG_DIRECTORY: "tmp/runtime-logs",
    }).runtimeLogDirectory).toBe("tmp/runtime-logs");
  });
});
