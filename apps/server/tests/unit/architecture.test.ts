import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
  test("station app interface hides runtime command dispatch", () => {
    const files = sourceFiles();
    const forbidden = ["executeCommand", "StationCommand", "services.runtime"];
    const matches = files.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return forbidden
        .filter((token) => source.includes(token))
        .map((token) => `${relative(serverRoot, filePath)} -> ${token}`);
    });

    expect(matches).toEqual([]);
  });

  test("runtime event subscription choices stay in protocol projection", () => {
    const stationSource = readFileSync(join(srcRoot, "services/station.service.ts"), "utf8");
    const projectionSource = readFileSync(
      join(srcRoot, "services/protocol-event-projection.ts"),
      "utf8",
    );
    const registrySource = readFileSync(join(srcRoot, "services/station-runtime-registry.ts"), "utf8");

    expect(stationSource).not.toContain("SIMULATOR_EVENT_TYPES");
    expect(registrySource).toContain("this.eventProjection.subscribeToRuntime");
    expect(projectionSource).toContain("subscribeToRuntime");
  });

  test("station controller delegates HTTP input assembly", () => {
    const controllerSource = readFileSync(join(srcRoot, "controllers/station.controller.ts"), "utf8");
    const inputSource = readFileSync(join(srcRoot, "controllers/station-request-input.ts"), "utf8");

    expect(controllerSource).not.toContain("parseJson");
    expect(controllerSource).not.toContain("parseParams");
    expect(controllerSource).not.toContain("parseQuery");
    expect(controllerSource).not.toContain("new Date(");
    expect(controllerSource).toContain("StationRequestInput");
    expect(inputSource).toContain("parseJson");
    expect(inputSource).toContain("parseParams");
    expect(inputSource).toContain("parseQuery");
  });

  test("runtime registry ownership stays outside runtime commands", () => {
    const stationSource = readFileSync(join(srcRoot, "services/station.service.ts"), "utf8");
    const registrySource = readFileSync(join(srcRoot, "services/station-runtime-registry.ts"), "utf8");

    expect(stationSource).not.toContain("new Map<string, RuntimeEntry>");
    expect(stationSource).not.toContain("disposeRuntime");
    expect(stationSource).toContain("StationRuntimeRegistry");
    expect(registrySource).toContain("new Map<string, RuntimeEntry>");
    expect(registrySource).toContain("dispose");
  });

  test("protocol event stream delivery owns SSE framing", () => {
    const controllerSource = readFileSync(join(srcRoot, "controllers/event.controller.ts"), "utf8");
    const deliverySource = readFileSync(join(srcRoot, "services/protocol-event-stream-delivery.ts"), "utf8");

    expect(controllerSource).not.toContain("new ReadableStream");
    expect(controllerSource).not.toContain("controller.enqueue");
    expect(controllerSource).toContain("ProtocolEventStreamDelivery");
    expect(deliverySource).toContain("new ReadableStream");
    expect(deliverySource).toContain("text/event-stream");
  });

  test("protocol event ledger owns retention and stream notification", () => {
    const ledgerSource = readFileSync(join(srcRoot, "services/protocol-event-ledger.ts"), "utf8");
    const repositorySource = readFileSync(join(srcRoot, "repositories/postgres-event.repository.ts"), "utf8");

    expect(existsSync(join(srcRoot, "services/protocol-event-history.ts"))).toBe(false);
    expect(ledgerSource).toContain("trimStationEvents");
    expect(ledgerSource).toContain("listener(event)");
    expect(repositorySource).toContain("or(");
    expect(repositorySource).toContain("and(");
    expect(repositorySource).toContain("gt(eventLogs.id");
  });

  test("station runtime adapter hides simulator-core operation types", () => {
    const adapterSource = readFileSync(join(srcRoot, "services/station-runtime.adapter.ts"), "utf8");

    const leakedTypeNames = [
      "SimulatorStartResult",
      "SimulatorStopResult",
      "SimulatorAuthorizeResult",
      "SimulatorMeterValueInput",
      "SimulatorMeterValueResult",
      "SimulatorStartTransactionInput",
      "SimulatorStopTransactionInput",
      "SimulatorStopTransactionResult",
      "SimulatorTransactionStartResult",
    ];

    for (const leakedTypeName of leakedTypeNames) {
      expect(adapterSource).not.toContain(`type ${leakedTypeName}`);
      expect(adapterSource).not.toContain(`Promise<${leakedTypeName}`);
    }
    expect(adapterSource).toContain("StationRuntimeStartResult");
    expect(adapterSource).toContain("StationRuntimeTransactionStartResult");
  });

  test("server production code reaches simulator core only through station runtime adapter", () => {
    const matches = sourceFiles().flatMap((filePath) => {
      const relativePath = relative(serverRoot, filePath).replaceAll("\\", "/");
      if (relativePath === "src/services/station-runtime.adapter.ts") {
        return [];
      }

      const source = readFileSync(filePath, "utf8");
      return source.includes("@spark-bee/simulator-core")
        ? [relativePath]
        : [];
    });

    expect(matches).toEqual([]);
  });

});
