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
});
