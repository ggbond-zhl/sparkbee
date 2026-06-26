import { normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { serverEnvPath } from "../../src/config/env";

describe("server config", () => {
  test("loads dotenv from the workspace root", () => {
    const workspaceEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));

    expect(normalize(serverEnvPath)).toBe(normalize(workspaceEnvPath));
  });
});
