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

function moduleDirectories(): string[] {
  const modulesRoot = join(srcRoot, "modules");
  return readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(modulesRoot, entry.name));
}

describe("server architecture", () => {
  test("keeps backend source areas explicit", () => {
    const allowedTopLevelEntries = new Set([
      "app.ts",
      "config",
      "db",
      "index.ts",
      "lib",
      "middlewares",
      "modules",
      "routes",
      "utils",
    ]);

    const entries = readdirSync(srcRoot).map((entry) => entry);
    const unexpectedEntries = entries.filter((entry) => !allowedTopLevelEntries.has(entry));

    expect(unexpectedEntries).toEqual([]);
  });

  test("keeps internal library code narrow", () => {
    const libRoot = join(srcRoot, "lib");
    const libFiles = walk(libRoot)
      .filter((filePath) => extname(filePath) === ".ts")
      .map((filePath) => relative(libRoot, filePath).replaceAll("\\", "/"))
      .sort();

    expect(libFiles).toEqual([
      "chargingPointActor.ts",
      "chargingPointActorRegistry.ts",
      "chargingPointEventStreamHub.ts",
      "chargingPointRuntimeLogFileWriter.ts",
    ]);
  });

  test("keeps charging point actor package behind server actor library code", () => {
    const forbidden = [
      "@spark-bee/charging-point-actor",
      "ProtocolEvent",
      "AuthService",
    ];

    const allowedActorPackageFiles = new Set([
      join(srcRoot, "lib/chargingPointActor.ts"),
      join(srcRoot, "lib/chargingPointActorRegistry.ts"),
    ]);
    const matches = sourceFiles()
      .filter((filePath) => !allowedActorPackageFiles.has(filePath))
      .flatMap((filePath) => {
        const source = readFileSync(filePath, "utf8");
        return forbidden
          .filter((token) => source.includes(token))
          .map((token) => `${relative(serverRoot, filePath)} -> ${token}`);
      });

    expect(matches).toEqual([]);
  });

  test("keeps business modules behind route and service boundaries", () => {
    const modules = moduleDirectories();

    const missingBoundaryFiles = modules.flatMap((modulePath) => {
      const moduleName = modulePath.split(/[\\/]/).at(-1);
      if (moduleName === undefined) {
        return [];
      }

      return [`${moduleName}.route.ts`, `${moduleName}.service.ts`]
        .map((fileName) => join(modulePath, fileName))
        .filter((filePath) => !existsSync(filePath))
        .map((filePath) => relative(serverRoot, filePath));
    });

    const misnamedRepoFiles = modules.flatMap((modulePath) => {
      const moduleName = modulePath.split(/[\\/]/).at(-1);
      if (moduleName === undefined) {
        return [];
      }

      return walk(modulePath)
        .filter((filePath) => filePath.endsWith(".repo.ts"))
        .filter((filePath) => filePath !== join(modulePath, `${moduleName}.repo.ts`))
        .map((filePath) => relative(serverRoot, filePath));
    });

    const routeRepoImports = modules.flatMap((modulePath) =>
      walk(modulePath)
        .filter((filePath) => filePath.endsWith(".route.ts"))
        .filter((filePath) => readFileSync(filePath, "utf8").includes(".repo"))
        .map((filePath) => relative(serverRoot, filePath)),
    );

    const crossModuleServiceRepoImports = modules.flatMap((modulePath) =>
      walk(modulePath)
        .filter((filePath) => filePath.endsWith(".service.ts"))
        .filter((filePath) => /\.\.\/.+\.repo/.test(readFileSync(filePath, "utf8")))
        .map((filePath) => relative(serverRoot, filePath)),
    );

    expect(missingBoundaryFiles).toEqual([]);
    expect(misnamedRepoFiles).toEqual([]);
    expect(routeRepoImports).toEqual([]);
    expect(crossModuleServiceRepoImports).toEqual([]);
  });

  test("keeps connector management in its own module", () => {
    const connectorModule = join(srcRoot, "modules/connector");
    const chargingPointRoute = join(srcRoot, "modules/chargingPoint/chargingPoint.route.ts");
    const chargingPointRepo = join(srcRoot, "modules/chargingPoint/chargingPoint.repo.ts");

    expect(existsSync(join(connectorModule, "connector.route.ts"))).toBe(true);
    expect(existsSync(join(connectorModule, "connector.repo.ts"))).toBe(true);

    const chargingPointRouteSource = readFileSync(chargingPointRoute, "utf8");
    expect(chargingPointRouteSource).not.toContain("createConnectorRequestSchema");
    expect(chargingPointRouteSource).not.toContain("connectorResponseSchema");
    expect(chargingPointRouteSource).not.toContain("/connectors");

    const chargingPointRepoSource = readFileSync(chargingPointRepo, "utf8");
    expect(chargingPointRepoSource).not.toContain("CreateConnectorRequest");
    expect(chargingPointRepoSource).not.toContain("UpdateConnectorRequest");
    expect(chargingPointRepoSource).not.toContain("CONNECTOR_CONFLICT");
  });

  test("keeps runtime operation in its own module", () => {
    const chargingPointModule = join(srcRoot, "modules/chargingPoint");
    const operationModule = join(srcRoot, "modules/runtimeOperation");
    const operationFiles = walk(operationModule)
      .filter((filePath) => extname(filePath) === ".ts")
      .map((filePath) => relative(operationModule, filePath).replaceAll("\\", "/"))
      .sort();

    expect(operationFiles).toEqual([
      "chargingPointActorOptions.ts",
      "runtimeOperation.command.ts",
      "runtimeOperation.repo.ts",
      "runtimeOperation.route.ts",
      "runtimeOperation.service.ts",
    ]);
    expect(existsSync(join(chargingPointModule, "runtimeOperation.route.ts"))).toBe(
      false,
    );
    expect(existsSync(join(chargingPointModule, "chargingPointActorOptions.ts"))).toBe(
      false,
    );

    const serviceSource = readFileSync(
      join(operationModule, "runtimeOperation.service.ts"),
      "utf8",
    );
    expect(serviceSource).toContain("RuntimeOperationCommandExecutor");
    expect(serviceSource).not.toContain("toAuthorizeResponse");
    expect(serviceSource).not.toContain("toStartTransactionResponse");
    expect(serviceSource).not.toContain("toStopTransactionResponse");
  });

  test("keeps Drizzle migrations under apps/server", () => {
    const rootMigrationsDir = join(dirname(serverRoot), "..", "drizzle/migrations");

    expect(existsSync(join(srcRoot, "db/schema.ts"))).toBe(false);
    expect(existsSync(rootMigrationsDir)).toBe(false);
  });
});
