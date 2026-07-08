import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ignoredDirs = new Set([".git", "node_modules", ".understand-anything"]);
const scannedRoots = ["apps", "packages", "package.json", "pnpm-lock.yaml"];

function walk(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  if (statSync(path).isFile()) {
    return [path];
  }

  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirs.has(entry.name) ? [] : walk(fullPath);
    }

    return [fullPath];
  });
}

function filesToScan(): string[] {
  return scannedRoots.flatMap((root) => {
    const fullPath = join(repoRoot, root);
    return existsSync(fullPath) ? walk(fullPath) : [];
  }).filter((filePath) => {
    const extension = extname(filePath);
    return extension === ".ts" ||
      extension === ".tsx" ||
      extension === ".json" ||
      extension === ".lock" ||
      filePath.endsWith("bun.lock");
  });
}

function readSource(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function listMatches(tokens: string[], files = filesToScan()): string[] {
  return files.flatMap((filePath) => {
    const source = readFileSync(filePath, "utf8");
    return tokens
      .filter((token) => source.includes(token))
      .map((token) => `${relative(repoRoot, filePath)} -> ${token}`);
  });
}

const actorPackageRoot = "packages/charging-point-actor";

describe("charging point actor package seam", () => {
  test("package exposes only the charging point actor seam", () => {
    const packageJson = JSON.parse(
      readSource(`${actorPackageRoot}/package.json`),
    ) as {
      name: string;
      exports: Record<string, { import?: string; types?: string }>;
    };
    const rootIndexSource = readSource(`${actorPackageRoot}/src/index.ts`);
    const actorIndexSource = readSource(
      `${actorPackageRoot}/src/chargingPointActor/index.ts`,
    );

    expect(existsSync(join(repoRoot, "packages/simulator"))).toBe(false);
    expect(packageJson.name).toBe("@spark-bee/charging-point-actor");
    expect(Object.keys(packageJson.exports).sort()).toEqual([
      ".",
    ]);
    expect(packageJson.exports["."]).toEqual({
      types: "./src/index.ts",
      import: "./src/index.ts",
    });
    expect(rootIndexSource.trim()).toBe('export * from "./chargingPointActor";');
    expect(actorIndexSource).toContain("createChargingPointActor");
    expect(actorIndexSource).toContain("ChargingPointActor");
  });

  test("workspace no longer references removed simulator packages", () => {
    const removedPackageDirs = ["core", "transport"].map((name) =>
      join(repoRoot, "packages", name)
    );
    const forbiddenPackageNames = [
      "@spark-sim/core",
      "@spark-sim/transport",
      "@spark-bee/simulator-core",
    ];
    const files = filesToScan().filter((filePath) =>
      !relative(repoRoot, filePath).replaceAll("\\", "/")
        .endsWith(`${actorPackageRoot}/tests/unit/packageBoundary.test.ts`)
    );

    for (const removedPackageDir of removedPackageDirs) {
      expect(existsSync(removedPackageDir)).toBe(false);
    }
    expect(listMatches(forbiddenPackageNames, files)).toEqual([]);
  });

  test("public actor interface hides protocol internals", () => {
    const publicSources = [
      `${actorPackageRoot}/src/chargingPointActor/types.ts`,
      `${actorPackageRoot}/src/chargingPointActor/index.ts`,
      `${actorPackageRoot}/src/chargingPointActor/createChargingPointActor.ts`,
    ].map(readSource).join("\n");
    const forbiddenPublicTokens = [
      "Ocpp16TransactionStartResult",
      "Ocpp16MeterValuesResult",
      "Ocpp16StopTransactionResult",
      "ocppConnectorId",
      "protocolConnectorId",
      "protocolTransactionId",
      "session?:",
      "transport?:",
      "WebSocketTransportOptions",
      "protocolDetails",
      "ChargingPointActorProtocolDetails",
      "OCPP201",
    ];

    expect(listMatches(forbiddenPublicTokens, [
      join(repoRoot, `${actorPackageRoot}/src/chargingPointActor/types.ts`),
      join(repoRoot, `${actorPackageRoot}/src/chargingPointActor/index.ts`),
      join(repoRoot, `${actorPackageRoot}/src/chargingPointActor/createChargingPointActor.ts`),
    ])).toEqual([]);
    expect(publicSources).toContain('protocol: "OCPP16J"');
    expect(publicSources).toContain("transactionId: string");
  });

  test("internal source keeps the simplified V1 file shape", () => {
    const removedInternalFiles = [
      `${actorPackageRoot}/src/chargingPointActor/types/shared.ts`,
      `${actorPackageRoot}/src/chargingPointActor/types/events.ts`,
      `${actorPackageRoot}/src/chargingPointActor/types/operations.ts`,
      `${actorPackageRoot}/src/chargingPointActor/types/options.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/types/shared.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/types/events.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/types/operations.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/types/options.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/TransactionDeliveryInternals.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/Ocpp16RuntimeObservation.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp201/index.ts`,
      `${actorPackageRoot}/src/protocol/transport/websocket/socketEventDetails.ts`,
      `${actorPackageRoot}/src/chargingPointActor/support.ts`,
    ];

    for (const relativePath of removedInternalFiles) {
      expect(existsSync(join(repoRoot, relativePath))).toBe(false);
    }
    expect(existsSync(join(
      repoRoot,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/Ocpp16TransactionDelivery.ts`,
    ))).toBe(true);
    expect(existsSync(join(
      repoRoot,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/types.ts`,
    ))).toBe(true);
    expect(existsSync(join(
      repoRoot,
      `${actorPackageRoot}/src/chargingPointActor/types.ts`,
    ))).toBe(true);
  });

  test("ocpp16 actions use the transaction delivery module interface", () => {
    const actionFiles = [
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/actions/transactionStart.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/actions/stopTransaction.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/actions/meterValues.ts`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/actions/offlineTransactionReplay.ts`,
    ];
    const forbiddenHelperImports = [
      "recordOnlineTransactionStart",
      "recordOfflineTransactionStartDelivery",
      "endTransactionDelivery",
      "recordOfflineTransactionStopDelivery",
      "resolveTransactionDeliveryBinding",
      "recordMeterValueForOfflineDelivery",
      "listPendingOfflineTransactions",
      "markOfflineMeterValueReplayed",
      "markOfflineStopReplayed",
    ];

    for (const relativePath of actionFiles) {
      const source = readSource(relativePath);
      expect(source).toContain("getOcpp16TransactionDelivery");
      for (const helper of forbiddenHelperImports) {
        expect(source).not.toMatch(
          new RegExp(`import\\\\s*{[^}]*${helper}[^}]*}\\\\s*from\\\\s*["']\\.\\./Ocpp16TransactionDelivery["']`),
        );
      }
    }
  });

  test("old naming and binding directories stay removed", () => {
    const removedPaths = [
      `${actorPackageRoot}/src/simulator`,
      `${actorPackageRoot}/src/flow`,
      `${actorPackageRoot}/src/model/bindings`,
      `${actorPackageRoot}/src/protocol/runtime/bindings`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp16/bindings`,
      `${actorPackageRoot}/src/protocol/runtime/ocpp201/bindings`,
    ];
    const sourceFiles = filesToScan().filter((filePath) =>
      relative(repoRoot, filePath)
        .replaceAll("\\", "/")
        .startsWith(`${actorPackageRoot}/src/`)
    );
    const forbiddenNames = [
      "createChargingPointSimulator",
      "ChargingPointSimulator",
      "createSimulator",
      "Ocpp16ChargingFlow",
      "Ocpp16TransactionBindingState",
      "connectorBindings:",
      "transactionBindings",
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(join(repoRoot, relativePath))).toBe(false);
    }
    expect(listMatches(forbiddenNames, sourceFiles)).toEqual([]);
  });
});
