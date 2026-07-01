import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(webRoot, "src");

describe("web architecture", () => {
  test("station workbench seam exposes grouped view models", () => {
    const workbenchPath = join(srcRoot, "useStationWorkbench.ts");
    const workbenchSource = readFileSync(workbenchPath, "utf8");

    expect(existsSync(workbenchPath)).toBe(true);
    expect(workbenchSource).toContain("authPanel");
    expect(workbenchSource).toContain("stationList");
    expect(workbenchSource).toContain("stationEditor");
    expect(workbenchSource).toContain("stationDetail");
    expect(workbenchSource).toContain("transactionPanel");
    expect(workbenchSource).toContain("eventTimeline");
  });

  test("app shell does not own transport or workbench state details", () => {
    const appSource = readFileSync(join(srcRoot, "App.tsx"), "utf8");

    expect(appSource).toContain("QueryClientProvider");
    expect(appSource).toContain("RouterProvider");
    expect(appSource).not.toContain("fetch(");
    expect(appSource).not.toContain("EventSource");
    expect(appSource).not.toContain("setLoginPassword");
    expect(appSource).not.toContain("setConnectorId");
    expect(appSource).not.toContain("setActiveTransactionId");
  });

  test("charging point list route owns list data and filter state", () => {
    const routePath = join(srcRoot, "routes", "charging-points.tsx");
    const routeSource = readFileSync(routePath, "utf8");

    expect(existsSync(routePath)).toBe(true);
    expect(routeSource).toContain("useQuery");
    expect(routeSource).toContain("useForm");
    expect(routeSource).toContain("standardSchemaResolver");
    expect(routeSource).toContain("z.object");
    expect(routeSource).toContain("useChargingPointListStore");
  });

  test("router uses code-defined routes for the initial shell", () => {
    const routerPath = join(srcRoot, "router.tsx");
    const routerSource = readFileSync(routerPath, "utf8");

    expect(existsSync(routerPath)).toBe(true);
    expect(routerSource).toContain("createRootRoute");
    expect(routerSource).toContain("/charging-points");
  });
});
