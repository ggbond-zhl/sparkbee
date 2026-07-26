import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { listChargingPointsQuerySchema } from "@spark-bee/contracts";
import { describe, expect, test } from "vitest";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = join(serverRoot, "../..");
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
  test("uses English for server runtime log messages", () => {
    const nonEnglishMessages = sourceFiles().flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      const messages = source.matchAll(
        /(?:\b|this\.)logger\.(?:trace|debug|info|warn|error|fatal)\([\s\S]*?,\s*"([^"]+)"\s*\)/g,
      );

      return [...messages]
        .flatMap((match) => match[1] === undefined ? [] : [match[1]])
        .filter((message) => /[\u3400-\u9fff]/.test(message))
        .map((message) => `${relative(serverRoot, filePath)} -> ${message}`);
    });

    expect(nonEnglishMessages).toEqual([]);
  });

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
      "actorLogWriter.ts",
      "bestEffortBatchWriter.ts",
      "chargingPointActor.ts",
      "chargingPointActorHost.ts",
      "chargingPointEventStreamHub.ts",
      "chargingPointRuntimeProjection.ts",
    ]);
  });

  test("keeps the charging point event stream separate from the runtime snapshot projection", () => {
    const eventStreamHubSource = readFileSync(
      join(srcRoot, "lib", "chargingPointEventStreamHub.ts"),
      "utf8",
    );
    const projectionPath = join(
      srcRoot,
      "lib",
      "chargingPointRuntimeProjection.ts",
    );
    const projectionSource = existsSync(projectionPath)
      ? readFileSync(projectionPath, "utf8")
      : "";

    expect(existsSync(projectionPath)).toBe(true);
    expect(eventStreamHubSource).not.toContain("RuntimeProjection");
    expect(eventStreamHubSource).not.toContain("getRuntimeSnapshot");
    expect(eventStreamHubSource).toContain("chargingPointEventStreamMessageSchema");
    expect(eventStreamHubSource).not.toContain("data: unknown");
    expect(projectionSource).toContain("ChargingPointRuntimeProjection");
    expect(projectionSource).toContain("getRuntimeSnapshot");
  });

  test("keeps charging point actor package behind server actor library code", () => {
    const forbidden = [
      "@spark-bee/charging-point-actor",
      "ProtocolEvent",
      "AuthService",
    ];

    const allowedActorPackageFiles = new Set([
      join(srcRoot, "lib/chargingPointActor.ts"),
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

  test("keeps business modules behind route and deep optional module seams", () => {
    const modules = moduleDirectories();
    const routeOptionalDeepModules = new Set([
      "authorization",
      "chargingTransaction",
    ]);

    const missingRouteFiles = modules.flatMap((modulePath) => {
      const moduleName = modulePath.split(/[\\/]/).at(-1);
      if (moduleName === undefined) {
        return [];
      }
      if (routeOptionalDeepModules.has(moduleName)) {
        return [];
      }

      return [join(modulePath, `${moduleName}.route.ts`)]
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

    const crossModuleRouteRepoImports = modules.flatMap((modulePath) => {
      const moduleName = modulePath.split(/[\\/]/).at(-1);
      if (moduleName === undefined) {
        return [];
      }

      return walk(modulePath)
        .filter((filePath) => filePath.endsWith(".route.ts"))
        .filter((filePath) => {
          const source = readFileSync(filePath, "utf8");
          return source.includes(".repo") &&
            !source.includes(`./${moduleName}.repo`);
        })
        .map((filePath) => relative(serverRoot, filePath));
    });

    const allowedCrossModuleServiceRepoImports = new Set([
      "../authorization/authorization.repo",
      "../chargingTransaction/chargingTransaction.repo",
      "../transactionDelivery/transactionDelivery.repo",
    ]);
    const crossModuleServiceRepoImports = modules.flatMap((modulePath) =>
      walk(modulePath)
        .filter((filePath) => filePath.endsWith(".service.ts"))
        .flatMap((filePath) => {
          const source = readFileSync(filePath, "utf8");
          const imports = [...source.matchAll(/from "(\.\.\/.+\.repo)"/g)]
            .flatMap((match) => match[1] === undefined ? [] : [match[1]]);
          return imports
            .filter((specifier) =>
              !allowedCrossModuleServiceRepoImports.has(specifier))
            .map((specifier) =>
              `${relative(serverRoot, filePath)} -> ${specifier}`);
        }),
    );

    expect(missingRouteFiles).toEqual([]);
    expect(misnamedRepoFiles).toEqual([]);
    expect(crossModuleRouteRepoImports).toEqual([]);
    expect(crossModuleServiceRepoImports).toEqual([]);
    expect(existsSync(join(srcRoot, "modules/chargingPoint/chargingPoint.service.ts")))
      .toBe(false);
    expect(existsSync(join(srcRoot, "modules/connector/connector.service.ts")))
      .toBe(false);
    expect(existsSync(join(srcRoot, "modules/runtimeOperation/runtimeOperation.service.ts")))
      .toBe(true);
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
      "runtimeOperation.lifecycle.ts",
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
    const lifecycleSource = readFileSync(
      join(operationModule, "runtimeOperation.lifecycle.ts"),
      "utf8",
    );
    expect(existsSync(join(operationModule, "runtimeOperation.command.ts"))).toBe(
      false,
    );
    expect(serviceSource).not.toContain("RuntimeOperationCommandExecutor");
    expect(serviceSource).toContain("ChargingPointActorHost");
    expect(serviceSource).toContain("RuntimeOperationLifecycle");
    expect(serviceSource).not.toContain("toActorOptions");
    expect(lifecycleSource).toContain("async start(");
    expect(lifecycleSource).toContain("async stop(");
    expect(lifecycleSource).toContain("recoverActiveTransactions");
    expect(serviceSource).not.toContain("ChargingPointActorRegistry");
    expect(serviceSource).not.toContain("ChargingPointEventStreamHub");
    expect(serviceSource).not.toContain("ChargingPointRuntimeProjection");
    expect(serviceSource).toContain("toAuthorizeResponse");
    expect(serviceSource).toContain("toStartTransactionResponse");
    expect(serviceSource).toContain("toStopTransactionResponse");
  });

  test("keeps Drizzle migrations under apps/server", () => {
    const rootMigrationsDir = join(dirname(serverRoot), "..", "drizzle/migrations");

    expect(existsSync(join(srcRoot, "db/schema.ts"))).toBe(false);
    expect(existsSync(rootMigrationsDir)).toBe(false);
  });

  test("starts the development server without running database migrations", () => {
    const packageJson = JSON.parse(
      readFileSync(join(serverRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.dev).toBe("tsx watch src/index.ts");
    const indexSource = readFileSync(join(srcRoot, "index.ts"), "utf8");
    expect(indexSource).toContain(
      "void runtimeOperationService.recoverActiveTransactions()",
    );
  });

  test("starts the server and web app in parallel during development", () => {
    const packageJson = JSON.parse(
      readFileSync(join(repositoryRoot, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.dev).toBe(
      "pnpm --parallel --filter @spark-bee/server --filter @spark-bee/web dev",
    );
    expect(packageJson.devDependencies).not.toHaveProperty("start-server-and-test");
  });

  test("uses a valid charging point list query in the test deployment smoke check", () => {
    const workflowSource = readFileSync(
      join(repositoryRoot, ".github/workflows/deploy-test.yml"),
      "utf8",
    );
    const queryString = workflowSource.match(
      /\/api\/charging-points\?([^"\s]+)/,
    )?.[1];

    expect(queryString).toBeDefined();
    expect(
      listChargingPointsQuerySchema.safeParse(
        Object.fromEntries(new URLSearchParams(queryString)),
      ).success,
    ).toBe(true);
  });

  test("waits for slow Render deploys and only rolls back a completed deploy", () => {
    const workflowSource = readFileSync(
      join(repositoryRoot, ".github/workflows/deploy-test.yml"),
      "utf8",
    );
    const deployAttempts = Number(
      workflowSource.match(/for attempt in \{1\.\.(\d+)\}; do/)?.[1],
    );

    expect(deployAttempts).toBeGreaterThanOrEqual(180);
    expect(workflowSource).toContain('echo "Render 部署状态：${status}"');
    expect(workflowSource).toContain(
      "created|queued|build_in_progress|update_in_progress|pre_deploy_in_progress",
    );
    expect(workflowSource).toContain(
      "steps.deploy_render.outcome == 'success'",
    );
    expect(workflowSource).not.toContain(
      "steps.deploy_render.outcome != 'skipped'",
    );
  });
});
