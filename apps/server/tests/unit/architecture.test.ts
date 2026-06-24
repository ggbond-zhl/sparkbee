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
    const runtimeSource = readFileSync(join(srcRoot, "services/runtime.service.ts"), "utf8");
    const projectionSource = readFileSync(
      join(srcRoot, "services/protocol-event-projection.ts"),
      "utf8",
    );
    const registrySource = readFileSync(join(srcRoot, "services/station-runtime-registry.ts"), "utf8");

    expect(runtimeSource).not.toContain("SIMULATOR_EVENT_TYPES");
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
    const runtimeSource = readFileSync(join(srcRoot, "services/runtime.service.ts"), "utf8");
    const registrySource = readFileSync(join(srcRoot, "services/station-runtime-registry.ts"), "utf8");

    expect(runtimeSource).not.toContain("new Map<string, RuntimeEntry>");
    expect(runtimeSource).not.toContain("disposeRuntime");
    expect(runtimeSource).toContain("StationRuntimeRegistry");
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

  test("protocol event history owns retention and cursor semantics", () => {
    const eventServiceSource = readFileSync(join(srcRoot, "services/event.service.ts"), "utf8");
    const historySource = readFileSync(join(srcRoot, "services/protocol-event-history.ts"), "utf8");
    const repositorySource = readFileSync(join(srcRoot, "repositories/postgres-event.repository.ts"), "utf8");

    expect(eventServiceSource).toContain("ProtocolEventHistory");
    expect(eventServiceSource).not.toContain("trimStationEvents");
    expect(historySource).toContain("trimStationEvents");
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

  test("web station workbench exposes grouped view models", () => {
    const appSource = readFileSync(join(serverRoot, "../web/src/App.tsx"), "utf8");
    const workbenchSource = readFileSync(join(serverRoot, "../web/src/useStationWorkbench.ts"), "utf8");

    expect(workbenchSource).toContain("authPanel");
    expect(workbenchSource).toContain("stationEditor");
    expect(workbenchSource).toContain("transactionPanel");
    expect(workbenchSource).toContain("eventTimeline");
    expect(appSource).not.toContain("setLoginPassword");
    expect(appSource).not.toContain("setConnectorId");
    expect(appSource).not.toContain("setActiveTransactionId");
  });
});
