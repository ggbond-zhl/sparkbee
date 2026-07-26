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
  test("charging point collection documents its Card exception to DataTable", () => {
    const repoRoot = join(webRoot, "../..");
    const adrPath = join(
      repoRoot,
      "docs",
      "adr",
      "0028-charging-point-collection-card-grid.md",
    );
    const adrSource = existsSync(adrPath) ? readFileSync(adrPath, "utf8") : "";

    expect(existsSync(adrPath)).toBe(true);
    expect(adrSource).toContain("Card");
    expect(adrSource).toContain("DataTable");
    expect(adrSource).toContain("无限滚动");
  });

  test("charging point detail renders through the feature workbench seam", () => {
    const legacyWorkbenchPath = join(srcRoot, "useChargingPointWorkbench.ts");
    const workbenchPath = join(
      srcRoot,
      "features",
      "charging-points",
      "model",
      "useChargingPointWorkbench.ts",
    );
    const observationPath = join(
      srcRoot,
      "features",
      "charging-points",
      "model",
      "useChargingPointObservation.ts",
    );
    const detailPageSource = readSource(
      "features",
      "charging-points",
      "ui",
      "ChargingPointDetailPage.tsx",
    );
    const workbenchSource = existsSync(workbenchPath)
      ? readFileSync(workbenchPath, "utf8")
      : "";
    const observationSource = existsSync(observationPath)
      ? readFileSync(observationPath, "utf8")
      : "";

    expect(existsSync(legacyWorkbenchPath)).toBe(false);
    expect(existsSync(workbenchPath)).toBe(true);
    expect(detailPageSource).toContain("useChargingPointWorkbench");
    expect(detailPageSource).not.toContain("useQuery");
    expect(detailPageSource).not.toContain("useMutation");
    expect(detailPageSource).not.toContain("api/chargingPoints");
    expect(detailPageSource).not.toContain("chargingPointQueries");
    expect(detailPageSource).not.toContain("useChargingPointRuntimeEvents");
    expect(detailPageSource).not.toContain('value="actor-logs"');
    expect(detailPageSource).not.toContain("usePersistedActorLogs");
    expect(workbenchSource).toContain("useQuery");
    expect(workbenchSource).toContain("useMutation");
    expect(workbenchSource).toContain("useChargingPointObservation");
    expect(observationSource).toContain("useChargingPointRuntimeEvents");
    expect(observationSource).toContain("useInfiniteQuery");
  });

  test("app shell only wires providers and router", () => {
    const appSource = readSource("App.tsx");
    const routerPath = join(srcRoot, "app", "router.tsx");
    const queryClientPath = join(srcRoot, "app", "queryClient.ts");

    expect(existsSync(routerPath)).toBe(true);
    expect(existsSync(queryClientPath)).toBe(true);
    expect(appSource).toContain("QueryClientProvider");
    expect(appSource).toContain("RouterProvider");
    expect(appSource).toContain("Toaster");
    expect(appSource).not.toContain("fetch(");
    expect(appSource).not.toContain("EventSource");
    expect(appSource).not.toContain("setLoginPassword");
    expect(appSource).not.toContain("setConnectorId");
    expect(appSource).not.toContain("setActiveTransactionId");
  });

  test("root route delegates navigation chrome to the app shell", () => {
    const rootRouteSource = readSource("app", "routes", "RootRoute.tsx");
    const appShellSource = readSource("app", "ui", "AppShell.tsx");
    expect(appShellSource).toContain("ArrowLeftIcon");
    expect(appShellSource).toContain('to="/charging-points"');
    expect(appShellSource).toContain("ml-auto");
    expect(appShellSource).toContain("currentPageTitle ?? \"SparkBee\"");
    expect(appShellSource).not.toContain("<span>返回</span>");
    const appSidebarSource = readSource("app", "ui", "AppSidebar.tsx");
    expect(appSidebarSource).toContain('side={isMobile ? "right" : "left"}');
    expect(appSidebarSource).toContain("useSidebar");
    const navigationSource = readSource("app", "navigation.ts");

    expect(rootRouteSource).toContain("AppShell");
    expect(rootRouteSource).toContain("Outlet");
    expect(rootRouteSource).toContain("getDocumentTitleForPath");
    expect(rootRouteSource).toContain("document.title");
    expect(rootRouteSource).not.toContain("<header");
    expect(rootRouteSource).not.toContain("<nav");

    expect(appShellSource).toContain("SidebarProvider");
    expect(appShellSource).toContain("defaultOpen");
    expect(appShellSource).not.toContain("<SidebarProvider open");
    expect(appShellSource).toContain("SidebarInset");
    expect(appShellSource).toContain("SidebarTrigger");
    expect(appShellSource).toContain("AppSidebar");
    expect(appShellSource).toContain("getPageTitleForPath");
    expect(appShellSource).toContain("sticky top-0");

    expect(navigationSource).toContain("appMenuItems");
    expect(navigationSource).toContain("充电桩列表");
    expect(navigationSource).toContain("SparkBee");
    expect(appSidebarSource).toContain("SidebarMenuButton");
    expect(appSidebarSource).toContain("appMenuItems");
    expect(appSidebarSource).not.toContain("运行操作");
    expect(existsSync(join(srcRoot, "components", "ui", "sidebar.tsx"))).toBe(
      true,
    );
  });

  test("charging point feature keeps route, ui, model, and api concerns separate", () => {
    const featureRoot = join(srcRoot, "features", "charging-points");
    const routerPath = join(srcRoot, "app", "router.tsx");
    const routePath = join(featureRoot, "routes", "ChargingPointsRoute.tsx");
    const pagePath = join(featureRoot, "ui", "ChargingPointListPage.tsx");
    const detailPagePath = join(
      featureRoot,
      "ui",
      "ChargingPointDetailPage.tsx",
    );
    const createDialogPath = join(
      featureRoot,
      "ui",
      "ChargingPointCreateDialog.tsx",
    );
    const editDialogPath = join(
      featureRoot,
      "ui",
      "ChargingPointEditDialog.tsx",
    );
    const connectorDialogPath = join(
      featureRoot,
      "ui",
      "ChargingPointConnectorManagementDialog.tsx",
    );
    const connectorEditDialogPath = join(
      featureRoot,
      "ui",
      "ChargingPointConnectorEditDialog.tsx",
    );
    const connectorFormFieldsPath = join(
      featureRoot,
      "ui",
      "ChargingPointConnectorFormFields.tsx",
    );
    const formFieldsPath = join(
      featureRoot,
      "ui",
      "ChargingPointFormFields.tsx",
    );
    const apiPath = join(featureRoot, "api", "chargingPoints.ts");
    const queryPath = join(featureRoot, "model", "chargingPointQueries.ts");
    const workbenchPath = join(
      featureRoot,
      "model",
      "useChargingPointWorkbench.ts",
    );
    const observationPath = join(
      featureRoot,
      "model",
      "useChargingPointObservation.ts",
    );
    const workbenchModelPath = join(
      featureRoot,
      "model",
      "chargingPointWorkbench.ts",
    );
    const workbenchTestPath = join(
      webRoot,
      "tests",
      "unit",
      "chargingPointWorkbench.test.ts",
    );
    const detailHeaderModelPath = join(
      featureRoot,
      "model",
      "chargingPointDetailHeader.ts",
    );
    const connectorCardsModelPath = join(
      featureRoot,
      "model",
      "chargingPointConnectorCards.ts",
    );
    const connectorDisplayModelPath = join(
      featureRoot,
      "model",
      "connectorDisplay.ts",
    );
    const formPath = join(featureRoot, "model", "chargingPointListForm.ts");
    const createFormPath = join(
      featureRoot,
      "model",
      "chargingPointCreateForm.ts",
    );
    const storePath = join(featureRoot, "model", "chargingPointListStore.ts");
    const dataTablePath = join(
      srcRoot,
      "components",
      "data-table",
      "DataTable.tsx",
    );
    const chartPath = join(srcRoot, "components", "ui", "chart.tsx");
    const routerSource = readFileSync(routerPath, "utf8");
    const routeSource = readFileSync(routePath, "utf8");
    const pageSource = readFileSync(pagePath, "utf8");
    const detailPageSource = existsSync(detailPagePath)
      ? readFileSync(detailPagePath, "utf8")
      : "";
    const chartSource = existsSync(chartPath)
      ? readFileSync(chartPath, "utf8")
      : "";
    const createDialogSource = readFileSync(createDialogPath, "utf8");
    const editDialogSource = readFileSync(editDialogPath, "utf8");
    const connectorDialogSource = readFileSync(connectorDialogPath, "utf8");
    const connectorEditDialogSource = existsSync(connectorEditDialogPath)
      ? readFileSync(connectorEditDialogPath, "utf8")
      : "";
    const connectorFormFieldsSource = existsSync(connectorFormFieldsPath)
      ? readFileSync(connectorFormFieldsPath, "utf8")
      : "";
    const formFieldsSource = readFileSync(formFieldsPath, "utf8");
    const apiSource = readFileSync(apiPath, "utf8");
    const querySource = readFileSync(queryPath, "utf8");
    const workbenchSource = existsSync(workbenchPath)
      ? readFileSync(workbenchPath, "utf8")
      : "";
    const observationSource = existsSync(observationPath)
      ? readFileSync(observationPath, "utf8")
      : "";
    const workbenchModelSource = existsSync(workbenchModelPath)
      ? readFileSync(workbenchModelPath, "utf8")
      : "";
    const detailHeaderModelSource = existsSync(detailHeaderModelPath)
      ? readFileSync(detailHeaderModelPath, "utf8")
      : "";
    const connectorCardsModelSource = existsSync(connectorCardsModelPath)
      ? readFileSync(connectorCardsModelPath, "utf8")
      : "";
    const connectorDisplayModelSource = existsSync(connectorDisplayModelPath)
      ? readFileSync(connectorDisplayModelPath, "utf8")
      : "";
    const formSource = readFileSync(formPath, "utf8");
    const createFormSource = readFileSync(createFormPath, "utf8");
    const storeSource = readFileSync(storePath, "utf8");
    const dataTableSource = existsSync(dataTablePath)
      ? readFileSync(dataTablePath, "utf8")
      : "";

    expect(existsSync(routePath)).toBe(true);
    expect(existsSync(pagePath)).toBe(true);
    expect(existsSync(detailPagePath)).toBe(true);
    expect(existsSync(createDialogPath)).toBe(true);
    expect(existsSync(editDialogPath)).toBe(true);
    expect(existsSync(connectorDialogPath)).toBe(true);
    expect(existsSync(connectorEditDialogPath)).toBe(true);
    expect(existsSync(connectorFormFieldsPath)).toBe(true);
    expect(existsSync(formFieldsPath)).toBe(true);
    expect(existsSync(apiPath)).toBe(true);
    expect(existsSync(queryPath)).toBe(true);
    expect(existsSync(workbenchPath)).toBe(true);
    expect(existsSync(workbenchModelPath)).toBe(true);
    expect(existsSync(workbenchTestPath)).toBe(true);
    expect(existsSync(detailHeaderModelPath)).toBe(true);
    expect(existsSync(connectorCardsModelPath)).toBe(true);
    expect(existsSync(connectorDisplayModelPath)).toBe(true);
    expect(existsSync(formPath)).toBe(true);
    expect(existsSync(createFormPath)).toBe(true);
    expect(existsSync(storePath)).toBe(true);
    expect(existsSync(dataTablePath)).toBe(true);

    expect(routeSource).toContain("ChargingPointListPage");
    expect(routerSource).toContain("/charging-points/$chargingPointId");
    expect(routerSource).toContain("ChargingPointDetailRoute");
    expect(routerSource).toContain("scrollRestoration: true");
    expect(routeSource).not.toContain("useQuery");
    expect(routeSource).not.toContain("useForm");
    expect(routeSource).not.toContain("fetch(");
    expect(routeSource).not.toContain("z.object");

    expect(pageSource).toContain("useQuery");
    expect(pageSource).toContain("useForm");
    expect(pageSource).toContain("useChargingPointListStore");
    expect(pageSource).toContain("handleListSearch");
    expect(pageSource).toContain("useInfiniteQuery");
    expect(pageSource).toContain("ChargingPointCardList");
    expect(pageSource).toContain("MobileInfiniteListStatus");
    expect(pageSource).toContain(
      "grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3",
    );
    expect(pageSource).toContain("CardFooter");
    expect(pageSource).toContain('to="/charging-points/$chargingPointId"');
    expect(pageSource).toContain("chargingPointId");
    expect(pageSource).not.toContain("ChargingPointMobileCardList");
    expect(pageSource).not.toContain("ChargingPointTable");
    expect(pageSource).not.toContain("DataTable");
    expect(pageSource).not.toContain("ColumnDef");
    expect(pageSource).not.toContain("TableHeader");
    expect(pageSource).toContain("Card");
    expect(pageSource).not.toContain("Checkbox");
    expect(pageSource).not.toContain("selectedIds");
    expect(pageSource).toContain("DropdownMenuTrigger");
    expect(pageSource).toContain("DropdownMenuLabel");
    expect(pageSource).toContain("DropdownMenuRadioItem");
    expect(pageSource).toContain("ChargingPointCardActions");
    expect(pageSource).toContain("ChargingPointCreateDialog");
    expect(pageSource).toContain("ChargingPointEditDialog");
    expect(pageSource).toContain("ChargingPointConnectorManagementDialog");
    expect(pageSource).toContain("toast");
    expect(pageSource).toContain("AlertDialogContent");
    expect(pageSource).toContain("编辑");
    expect(pageSource).toContain("枪口管理");
    expect(pageSource).not.toContain("truncate font-mono text-xs");
    expect(pageSource).toContain("删除");
    expect(pageSource).toContain("确认删除");
    expect(pageSource).toContain("useMutation");
    expect(pageSource).toContain("invalidateQueries");
    expect(pageSource).toContain("FieldGroup");
    expect(pageSource).toContain("FieldLabel");
    expect(pageSource).not.toContain(
      'type="hidden" {...form.register("protocol")}',
    );
    expect(pageSource).not.toContain("chargingPointCreateFormSchema");
    expect(createDialogSource).toContain("DialogTrigger");
    expect(createDialogSource).toContain("新增");
    expect(createDialogSource).toContain("ChargingPointFormFields");
    expect(createDialogSource).toContain("chargingPointCreateFormSchema");
    expect(createDialogSource).toContain("max-h-[calc(100svh-2rem)]");
    expect(createDialogSource).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(createDialogSource).toContain("useMutation");
    expect(createDialogSource).toContain("invalidateQueries");
    expect(createDialogSource).toContain("toast");
    expect(editDialogSource).toContain("编辑充电桩");
    expect(editDialogSource).toContain("ChargingPointFormFields");
    expect(editDialogSource).toContain("chargingPointCreateFormSchema");
    expect(editDialogSource).toContain("max-h-[calc(100svh-2rem)]");
    expect(editDialogSource).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(editDialogSource).toContain("updateChargingPoint");
    expect(editDialogSource).toContain("invalidateQueries");
    expect(editDialogSource).toContain("toast");
    expect(editDialogSource).toContain("保存");
    expect(editDialogSource).toContain(
      "configurationLocked || updateMutation.isPending",
    );
    expect(connectorDialogSource).toContain("枪口管理");
    expect(connectorDialogSource).toContain("Tabs");
    expect(connectorDialogSource).toContain("TabsList");
    expect(connectorDialogSource).toContain("TabsTrigger");
    expect(connectorDialogSource).toContain("TabsContent");
    expect(connectorDialogSource).toContain("PlusIcon");
    expect(connectorDialogSource).toContain("SaveIcon");
    expect(connectorDialogSource).toContain("Trash2Icon");
    expect(connectorDialogSource).toContain("ConnectorTabForm");
    expect(connectorDialogSource).toContain("ChargingPointConnectorFormFields");
    expect(connectorDialogSource).toContain("createConnector");
    expect(connectorDialogSource).toContain("updateConnector");
    expect(connectorDialogSource).toContain("deleteConnector");
    expect(connectorDialogSource).toContain("toast");
    expect(connectorDialogSource).toContain("AlertDialogContent");
    expect(connectorDialogSource).toContain("确认删除枪口");
    expect(connectorDialogSource).toContain("setQueryData");
    expect(connectorDialogSource).not.toContain("Table");
    expect(connectorEditDialogSource).toContain("编辑枪口");
    expect(connectorEditDialogSource).toContain("connectorToFormValues");
    expect(connectorEditDialogSource).toContain(
      "ChargingPointConnectorFormFields",
    );
    expect(connectorEditDialogSource).toContain("updateConnector");
    expect(connectorEditDialogSource).toContain("onSaved");
    expect(connectorEditDialogSource).not.toContain("deleteConnector");
    expect(connectorEditDialogSource).not.toContain("Trash2Icon");
    expect(connectorEditDialogSource).not.toContain("AlertDialog");
    expect(connectorFormFieldsSource).toContain("FieldGroup");
    expect(connectorFormFieldsSource).toContain("data-dialog-select-content");
    expect(connectorFormFieldsSource).toContain("CONNECTOR_TYPE_OPTIONS");
    expect(connectorFormFieldsSource).not.toContain("CONNECTOR_FORMAT_OPTIONS");
    expect(connectorFormFieldsSource).not.toContain(">形态</FieldLabel>");
    expect(connectorFormFieldsSource).not.toContain("readOnly=");
    expect(connectorFormFieldsSource).toContain("min={1}");
    expect(connectorFormFieldsSource).toContain("CONNECTOR_POWER_TYPE_OPTIONS");
    expect(connectorFormFieldsSource).not.toContain(
      'placeholder="Type2 / CCS2"',
    );
    expect(connectorFormFieldsSource).not.toContain(
      '<SelectItem value="socket">socket</SelectItem>',
    );
    expect(connectorFormFieldsSource).not.toContain(
      '<SelectItem value="cable">cable</SelectItem>',
    );
    expect(connectorFormFieldsSource).not.toContain(
      '<SelectItem value="ac">ac</SelectItem>',
    );
    expect(connectorFormFieldsSource).not.toContain(
      '<SelectItem value="dc">dc</SelectItem>',
    );
    expect(connectorFormFieldsSource).not.toContain("maxPower");
    expect(connectorFormFieldsSource).not.toContain("功率 W");
    expect(detailPageSource).toContain("useChargingPointWorkbench");
    expect(detailPageSource).not.toContain("useQuery");
    expect(detailPageSource).not.toContain("useMutation");
    expect(workbenchSource).toContain("createReadyChargingPointWorkbench");
    expect(workbenchModelSource).not.toContain("useQuery");
    expect(workbenchModelSource).not.toContain("useMutation");
    expect(workbenchModelSource).not.toContain("api/chargingPoints");
    expect(detailPageSource).toContain("ChartContainer");
    expect(detailPageSource).toContain("LineChart");
    expect(detailPageSource).not.toContain("@/components/ui/tooltip");
    expect(detailPageSource).not.toContain("<Tooltip");
    expect(detailPageSource.match(/<ChartTooltip(?:\s|>)/g)?.length).toBe(2);
    expect(chartSource).toContain("RechartsPrimitive.ResponsiveContainer");
    expect(chartSource).toContain("ChartTooltipContent");
    expect(workbenchSource).toContain("chargingPointDetailQueryOptions");
    expect(workbenchSource).toContain("chargingPointRuntimeStatusQueryOptions");
    expect(detailPageSource).toContain("ChargingPointEditDialog");
    expect(detailPageSource).toContain("disabled={configuration.locked}");
    expect(detailPageSource).toContain("ChargingPointConnectorEditDialog");
    expect(detailPageSource).toContain("UnplugConnectorButton");
    expect(detailPageSource).toContain(
      "拔枪将以车辆断开原因停止当前交易，并将枪口设为未插枪。",
    );
    expect(detailPageSource).toContain("connectorEditor.target");
    expect(detailPageSource).toContain(
      "onEdit={() => connectorEditor.open(model.connector)}",
    );
    expect(detailPageSource).not.toContain("运行摘要");
    expect(detailPageSource).not.toContain(">运行状态</span>");
    expect(detailPageSource).toContain("@tanstack/react-virtual");
    expect(detailPageSource).toContain("useVirtualizer");
    expect(detailPageSource).toContain("VirtualObservationList");
    expect(detailPageSource).toContain("RuntimeObservationToolbar");
    expect(detailPageSource).toContain("OBSERVATION_TIME_FILTER_OPTIONS");
    expect(detailPageSource).toContain("filterObservationEntries");
    expect(detailPageSource).toContain("buildObservationTypeFilterOptions");
    expect(detailPageSource).toContain(
      '<TabsTrigger value="messages">报文</TabsTrigger>',
    );
    expect(detailPageSource).toContain(
      '<TabsTrigger value="events">事件</TabsTrigger>',
    );
    expect(detailPageSource).toContain(
      '<TabsTrigger value="deliveries">交易交付</TabsTrigger>',
    );
    expect(detailPageSource).toContain("<TransactionDeliveryStatusBadge");
    expect(detailPageSource).not.toContain("删除交付记录");
    expect(detailPageSource).not.toContain("跳过交付记录");
    expect(detailPageSource).not.toContain("filteredProtocolMessages.length}");
    expect(detailPageSource).not.toContain("filteredEvents.length}");
    expect(workbenchModelSource).toContain("capacity: number");
    expect(observationSource).toContain(
      "200 * (messageHistoryQuery.data?.pages.length ?? 1)",
    );
    expect(observationSource).toContain(
      "200 * (eventHistoryQuery.data?.pages.length ?? 1)",
    );
    expect(detailPageSource).toContain("limit: messageHistory.capacity");
    expect(detailPageSource).toContain("limit: eventHistory.capacity");
    expect(detailPageSource).toContain(
      "targetIndex !== previousAnchorIndex",
    );
    expect(detailPageSource).not.toContain("显示 {filteredCount}");
    expect(detailPageSource).toContain("时间筛选");
    expect(detailPageSource).toContain("类型筛选");
    expect(detailPageSource).not.toContain("PinIcon");
    expect(detailPageSource).not.toContain("滚动钉住");
    expect(detailPageSource).not.toContain("Trash2Icon");
    expect(detailPageSource).not.toContain("清空当前列表");
    expect(detailPageSource).not.toContain("当前页面会话内实时观察");
    expect(detailPageSource).not.toContain("当前页面打开后收到的最近 200 条");
    expect(detailPageSource).not.toContain(
      "<StatusBadge item={headerModel.sessionStatus}",
    );
    expect(detailPageSource).not.toContain("最终连接");
    expect(detailPageSource).toContain("headerModel.finalConnectionUrl");
    expect(detailPageSource).toContain("col-span-full");
    expect(detailPageSource).toContain("gap-x-3 gap-y-1");
    expect(
      detailPageSource.match(
        /<CardAction className="flex flex-wrap justify-end gap-2">/g,
      )?.length,
    ).toBe(2);
    expect(detailPageSource).toContain(
      "xl:grid-cols-[13rem_minmax(20rem,1fr)_minmax(20rem,1fr)]",
    );
    expect(detailPageSource).toContain("ConnectorElectricalChart");
    expect(detailPageSource).toContain("ConnectorEnergyChart");
    expect(detailPageSource).toContain("功率 / 电流 / 电压曲线");
    expect(detailPageSource).toContain("电量曲线");
    expect(detailPageSource).toContain("暂无充电采样");
    expect(detailPageSource).toContain("ELECTRICAL_CHART_SERIES.map");
    expect(detailPageSource).toContain("ConnectorElectricalMetricChart");
    expect(detailPageSource).toContain("formatElectricalMetricValue");
    expect(detailPageSource).toContain('label: "功率 kW"');
    expect(detailPageSource).toContain('unit: "kW"');
    expect(detailPageSource).toContain("numericValue / 1000");
    expect(detailPageSource).toContain("minimumFractionDigits: 2");
    expect(detailPageSource).toContain("getElectricalMetricDomain");
    expect(detailPageSource).toContain("toEnergyChartSamples");
    expect(detailPageSource).toContain('dataKey="meterKwh"');
    expect(detailPageSource).toContain("tickFormatter={formatEnergyAxisTick}");
    expect(detailPageSource).toContain("formatEnergyTooltipValue");
    expect(detailPageSource).toContain("getEnergyChartDomain");
    expect(detailPageSource).toContain(
      "domain={getEnergyChartDomain(samples)}",
    );
    expect(detailPageSource).toContain('className="flex h-40 flex-col gap-2"');
    expect(detailPageSource).toContain(
      '<div className="grid grid-cols-3 gap-2 xl:grid-cols-1">',
    );
    expect(detailPageSource).toContain(
      '<div className="grid grid-cols-2 gap-2 md:grid-cols-4">',
    );
    expect(detailPageSource).not.toContain('yAxisId="powerW"');
    expect(detailPageSource).not.toContain('yAxisId="currentA"');
    expect(detailPageSource).not.toContain('yAxisId="voltageV"');
    expect(detailPageSource).toContain("md:grid-cols-4");
    expect(detailPageSource).toContain("activeObservationTab");
    expect(detailPageSource).toContain("value={activeObservationTab}");
    expect(detailPageSource.indexOf('value="messages"')).toBeLessThan(
      detailPageSource.indexOf('value="events"'),
    );
    expect(detailPageSource).not.toContain("最终连接目标");
    expect(detailPageSource).not.toContain("headerModel.staticDetails");
    expect(detailHeaderModelSource).toContain("Boot 状态");
    expect(detailHeaderModelSource).toContain("会话状态");
    expect(detailHeaderModelSource).toContain("可用性");
    expect(detailHeaderModelSource).toContain("充电桩状态");
    expect(detailHeaderModelSource).toContain("chargingPointAvailability");
    expect(connectorCardsModelSource).toContain("connectorAvailabilities");
    expect(detailHeaderModelSource).not.toContain("最近异常");
    expect(detailPageSource).not.toContain(
      "<StatusBadge item={headerModel.chargingPointStatus}",
    );
    expect(detailPageSource).toContain(
      "md:grid-cols-[5.5rem_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.4fr)]",
    );
    expect(detailPageSource).toContain(
      "formatObservationPreview(entry.detail)",
    );
    expect(
      detailPageSource.match(/formatObservationPreview\(entry.detail\)/g)
        ?.length,
    ).toBe(2);
    expect(detailPageSource).toContain("group-open:hidden");
    expect(detailPageSource).toContain("启动充电");
    expect(detailPageSource).toContain(
      'const [idTag, setIdTag] = useState("");',
    );
    expect(detailPageSource).not.toContain(
      'const [idTag, setIdTag] = useState("CARD001");',
    );
    expect(detailPageSource).toContain("停止充电");
    expect(detailPageSource).toContain("ArrowRightIcon");
    expect(detailPageSource).toContain("ArrowLeftIcon");
    expect(detailPageSource).toContain(
      'direction === "received" ? ArrowLeftIcon : ArrowRightIcon',
    );
    expect(detailPageSource).toContain(
      "md:grid-cols-[5.5rem_4rem_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.6fr)]",
    );
    expect(detailPageSource).not.toContain(
      '<span className="truncate text-muted-foreground">{entry.summary}</span>',
    );
    expect(detailPageSource).toContain("ProtocolDirectionBadge");
    expect(detailPageSource).toContain('"w-fit bg-transparent"');
    expect(detailPageSource).toContain('variant="outline"');
    expect(detailPageSource).toContain("border-sky-500 text-sky-700");
    expect(detailPageSource).toContain("border-emerald-500 text-emerald-700");
    expect(detailPageSource).not.toContain("fetch(");
    expect(detailHeaderModelSource).toContain("状态未知");
    expect(detailHeaderModelSource).toContain("暂不可启动");
    expect(detailHeaderModelSource).toContain("Boot 待接受");
    expect(detailHeaderModelSource).not.toContain("staticDetails");
    expect(connectorCardsModelSource).toContain("buildConnectorCardModels");
    expect(connectorCardsModelSource).not.toContain("statusBadge");
    expect(connectorCardsModelSource).toContain("toConnectorStatusField");
    expect(connectorCardsModelSource).toContain("未插枪");
    expect(connectorCardsModelSource).toContain("已插枪");
    expect(connectorCardsModelSource).not.toContain("插枪状态");
    expect(connectorCardsModelSource).toContain("toConnectorAvailability");
    expect(connectorCardsModelSource).toContain("可用性");
    expect(connectorCardsModelSource).not.toContain("最近表值");
    expect(connectorCardsModelSource).toContain("formatConnectorType");
    expect(connectorCardsModelSource).toContain("formatConnectorFormat");
    expect(connectorCardsModelSource).toContain("formatConnectorPowerType");
    expect(connectorDisplayModelSource).toContain("GBT_AC");
    expect(connectorDisplayModelSource).toContain("国标交流");
    expect(connectorDisplayModelSource).toContain("IEC_62196_T2_COMBO");
    expect(connectorDisplayModelSource).toContain("欧标直流 CCS2");
    expect(connectorDisplayModelSource).toContain("SAE_J3400");
    expect(connectorDisplayModelSource).toContain("北美 NACS");
    expect(connectorDisplayModelSource).toContain("插座型");
    expect(connectorDisplayModelSource).toContain("线缆型");
    expect(connectorDisplayModelSource).toContain("交流");
    expect(connectorDisplayModelSource).toContain("直流");
    expect(connectorDisplayModelSource).toContain("未知形态");
    expect(connectorDisplayModelSource).toContain("未知供电");
    expect(connectorCardsModelSource).toContain("startCharging");
    expect(connectorCardsModelSource).not.toContain("authorize");
    expect(formFieldsSource).toContain("协议版本");
    expect(formFieldsSource).toContain("SelectTrigger");
    expect(formFieldsSource).toContain("SelectItem");
    expect(formFieldsSource).toContain("OCPP 1.6J");
    expect(formFieldsSource).not.toContain(
      'type="hidden" {...form.register("protocol")}',
    );
    expect(formFieldsSource).toContain("configurationLocked");
    expect(formFieldsSource).not.toContain("Textarea");
    expect(formFieldsSource).toContain("CSMS 地址");
    expect(storeSource).not.toContain("selectedIds");
    expect(storeSource).not.toContain("setSelectedIds");
    expect(storeSource).toContain("pageSize");
    expect(storeSource).toContain("setPageSize");
    expect(storeSource).toContain("removeDeletedId");
    expect(dataTableSource).toContain("useReactTable");
    expect(dataTableSource).toContain("getCoreRowModel");
    expect(dataTableSource).toContain("flexRender");
    expect(dataTableSource).toContain("@/components/ui/table");
    expect(dataTableSource).toContain("rounded-md border");
    expect(dataTableSource).toContain("已选择");
    expect(dataTableSource).toContain("上一页");
    expect(dataTableSource).toContain("下一页");
    expect(createDialogSource).not.toContain("protocolSelectOpen");
    expect(createDialogSource).not.toContain("closeProtocolSelectBeforeDialog");
    expect(createDialogSource).not.toContain("setProtocolSelectOpen");
    expect(createDialogSource).not.toContain("onProtocolSelectOpenChange");
    expect(createDialogSource).not.toContain("modal={false}");
    expect(editDialogSource).not.toContain("protocolSelectOpen");
    expect(editDialogSource).not.toContain("closeProtocolSelectBeforeDialog");
    expect(editDialogSource).toContain("configurationLockedReason");
    expect(editDialogSource).toContain("onSaved");
    expect(editDialogSource).not.toContain("setProtocolSelectOpen");
    expect(editDialogSource).not.toContain("onProtocolSelectOpenChange");
    expect(editDialogSource).not.toContain("modal={false}");
    expect(formFieldsSource).not.toContain("protocolSelectOpen");
    expect(formFieldsSource).not.toContain("onProtocolSelectOpenChange");
    expect(apiSource).toContain("@spark-bee/contracts");
    expect(apiSource).toContain("fetch(");
    expect(apiSource).toContain("pageSize");
    expect(apiSource).toContain("createChargingPoint");
    expect(apiSource).toContain("updateChargingPoint");
    expect(apiSource).toContain("deleteChargingPoint");
    expect(apiSource).toContain("getChargingPoint");
    expect(apiSource).toContain("getChargingPointRuntimeStatus");
    expect(apiSource).toContain("getChargingPointRuntimeSnapshot");
    expect(apiSource).toContain("startChargingPoint");
    expect(apiSource).toContain("stopChargingPoint");
    expect(apiSource).toContain("plugConnector");
    expect(apiSource).toContain("unplugConnector");
    expect(apiSource).toContain("authorizeConnector");
    expect(apiSource).toContain("startConnectorTransaction");
    expect(apiSource).toContain("authorizeAndStartConnectorTransaction");
    expect(apiSource).toContain("stopConnectorTransaction");
    expect(apiSource).toContain("listConnectors");
    expect(apiSource).toContain("createConnector");
    expect(apiSource).toContain("updateConnector");
    expect(apiSource).toContain("deleteConnector");
    expect(apiSource).toContain("POST");
    expect(apiSource).toContain("PATCH");
    expect(apiSource).toContain("DELETE");
    expect(querySource).toContain("queryOptions");
    expect(querySource).toContain("chargingPointDetailQueryOptions");
    expect(querySource).toContain("chargingPointRuntimeStatusQueryOptions");
    expect(querySource).toContain("chargingPointRuntimeSnapshotQueryOptions");
    expect(formSource).toContain("z.object");
    expect(createFormSource).toContain("createChargingPointRequestSchema");
  });

  test("dialog select content clicks are not treated as outside dialog clicks", () => {
    const dialogSource = readSource("components", "ui", "dialog.tsx");
    const formFieldsSource = readSource(
      "features",
      "charging-points",
      "ui",
      "ChargingPointFormFields.tsx",
    );
    const connectorFormFieldsSource = readSource(
      "features",
      "charging-points",
      "ui",
      "ChargingPointConnectorFormFields.tsx",
    );

    expect(dialogSource).toContain("isClickInsideSelectContent");
    expect(dialogSource).toContain("CustomEvent");
    expect(dialogSource).toContain("originalEvent?: Event");
    expect(dialogSource).toContain(".detail");
    expect(dialogSource).toContain("?.originalEvent");
    expect(dialogSource).toContain("onPointerDownOutside");
    expect(dialogSource).toContain("onInteractOutside");
    expect(dialogSource).toContain("[data-dialog-select-content]");

    expect(formFieldsSource).toContain("data-dialog-select-content");
    expect(formFieldsSource).not.toContain("说明");
    expect(formFieldsSource).not.toContain("Textarea");
    expect(formFieldsSource).toContain('position="popper"');
    expect(formFieldsSource).toContain('className="z-[100]"');
    expect(connectorFormFieldsSource).toContain("data-dialog-select-content");
    expect(connectorFormFieldsSource).toContain('position="popper"');
    expect(connectorFormFieldsSource).toContain('className="z-[100]"');
  });

  test("router uses code-defined routes and shared ui stays outside features", () => {
    const routerSource = readSource("app", "router.tsx");

    expect(routerSource).toContain("createRootRoute");
    expect(routerSource).toContain("/charging-points");
    expect(routerSource).toContain(
      "features/charging-points/routes/ChargingPointsRoute",
    );
    expect(existsSync(join(srcRoot, "components", "ui", "button.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(srcRoot, "components", "ui", "badge.tsx"))).toBe(
      true,
    );
    expect(
      existsSync(join(srcRoot, "components", "ui", "alert-dialog.tsx")),
    ).toBe(true);
    expect(existsSync(join(srcRoot, "components", "ui", "dialog.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(srcRoot, "components", "ui", "sonner.tsx"))).toBe(
      true,
    );
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
    expect(
      existsSync(join(srcRoot, "components", "data-table", "DataTable.tsx")),
    ).toBe(true);
  });
});
