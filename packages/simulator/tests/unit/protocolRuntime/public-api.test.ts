import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Ocpp16Runtime,
  ProtocolRuntimeError,
} from "../../../src/protocol/runtime/index.ts";

const simulatorRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRuntimeSource(relativePath: string): string {
  return readFileSync(join(simulatorRoot, relativePath), "utf8");
}

describe("protocol runtime public API", () => {
  test("exposes only implemented protocol runtimes", () => {
    expect(Ocpp16Runtime).toBeDefined();
    expect(ProtocolRuntimeError).toBeDefined();

    const publicRuntimeSources = [
      "src/protocol/runtime/index.ts",
      "src/protocol/runtime/ocpp16/index.ts",
    ].map(readRuntimeSource);

    for (const source of publicRuntimeSources) {
      expect(source).not.toContain("./bindings");
    }
    expect(readRuntimeSource("src/protocol/runtime/index.ts")).not.toContain(
      "./ocpp201",
    );
    expect(existsSync(join(simulatorRoot, "src/protocol/runtime/ocpp201")))
      .toBe(false);
  });
});
