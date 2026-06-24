import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ignoredDirs = new Set([".git", "node_modules", ".understand-anything"]);
const scannedRoots = ["apps", "packages", "package.json", "pnpm-lock.yaml"];
const forbidden = ["core", "transport"].map((name) => `@spark-sim/${name}`);
const removedPackageDirs = ["core", "transport"].map((name) =>
  join(repoRoot, "packages", name)
);

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
    if (!existsSync(fullPath)) {
      return [];
    }

    return walk(fullPath);
  }).filter((filePath) => {
    const extension = extname(filePath);
    return extension === ".ts" ||
      extension === ".tsx" ||
      extension === ".json" ||
      extension === ".lock" ||
      filePath.endsWith("bun.lock");
  });
}

describe("simulator package boundary", () => {
  test("old core and transport packages are removed", () => {
    for (const removedPackageDir of removedPackageDirs) {
      expect(existsSync(removedPackageDir)).toBe(false);
    }
  });

  test("workspace source no longer references old package names", () => {
    const matches = filesToScan().flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return forbidden
        .filter((token) => source.includes(token))
        .map((token) => `${relative(repoRoot, filePath)} -> ${token}`);
    });

    expect(matches).toEqual([]);
  });

  test("OCPP 1.6 runtime uses concise runtime naming", () => {
    const oldRuntimeFile = join(
      repoRoot,
      "packages/simulator-core/src/protocol/runtime/ocpp16/Ocpp16ProtocolRuntime.ts",
    );
    const runtimeFile = join(
      repoRoot,
      "packages/simulator-core/src/protocol/runtime/ocpp16/Ocpp16Runtime.ts",
    );
    const sourceFiles = filesToScan().filter((filePath) =>
      relative(repoRoot, filePath)
        .replaceAll("\\", "/")
        .startsWith("packages/simulator-core/src/")
    );
    const forbiddenNames: Array<[string, RegExp]> = [
      ["Ocpp16ProtocolRuntime", /\bOcpp16ProtocolRuntime\b/],
      ["Ocpp16ProtocolRuntimeOptions", /\bOcpp16ProtocolRuntimeOptions\b/],
      ["Ocpp16ProtocolRuntimeContext", /\bOcpp16ProtocolRuntimeContext\b/],
      ["createOcpp16ProtocolRuntimeContext", /\bcreateOcpp16ProtocolRuntimeContext\b/],
    ];
    const matches = sourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return forbiddenNames
        .filter(([, pattern]) => pattern.test(source))
        .map(([name]) => name)
        .map((name) => `${relative(repoRoot, filePath)} -> ${name}`);
    });

    expect(existsSync(oldRuntimeFile)).toBe(false);
    expect(existsSync(runtimeFile)).toBe(true);
    expect(matches).toEqual([]);
  });

  test("OCPP 1.6 runtime keeps normal constructor path", () => {
    const source = readFileSync(
      join(repoRoot, "packages/simulator-core/src/protocol/runtime/ocpp16/Ocpp16Runtime.ts"),
      "utf8",
    );

    expect(source).not.toContain("Object.create(Ocpp16Runtime.prototype)");
  });

  test("OCPP 1.6 runtime reaches transaction delivery through a concrete module", () => {
    const source = readFileSync(
      join(repoRoot, "packages/simulator-core/src/protocol/runtime/ocpp16/Ocpp16Runtime.ts"),
      "utf8",
    );

    expect(source).toContain("Ocpp16TransactionDelivery");
    expect(source).not.toContain("./actions/transactionStart");
    expect(source).not.toContain("./actions/meterValues");
    expect(source).not.toContain("./actions/stopTransaction");
  });

  test("OCPP 1.6 transaction delivery construction stays local", () => {
    const sourceFiles = filesToScan().filter((filePath) => {
      const relativePath = relative(repoRoot, filePath).replaceAll("\\", "/");
      return relativePath.startsWith("packages/simulator-core/src/protocol/runtime/ocpp16/") &&
        relativePath !== "packages/simulator-core/src/protocol/runtime/ocpp16/Ocpp16TransactionDelivery.ts";
    });
    const matches = sourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return source.includes("new Ocpp16TransactionDelivery")
        ? [relative(repoRoot, filePath)]
        : [];
    });

    expect(matches).toEqual([]);
  });

  test("protocol runtime is not exposed through the old public path", () => {
    const oldPublicPath = ["./", "flow"].join("");
    const oldRelativePath = ["../", "flow"].join("");
    const oldSourcePath = ["packages/simulator-core/src", "flow"].join("/");
    const sourceFiles = filesToScan().filter((filePath) => {
      const relativePath = relative(repoRoot, filePath).replaceAll("\\", "/");
      return relativePath === "packages/simulator-core/package.json" ||
        relativePath.startsWith("packages/simulator-core/src/");
    });

    const matches = sourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return [oldPublicPath, oldRelativePath, oldSourcePath]
        .filter((token) => source.includes(token))
        .map((token) => `${relative(repoRoot, filePath)} -> ${token}`);
    });

    expect(matches).toEqual([]);
    expect(existsSync(join(repoRoot, "packages/simulator-core/src", "flow"))).toBe(false);
  });

  test("protocol runtime API does not expose old charging flow names", () => {
    const chargingFlow = ["Ocpp16Charging", "Flow"].join("");
    const removedPersistenceName = ["Snap", "shot"].join("");
    const forbiddenNames = [
      chargingFlow,
      `${chargingFlow}Options`,
      `${chargingFlow}${removedPersistenceName}`,
      `${chargingFlow}${removedPersistenceName}Options`,
      `${chargingFlow}Json${removedPersistenceName}`,
      ["serializeOcpp16Charging", "Flow", removedPersistenceName].join(""),
      ["deserializeOcpp16Charging", "Flow", removedPersistenceName].join(""),
      ["Flow", "Error"].join(""),
      ["Flow", "ErrorCode"].join(""),
    ];
    const sourceFiles = filesToScan().filter((filePath) =>
      relative(repoRoot, filePath)
        .replaceAll("\\", "/")
        .startsWith("packages/simulator-core/src/")
    );

    const matches = sourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return forbiddenNames
        .filter((name) => source.includes(name))
        .map((name) => `${relative(repoRoot, filePath)} -> ${name}`);
    });

    expect(matches).toEqual([]);
  });

  test("generic simulator API does not expose OCPP 1.6 result types", () => {
    const source = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/types.ts"),
      "utf8",
    );

    const forbiddenTypeNames = [
      "Ocpp16TransactionStartResult",
      "Ocpp16MeterValuesResult",
      "Ocpp16StopTransactionResult",
      "Ocpp16StopTransactionInput",
    ];

    const matches = forbiddenTypeNames.filter((typeName) =>
      source.includes(typeName)
    );

    expect(matches).toEqual([]);
  });

  test("root public API keeps protocol runtime behind explicit subpath", () => {
    const rootIndexSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/index.ts"),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "packages/simulator-core/package.json"), "utf8"),
    ) as {
      exports: Record<string, { import?: string; types?: string }>;
    };

    expect(rootIndexSource).not.toContain("./protocol/runtime");
    expect(packageJson.exports["./protocolRuntime"]).toEqual({
      types: "./src/protocol/runtime/index.ts",
      import: "./src/protocol/runtime/index.ts",
    });
  });

  test("generic simulator API does not expose protocol connector identifiers", () => {
    const source = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/types.ts"),
      "utf8",
    );

    expect(source).not.toContain("ocppConnectorId");
    expect(source).not.toContain("protocolConnectorId");
    expect(source).not.toContain("SimulatorProtocolConnectorId");
    expect(source).not.toContain("SimulatorConnectorBindingRef");
  });

  test("generic simulator API uses transaction id naming instead of session id", () => {
    const source = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/types.ts"),
      "utf8",
    );

    expect(source).not.toContain("sessionId");
    expect(source).not.toContain("protocolTransactionId");
    expect(source).not.toContain("SimulatorProtocolTransactionId");
    expect(source).toContain("transactionId: string");
  });

  test("business charging state uses transaction naming instead of session naming", () => {
    const sourceFiles = filesToScan().filter((filePath) => {
      const relativePath = relative(repoRoot, filePath).replaceAll("\\", "/");
      return relativePath.startsWith("packages/simulator-core/src/model/") ||
        relativePath.startsWith("packages/simulator-core/src/protocol/runtime/");
    });
    const forbiddenNames = [
      ["active", "Session", "Id"].join(""),
      ["bind", "Session"].join(""),
      ["release", "Session"].join(""),
      ["session", "Id"].join(""),
      ["Session", "Binding", "State"].join(""),
      ["session", "Bindings"].join(""),
      ["session", "s"].join(""),
      ["require", "Session", "Binding"].join(""),
      ["bind", "Evse", "Session"].join(""),
      ["release", "Session", "On", "Connector"].join(""),
      ["remove", "Session"].join(""),
      ["get", "Session", "State"].join(""),
      ["get", "Session", "Resource"].join(""),
    ];

    const matches = sourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return forbiddenNames
        .filter((name) => source.includes(name))
        .map((name) => `${relative(repoRoot, filePath)} -> ${name}`);
    });

    expect(matches).toEqual([]);
  });

  test("generic simulator API does not expose connection state queries", () => {
    const publicApiFiles = [
      "packages/simulator-core/src/simulator/types.ts",
      "packages/simulator-core/src/simulator/index.ts",
      "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts",
    ];
    const forbiddenNames = [
      "SessionConnectionState",
      "SimulatorConnectionState",
      "connectionState",
    ];
    const matches = publicApiFiles.flatMap((relativePath) => {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");
      return forbiddenNames
        .filter((name) => source.includes(name))
        .map((name) => `${relativePath} -> ${name}`);
    });

    expect(matches).toEqual([]);
  });

  test("generic simulator API does not expose runtime state queries", () => {
    const publicApiFiles = [
      "packages/simulator-core/src/simulator/types.ts",
      "packages/simulator-core/src/simulator/index.ts",
      "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts",
    ];
    const forbiddenNames: Array<[string, RegExp]> = [
      ["SimulatorRuntimeState", /\bSimulatorRuntimeState\b/],
      ["state getter", /\bget state\(/],
      ["state property", /\breadonly state:/],
      ["isRunning", /\bisRunning\(/],
    ];
    const matches = publicApiFiles.flatMap((relativePath) => {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");
      return forbiddenNames
        .filter(([, pattern]) => pattern.test(source))
        .map(([name]) => `${relativePath} -> ${name}`);
    });

    expect(matches).toEqual([]);
  });

  test("generic simulator API does not expose a catch-all event channel", () => {
    const publicApiFiles = [
      "packages/simulator-core/src/simulator/types.ts",
      "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts",
    ];
    const matches = publicApiFiles.flatMap((relativePath) => {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");
      return [
        `on(event: "event"`,
        `off(event: "event"`,
        `emit("event"`,
      ]
        .filter((token) => source.includes(token))
        .map((token) => `${relativePath} -> ${token}`);
    });

    expect(matches).toEqual([]);
  });

  test("generic simulator factory wires protocol dependencies internally", () => {
    const source = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/createSimulator.ts"),
      "utf8",
    );
    const signature = source.slice(
      source.indexOf("export function createSimulator"),
      source.indexOf("): Simulator") + "): Simulator".length,
    );

    expect(signature).not.toContain("dependencies");
    expect(source).not.toContain("Ocpp16SimulatorDependencies");
    expect(source).toContain("./ocpp16/Ocpp16Simulator");
    expect(source).toContain("return new Ocpp16Simulator(options);");
  });

  test("OCPP 1.6 simulator test dependencies stay private", () => {
    const oldSimulatorPath = join(repoRoot, "packages/simulator-core/src/simulator/Ocpp16Simulator.ts");
    const simulatorPath = join(
      repoRoot,
      "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts",
    );
    const simulatorSource = readFileSync(
      simulatorPath,
      "utf8",
    );
    const typesSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/types.ts"),
      "utf8",
    );
    const indexSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/index.ts"),
      "utf8",
    );
    expect(existsSync(oldSimulatorPath)).toBe(false);
    expect(existsSync(simulatorPath)).toBe(true);
    const privateTypesSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/ocpp16/types.ts"),
      "utf8",
    );

    expect(privateTypesSource).toContain("type Ocpp16SimulatorDependencies");
    expect(simulatorSource).toContain("dependencies: Ocpp16SimulatorDependencies = {}");
    expect(typesSource).not.toContain("Ocpp16SimulatorDependencies");
    expect(indexSource).not.toContain("Ocpp16SimulatorDependencies");
  });

  test("OCPP 1.6 simulator keeps event envelope mapping local", () => {
    const simulatorSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts"),
      "utf8",
    );
    const envelopePath = join(
      repoRoot,
      "packages/simulator-core/src/simulator/ocpp16/Ocpp16EventEnvelope.ts",
    );

    expect(existsSync(envelopePath)).toBe(true);
    expect(simulatorSource).not.toContain("EventEnvelopePublisher");
    expect(simulatorSource).not.toContain("handleProtocolMessage");
    expect(simulatorSource).not.toContain("handleRuntimeEvent");
    expect(simulatorSource).not.toContain("publishSessionStatus");
    expect(simulatorSource).not.toContain("sessionStatus");
  });

  test("OCPP 1.6 simulator keeps startup lifecycle local", () => {
    const simulatorSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts"),
      "utf8",
    );
    const lifecyclePath = join(
      repoRoot,
      "packages/simulator-core/src/simulator/ocpp16/Ocpp16StartupLifecycle.ts",
    );

    expect(existsSync(lifecyclePath)).toBe(true);
    expect(simulatorSource).not.toContain("scheduleBootRetry");
    expect(simulatorSource).not.toContain("retryBoot");
    expect(simulatorSource).not.toContain("completeAcceptedBoot");
    expect(simulatorSource).not.toContain("stopAfterStartFailure");
    expect(simulatorSource).toContain("Ocpp16StartupLifecycle");
  });

  test("OCPP 1.6 remote command dispatch uses a registry module", () => {
    const commandIndexSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/protocol/runtime/ocpp16/commands/index.ts"),
      "utf8",
    );
    const dispatchPath = join(
      repoRoot,
      "packages/simulator-core/src/protocol/runtime/ocpp16/commands/Ocpp16CommandDispatch.ts",
    );

    expect(existsSync(dispatchPath)).toBe(true);
    expect(commandIndexSource).not.toContain("switch (request.action)");
    expect(commandIndexSource).toContain("Ocpp16CommandDispatch");
  });

  test("pre-abstracted simulator orchestration layers are removed", () => {
    const removedFiles = [
      "packages/simulator-core/src/simulator/ChargingPointSimulator.ts",
      "packages/simulator-core/src/simulator/runtimeAdapter.ts",
      "packages/simulator-core/src/simulator/ocpp16/createOcpp16SimulatorStack.ts",
      "packages/simulator-core/src/simulator/ocpp16/runtimeAdapter.ts",
    ];

    for (const relativePath of removedFiles) {
      expect(existsSync(join(repoRoot, relativePath))).toBe(false);
    }
  });

  test("OCPP 1.6 simulator implementation lives under protocol-specific simulator directory", () => {
    const ocpp16Dir = join(repoRoot, "packages/simulator-core/src/simulator/ocpp16");
    const expectedFiles = [
      "Ocpp16Simulator.ts",
      "defaults.ts",
      "resultMapping.ts",
      "types.ts",
    ].map((name) => join(ocpp16Dir, name));
    const oldRootFiles = [
      "Ocpp16Simulator.ts",
      "protocolRuntimeAdapter.ts",
    ].map((name) => join(repoRoot, "packages/simulator-core/src/simulator", name));
    const indexSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/index.ts"),
      "utf8",
    );

    expect(existsSync(ocpp16Dir)).toBe(true);
    for (const expectedFile of expectedFiles) {
      expect(existsSync(expectedFile)).toBe(true);
    }
    for (const oldRootFile of oldRootFiles) {
      expect(existsSync(oldRootFile)).toBe(false);
    }
    expect(indexSource).not.toContain("./ocpp16/Ocpp16Simulator");
    expect(indexSource).not.toContain("./ocpp16/runtimeAdapter");
    expect(indexSource).not.toContain("./Ocpp16Simulator");
    expect(indexSource).not.toContain("./protocolRuntimeAdapter");
  });

  test("simulator public index does not expose protocol-private implementation", () => {
    const indexSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/index.ts"),
      "utf8",
    );
    const privateExports = [
      "Ocpp16Simulator",
      "Ocpp16SimulatorDependencies",
      "Ocpp16SimulatorOptions",
      "createOcpp16SimulatorStack",
      "createOcpp16ProtocolRuntimeAdapter",
      "mapBootResult",
      "mapConnectorActionResult",
      "mapMeterValueResult",
      "mapStartTransactionResult",
      "mapStatusReportResult",
      "mapStopTransactionResult",
      "SimulatorAuthorizationResult",
      "SimulatorBootRegistrationStatus",
      "SimulatorBootResult",
      "SimulatorHeartbeatLoopOptions",
      "SimulatorProtocolRuntimeAdapter",
      "SimulatorRuntimeConnectorActionResult",
      "SimulatorRuntimeTransactionStartResult",
      "SimulatorStatusReportResult",
      "SimulatorTransactionResourceRef",
    ];

    for (const privateExport of privateExports) {
      expect(indexSource).not.toContain(privateExport);
    }
  });

  test("simulator options do not expose lower-layer options", () => {
    const simulatorSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts"),
      "utf8",
    );
    const typesSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/types.ts"),
      "utf8",
    );
    const indexSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/index.ts"),
      "utf8",
    );

    expect(simulatorSource).not.toContain("options.session");
    expect(simulatorSource).not.toContain("options.transport");
    expect(typesSource).not.toContain("SimulatorSessionOptions");
    expect(typesSource).not.toContain("SimulatorSessionOptions");
    expect(typesSource).not.toContain("session?:");
    expect(typesSource).not.toContain("WebSocketTransportOptions");
    expect(typesSource).not.toContain("transport?:");
    expect(typesSource).not.toContain("Ocpp16ConnectorBindingOptions");
    expect(typesSource).not.toContain("connectorBindings:");
    expect(indexSource).not.toContain("SimulatorSessionOptions");
    expect(indexSource).not.toContain("SimulatorSessionOptions");
  });

  test("simulator creation inputs use options naming", () => {
    const files = [
      "packages/simulator-core/src/simulator/types.ts",
      "packages/simulator-core/src/simulator/index.ts",
      "packages/simulator-core/src/simulator/createSimulator.ts",
      "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts",
    ];
    const sourceByPath = new Map(
      files.map((relativePath) => [
        relativePath,
        readFileSync(join(repoRoot, relativePath), "utf8"),
      ]),
    );
    const typesSource = sourceByPath.get("packages/simulator-core/src/simulator/types.ts") ?? "";
    const createSimulatorSource =
      sourceByPath.get("packages/simulator-core/src/simulator/createSimulator.ts") ?? "";
    const wrapperSource =
      sourceByPath.get("packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts") ?? "";
    const oldTypeNames = [
      ["Simulator", "Config"].join(""),
      ["Ocpp16", "Simulator", "Config"].join(""),
      ["Unsupported", "Simulator", "Config"].join(""),
    ];
    const oldParameterName = ["config"].join("");

    expect(typesSource).toContain("export type Ocpp16SimulatorOptions");
    expect(typesSource).toContain("export type UnsupportedSimulatorOptions");
    expect(typesSource).toContain("export type SimulatorOptions");
    expect(createSimulatorSource).toContain("createSimulator(options: SimulatorOptions)");
    expect(createSimulatorSource).toContain("new Ocpp16Simulator(options)");
    expect(wrapperSource).toContain("options: Ocpp16SimulatorOptions");

    for (const [relativePath, source] of sourceByPath) {
      for (const oldTypeName of oldTypeNames) {
        expect(source).not.toContain(oldTypeName);
      }
      expect(source).not.toMatch(new RegExp(`\\b${oldParameterName}:`));
      expect(source).not.toMatch(new RegExp(`\\b${oldParameterName}\\.`));
    }
  });

  test("protocol runtime binding state directories are removed", () => {
    const removedBindingsDirs = [
      "packages/simulator-core/src/model/bindings",
      "packages/simulator-core/src/protocol/runtime/bindings",
      "packages/simulator-core/src/protocol/runtime/ocpp16/bindings",
      "packages/simulator-core/src/protocol/runtime/ocpp201/bindings",
    ].map((relativePath) => join(repoRoot, relativePath));
    const modelIndex = join(repoRoot, "packages/simulator-core/src/model/index.ts");
    const sourceFiles = filesToScan().filter((filePath) =>
      relative(repoRoot, filePath)
        .replaceAll("\\", "/")
        .startsWith("packages/simulator-core/src/")
    );
    const forbiddenNames = [
      "Ocpp16ChargingPointBindingState",
      "Ocpp16ConnectorBindingState",
      "Ocpp16ConnectorBindingOptions",
      "Ocpp16TransactionBindingState",
      "Ocpp201ConnectorBindingState",
      "Ocpp201ConnectorBindingOptions",
      "Ocpp201TransactionBindingState",
      "chargingPointBinding",
      "connectorBindings",
      "transactionBindings",
    ];
    const matches = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(repoRoot, filePath).replaceAll("\\", "/");
      const source = readFileSync(filePath, "utf8");

      return forbiddenNames
        .filter((name) => source.includes(name))
        .map((name) => `${relativePath} -> ${name}`);
    });

    for (const removedBindingsDir of removedBindingsDirs) {
      expect(existsSync(removedBindingsDir)).toBe(false);
    }
    expect(readFileSync(modelIndex, "utf8")).not.toContain("./bindings");
    expect(matches).toEqual([]);
  });

  test("domain model source is not nested under core directory", () => {
    const oldCoreDir = join(repoRoot, "packages/simulator-core/src/model/core");
    const expectedModelDirs = [
      "device",
      "transaction",
      "authorization",
      "configuration",
      "shared",
    ].map((name) => join(repoRoot, "packages/simulator-core/src/model", name));
    const sourceFiles = filesToScan().filter((filePath) =>
      relative(repoRoot, filePath)
        .replaceAll("\\", "/")
        .startsWith("packages/simulator-core/src/")
    );
    const matches = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(repoRoot, filePath).replaceAll("\\", "/");
      const source = readFileSync(filePath, "utf8");
      return ["model/core", "./core", "../core"]
        .filter((token) => source.includes(token))
        .map((token) => `${relativePath} -> ${token}`);
    });

    expect(existsSync(oldCoreDir)).toBe(false);
    for (const modelDir of expectedModelDirs) {
      expect(existsSync(modelDir)).toBe(true);
    }
    expect(matches).toEqual([]);
  });

  test("protocol stack source lives under protocol directory", () => {
    const protocolDir = join(repoRoot, "packages/simulator-core/src/protocol");
    const oldScopedSessionDirName = ["protocol", "Session"].join("");
    const oldTopLevelProtocolDirs = [
      "protocolRuntime",
      oldScopedSessionDirName,
      "transport",
    ].map((name) => join(repoRoot, "packages/simulator-core/src", name));
    const expectedProtocolDirs = ["runtime", "session", "transport"].map((name) =>
      join(protocolDir, name)
    );

    for (const oldDir of oldTopLevelProtocolDirs) {
      expect(existsSync(oldDir)).toBe(false);
    }

    for (const protocolStackDir of expectedProtocolDirs) {
      expect(existsSync(protocolStackDir)).toBe(true);
    }
  });

  test("protocol communication layer uses session naming under protocol scope", () => {
    const oldSessionDir = join(repoRoot, "packages/simulator-core/src/session");
    const sessionDir = join(repoRoot, "packages/simulator-core/src/protocol/session");
    const oldSessionExport = ["./protocol", "Session"].join("");
    const oldClassName = ["ChargingPoint", "Protocol", "Session"].join("");
    const oldInterfaceName = ["I", "Protocol", "Session"].join("");
    const oldErrorName = ["Protocol", "Session", "Error"].join("");
    const oldOptionsName = ["Protocol", "Session", "Options"].join("");
    const oldConnectionStateName = ["Protocol", "Session", "ConnectionState"].join("");
    const rootIndexSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/index.ts"),
      "utf8",
    );
    const packageSource = readFileSync(
      join(repoRoot, "packages/simulator-core/package.json"),
      "utf8",
    );
    const sessionSource = readFileSync(
      join(sessionDir, "index.ts"),
      "utf8",
    );
    const sessionTypesSource = readFileSync(
      join(sessionDir, "types.ts"),
      "utf8",
    );

    expect(existsSync(oldSessionDir)).toBe(false);
    expect(existsSync(sessionDir)).toBe(true);
    expect(rootIndexSource).not.toContain("./session");
    expect(rootIndexSource).toContain("./protocol/session");
    expect(packageSource).not.toContain(oldSessionExport);
    expect(packageSource).toContain("./session");
    expect(packageSource).toContain("src/protocol/session");
    expect(sessionSource).toContain("ChargingPointSession");
    expect(sessionSource).not.toContain(oldClassName);
    expect(sessionTypesSource).toContain("ISession");
    expect(sessionTypesSource).toContain("SessionError");
    expect(sessionTypesSource).toContain("SessionOptions");
    expect(sessionTypesSource).toContain("SessionConnectionState");
    expect(sessionTypesSource).not.toContain(oldInterfaceName);
    expect(sessionTypesSource).not.toContain(oldErrorName);
    expect(sessionTypesSource).not.toContain(oldOptionsName);
    expect(sessionTypesSource).not.toContain(oldConnectionStateName);
  });

  test("generic simulator API exposes typed event bus instead of on off events", () => {
    const typesSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/types.ts"),
      "utf8",
    );
    const simulatorSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/ocpp16/Ocpp16Simulator.ts"),
      "utf8",
    );
    const indexSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/index.ts"),
      "utf8",
    );
    const eventBusStart = typesSource.indexOf("export interface SimulatorEventBus");
    const eventMapStart = typesSource.indexOf("export type SimulatorEventMap = {");
    const simulatorInterfaceStart = typesSource.indexOf("export interface Simulator {");

    expect(simulatorSource).not.toMatch(/\n  (?:public\s+)?on\s*(?:<|\()/);
    expect(simulatorSource).not.toMatch(/\n  (?:public\s+)?off\s*(?:<|\()/);
    expect(eventBusStart).toBeGreaterThanOrEqual(0);
    expect(eventMapStart).toBeGreaterThanOrEqual(0);
    expect(simulatorInterfaceStart).toBeGreaterThan(eventBusStart);
    expect(typesSource).toContain("export interface SimulatorEventBus");
    expect(typesSource).toContain("readonly events: SimulatorEventBus");
    expect(typesSource).toContain("\"simulator.status\": SimulatorStatusEvent");
    expect(typesSource).toContain("\"session.status\": SessionStatusEvent");
    expect(typesSource).toContain("\"chargingPoint.status\": ChargingPointStatusEvent");
    expect(typesSource).toContain("\"evse.status\": EVSEStatusEvent");
    expect(typesSource).toContain("\"connector.status\": ConnectorStatusEvent");
    expect(typesSource).toContain("\"authorization.status\": AuthorizationStatusEvent");
    expect(typesSource).toContain("\"transaction.status\": TransactionStatusEvent");
    expect(typesSource).toContain("\"transaction.meterValue\": TransactionMeterValueEvent");
    expect(typesSource).toContain("\"protocol.message\": ProtocolMessageEvent");
    expect(indexSource).toContain("SimulatorEventBus");

    const eventMapEnd = typesSource.indexOf("};", eventMapStart);
    expect(eventMapEnd).toBeGreaterThan(eventMapStart);

    const eventMapSource = typesSource.slice(eventMapStart, eventMapEnd);
    const eventKeys = [...eventMapSource.matchAll(/"([^"]+)"\s*:/g)]
      .map((match) => match[1]);
    expect(eventKeys).toEqual([
      "simulator.status",
      "session.status",
      "chargingPoint.status",
      "evse.status",
      "connector.status",
      "authorization.status",
      "transaction.status",
      "transaction.meterValue",
      "protocol.message",
    ]);

    const eventBusSource = typesSource.slice(eventBusStart, simulatorInterfaceStart);
    expect(eventBusSource).toContain("subscribe<TType extends");
    expect(eventBusSource).toContain("type: TType,");
    expect(eventBusSource).toContain("listener: (event: SimulatorEventMap[TType]) => void");
    expect(eventBusSource).toContain("): () => void");
    expect(eventBusSource).toMatch(
      /subscribe<TType extends[^>]+>\(\s*type: TType,\s*listener: \(event: SimulatorEventMap\[TType\]\) => void,\s*\): \(\) => void;/s,
    );

    const simulatorInterfaceEnd = typesSource.indexOf(
      "export type Ocpp16SimulatorOptions",
      simulatorInterfaceStart,
    );
    expect(simulatorInterfaceEnd).toBeGreaterThan(simulatorInterfaceStart);

    const simulatorInterfaceSource = typesSource.slice(
      simulatorInterfaceStart,
      simulatorInterfaceEnd,
    );
    expect(simulatorInterfaceSource).not.toMatch(/\bon\s*(?:<|\()/);
    expect(simulatorInterfaceSource).not.toMatch(/\boff\s*(?:<|\()/);
    expect(typesSource).not.toMatch(/\bpayload\??\s*:/);

    const removedTypeNames = [
      ["Simulator", "Event", "By", "Type"].join(""),
      ["Simulator", "Event", "Name"].join(""),
      ["Simulator", "Event", "Listener"].join(""),
    ];
    const removedFieldNames = [
      ["event", "Type"].join(""),
      ["event", "Name"].join(""),
    ];
    const removedPayloadRecord = ["payload", " Record<string, unknown>"].join(":");

    for (const source of [typesSource, simulatorSource, indexSource]) {
      for (const removedTypeName of removedTypeNames) {
        expect(source).not.toContain(removedTypeName);
      }
      for (const removedFieldName of removedFieldNames) {
        expect(source).not.toContain(`${removedFieldName}:`);
        expect(source).not.toMatch(new RegExp(`\\b${removedFieldName}\\??\\s*:`));
      }
      expect(source).not.toContain(removedPayloadRecord);
      expect(source).not.toMatch(/\bpayload\??\s*:/);
    }
  });

  test("generic simulator API does not expose protocol details wrapper", () => {
    const typesSource = readFileSync(
      join(repoRoot, "packages/simulator-core/src/simulator/types.ts"),
      "utf8",
    );

    expect(typesSource).not.toContain("protocolDetails");
    expect(typesSource).not.toContain("SimulatorProtocolDetails");

    function readInterfaceSource(source: string, interfaceName: string): string {
      const start = source.indexOf(`export interface ${interfaceName}`);
      expect(start).toBeGreaterThanOrEqual(0);

      const nextInterface = source.indexOf("export interface ", start + 1);
      const nextEventMap = source.indexOf("export type SimulatorEventMap", start + 1);
      const candidates = [nextInterface, nextEventMap].filter((index) => index > start);
      const end = candidates.length === 0 ? source.length : Math.min(...candidates);

      return source.slice(start, end);
    }

    const publicEventInterfaces = [
      "SimulatorStatusEvent",
      "SessionStatusEvent",
      "ChargingPointStatusEvent",
      "EVSEStatusEvent",
      "ConnectorStatusEvent",
      "AuthorizationStatusEvent",
      "TransactionStatusEvent",
      "TransactionMeterValueEvent",
    ];

    for (const interfaceName of publicEventInterfaces) {
      expect(readInterfaceSource(typesSource, interfaceName)).not.toContain("protocolDetails");
    }

    const protocolMessageEvent = readInterfaceSource(typesSource, "ProtocolMessageEvent");
    expect(protocolMessageEvent).toContain("body?: unknown");
    expect(protocolMessageEvent).not.toContain("protocolDetails");
  });
});
