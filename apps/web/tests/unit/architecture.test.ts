import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(webRoot, "src");

function readSource(...paths: string[]) {
  return readFileSync(join(srcRoot, ...paths), "utf8");
}

describe("web architecture", () => {
  test("charging point workbench seam exposes grouped view models", () => {
    const workbenchPath = join(srcRoot, "useChargingPointWorkbench.ts");
    const workbenchSource = readFileSync(workbenchPath, "utf8");

    expect(existsSync(workbenchPath)).toBe(true);
    expect(workbenchSource).toContain("authPanel");
    expect(workbenchSource).toContain("chargingPointList");
    expect(workbenchSource).toContain("chargingPointEditor");
    expect(workbenchSource).toContain("chargingPointDetail");
    expect(workbenchSource).toContain("transactionPanel");
    expect(workbenchSource).toContain("eventTimeline");
    expect(workbenchSource).not.toContain("station");
    expect(existsSync(join(srcRoot, "useStationWorkbench.ts"))).toBe(false);
  });

  test("app shell only wires providers and router", () => {
    const appSource = readSource("App.tsx");
    const routerPath = join(srcRoot, "app", "router.tsx");
    const queryClientPath = join(srcRoot, "app", "queryClient.ts");

    expect(existsSync(routerPath)).toBe(true);
    expect(existsSync(queryClientPath)).toBe(true);
    expect(appSource).toContain("QueryClientProvider");
    expect(appSource).toContain("RouterProvider");
    expect(appSource).not.toContain("fetch(");
    expect(appSource).not.toContain("EventSource");
    expect(appSource).not.toContain("setLoginPassword");
    expect(appSource).not.toContain("setConnectorId");
    expect(appSource).not.toContain("setActiveTransactionId");
  });

  test("root route delegates navigation chrome to the app shell", () => {
    const rootRouteSource = readSource("app", "routes", "RootRoute.tsx");
    const appShellSource = readSource("app", "ui", "AppShell.tsx");
    const appSidebarSource = readSource("app", "ui", "AppSidebar.tsx");

    expect(rootRouteSource).toContain("AppShell");
    expect(rootRouteSource).toContain("Outlet");
    expect(rootRouteSource).not.toContain("<header");
    expect(rootRouteSource).not.toContain("<nav");

    expect(appShellSource).toContain("SidebarProvider");
    expect(appShellSource).toContain("SidebarInset");
    expect(appShellSource).toContain("SidebarTrigger");
    expect(appShellSource).toContain("AppSidebar");
    expect(appShellSource).toContain("充电桩列表");
    expect(appShellSource).toContain("md:flex");

    expect(appSidebarSource).toContain("SidebarMenuButton");
    expect(appSidebarSource).toContain("to=\"/charging-points\"");
    expect(appSidebarSource).toContain("充电桩列表");
    expect(appSidebarSource).not.toContain("运行操作");
    expect(existsSync(join(srcRoot, "components", "ui", "sidebar.tsx"))).toBe(
      true,
    );
  });

  test("charging point feature keeps route, ui, model, and api concerns separate", () => {
    const featureRoot = join(srcRoot, "features", "charging-points");
    const routePath = join(featureRoot, "routes", "ChargingPointsRoute.tsx");
    const pagePath = join(featureRoot, "ui", "ChargingPointListPage.tsx");
    const apiPath = join(featureRoot, "api", "chargingPoints.ts");
    const queryPath = join(featureRoot, "model", "chargingPointQueries.ts");
    const formPath = join(featureRoot, "model", "chargingPointListForm.ts");
    const createFormPath = join(featureRoot, "model", "chargingPointCreateForm.ts");
    const storePath = join(featureRoot, "model", "chargingPointListStore.ts");
    const routeSource = readFileSync(routePath, "utf8");
    const pageSource = readFileSync(pagePath, "utf8");
    const apiSource = readFileSync(apiPath, "utf8");
    const querySource = readFileSync(queryPath, "utf8");
    const formSource = readFileSync(formPath, "utf8");
    const createFormSource = readFileSync(createFormPath, "utf8");
    const storeSource = readFileSync(storePath, "utf8");

    expect(existsSync(routePath)).toBe(true);
    expect(existsSync(pagePath)).toBe(true);
    expect(existsSync(apiPath)).toBe(true);
    expect(existsSync(queryPath)).toBe(true);
    expect(existsSync(formPath)).toBe(true);
    expect(existsSync(createFormPath)).toBe(true);
    expect(existsSync(storePath)).toBe(true);

    expect(routeSource).toContain("ChargingPointListPage");
    expect(routeSource).not.toContain("useQuery");
    expect(routeSource).not.toContain("useForm");
    expect(routeSource).not.toContain("fetch(");
    expect(routeSource).not.toContain("z.object");

    expect(pageSource).toContain("useQuery");
    expect(pageSource).toContain("useForm");
    expect(pageSource).toContain("useChargingPointListStore");
    expect(pageSource).toContain("ChargingPointMobileCardList");
    expect(pageSource).toContain("ChargingPointTable");
    expect(pageSource).toContain("md:hidden");
    expect(pageSource).toContain("hidden flex-col gap-3 md:flex");
    expect(pageSource).toContain("TableHeader");
    expect(pageSource).toContain("TableCell");
    expect(pageSource).toContain("Card");
    expect(pageSource).toContain("Checkbox");
    expect(pageSource).toContain("DialogTrigger");
    expect(pageSource).toContain("DropdownMenuTrigger");
    expect(pageSource).toContain("AlertDialogContent");
    expect(pageSource).toContain("新增");
    expect(pageSource).toContain("操作");
    expect(pageSource).toContain("删除");
    expect(pageSource).toContain("确认删除");
    expect(pageSource).toContain("chargingPointCreateFormSchema");
    expect(pageSource).toContain("useMutation");
    expect(pageSource).toContain("invalidateQueries");
    expect(pageSource).toContain("FieldGroup");
    expect(pageSource).toContain("FieldLabel");
    expect(pageSource).toContain("Textarea");
    expect(pageSource).toContain("CSMS 地址");
    expect(pageSource).toContain("全选当前列表");
    expect(storeSource).toContain("selectedIds");
    expect(storeSource).toContain("toggleSelectedId");
    expect(storeSource).toContain("toggleAllVisible");
    expect(storeSource).toContain("removeDeletedId");
    expect(apiSource).toContain("@spark-bee/contracts");
    expect(apiSource).toContain("fetch(");
    expect(apiSource).toContain("createChargingPoint");
    expect(apiSource).toContain("deleteChargingPoint");
    expect(apiSource).toContain("POST");
    expect(apiSource).toContain("DELETE");
    expect(querySource).toContain("queryOptions");
    expect(formSource).toContain("z.object");
    expect(createFormSource).toContain("createChargingPointRequestSchema");
  });

  test("router uses code-defined routes and shared ui stays outside features", () => {
    const routerSource = readSource("app", "router.tsx");

    expect(routerSource).toContain("createRootRoute");
    expect(routerSource).toContain("/charging-points");
    expect(routerSource).toContain("features/charging-points/routes/ChargingPointsRoute");
    expect(existsSync(join(srcRoot, "components", "ui", "button.tsx"))).toBe(true);
    expect(existsSync(join(srcRoot, "components", "ui", "alert-dialog.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(srcRoot, "components", "ui", "dialog.tsx"))).toBe(true);
    expect(
      existsSync(join(srcRoot, "components", "ui", "dropdown-menu.tsx")),
    ).toBe(true);
    expect(existsSync(join(srcRoot, "components", "ui", "textarea.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(srcRoot, "components", "ui", "table.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(srcRoot, "components", "ui", "sidebar.tsx"))).toBe(
      true,
    );
  });
});
