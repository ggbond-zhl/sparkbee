import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(serverRoot, "src");

function walk(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  if (statSync(path).isFile()) {
    return [path];
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]
  );
}

function sourceFiles(): string[] {
  return walk(srcRoot).filter((filePath) => extname(filePath) === ".ts");
}

describe("server architecture", () => {
  test("keeps backend source areas explicit", () => {
    const allowedTopLevelEntries = new Set([
      "app.ts",
      "config",
      "db",
      "index.ts",
      "middlewares",
      "modules",
      "routes",
      "utils",
    ]);

    const entries = readdirSync(srcRoot).map((entry) => entry);
    const unexpectedEntries = entries.filter((entry) => !allowedTopLevelEntries.has(entry));

    expect(unexpectedEntries).toEqual([]);
  });

  test("does not introduce runtime orchestration before start/stop use cases", () => {
    const futureEntries = [
      join(srcRoot, "runtime"),
    ];

    const existingEntries = futureEntries
      .filter((entry) => existsSync(entry))
      .map((entry) => relative(serverRoot, entry));

    expect(existingEntries).toEqual([]);
  });

  test("does not reference simulator runtime from management API", () => {
    const forbidden = [
      "@spark-bee/simulator",
      "charging-point",
      "ProtocolEvent",
      "AuthService",
    ];

    const matches = sourceFiles().flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return forbidden
        .filter((token) => source.includes(token))
        .map((token) => `${relative(serverRoot, filePath)} -> ${token}`);
    });

    expect(matches).toEqual([]);
  });

  test("keeps Drizzle migrations under apps/server", () => {
    const rootMigrationsDir = join(dirname(serverRoot), "..", "drizzle/migrations");

    expect(existsSync(join(srcRoot, "db/schema.ts"))).toBe(false);
    expect(existsSync(rootMigrationsDir)).toBe(false);
  });
});
