// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const chargingPoint = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "主站测试桩",
  description: "地下车库入口",
  identity: "SPARKBEE_001",
  protocol: "OCPP16J",
  centralSystemUrl: "ws://localhost:9000/ocpp",
  vendor: "SparkBee",
  model: "Simulator",
  firmwareVersion: null,
  serialNumber: null,
  connectorCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width") && width < 768,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/charging-points");
  setViewportWidth(1280);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [chargingPoint],
            page: 1,
            pageSize: 20,
            total: 1,
          }),
          { status: 200 },
        ),
      ),
  );
});

afterEach(async () => {
  cleanup();
  const { queryClient } = await import("@/app/queryClient");
  queryClient.clear();
  vi.unstubAllGlobals();
});

test("用户通过统一 Card 查看充电桩并从 Footer 执行单项操作", async () => {
  const [{ App }, { router }] = await Promise.all([
    import("@/App"),
    import("@/app/router"),
  ]);
  await router.load();

  render(<App />);

  expect(await screen.findByText("主站测试桩")).toBeTruthy();
  expect(screen.getByText("地下车库入口")).toBeTruthy();
  expect(screen.getByText("SPARKBEE_001")).toBeTruthy();
  expect(screen.getByText("SparkBee / Simulator")).toBeTruthy();
  expect(screen.getByText("2 枪")).toBeTruthy();
  const tooltipTriggers = document.querySelectorAll(
    '[data-slot="tooltip-trigger"]',
  );
  expect(tooltipTriggers).toHaveLength(0);
  expect(
    screen.getByRole("link", { name: /主站测试桩/ }).getAttribute("href"),
  ).toBe("/charging-points/00000000-0000-4000-8000-000000000001");
  expect(screen.getByRole("button", { name: "编辑" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "枪口管理" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "协议配置" }).getAttribute("href"))
    .toBe("/charging-points/00000000-0000-4000-8000-000000000001/configuration");
  expect(screen.getByRole("button", { name: "删除" })).toBeTruthy();
  const searchButton = screen.getByRole("button", { name: "搜索" });
  const createButton = screen.getByRole("button", { name: "新增充电桩" });
  expect(createButton).toBeTruthy();
  expect(searchButton).toBeTruthy();
  const toolbar = searchButton.parentElement;
  expect(toolbar?.contains(createButton)).toBe(true);
  expect(toolbar?.className).not.toContain("max-w");
  expect(createButton.parentElement?.className).toContain("md:ml-auto");
  expect(screen.getByText("第 1 / 1 页，共 1 条")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
});

test("小屏滚动到列表底部时自动追加下一页 Card", async () => {
  setViewportWidth(456);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];

      constructor(private readonly callback: IntersectionObserverCallback) {}

      disconnect() {}
      takeRecords() {
        return [];
      }
      unobserve() {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
    },
  );
  const fetchMock = vi
    .fn()
    .mockImplementation((input: string | URL | Request) => {
      const page = new URL(
        String(input),
        window.location.origin,
      ).searchParams.get("page");
      const item =
        page === "2"
          ? {
              ...chargingPoint,
              id: "00000000-0000-4000-8000-000000000002",
              name: "第二页测试桩",
              identity: "SPARKBEE_002",
            }
          : chargingPoint;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [item],
            page: Number(page),
            pageSize: 20,
            total: 21,
          }),
          { status: 200 },
        ),
      );
    });
  vi.stubGlobal("fetch", fetchMock);
  const [{ App }, { router }] = await Promise.all([
    import("@/App"),
    import("@/app/router"),
  ]);
  await router.load();

  render(<App />);

  expect(await screen.findByText("主站测试桩")).toBeTruthy();
  expect(await screen.findByText("第二页测试桩")).toBeTruthy();
  expect(screen.getByRole("button", { name: "新增充电桩" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "搜索" })).toBeTruthy();
  expect(screen.queryByText(/第 1 \/ 2 页/)).toBeNull();
  expect(
    fetchMock.mock.calls.filter(([input]) => String(input).includes("page=1&")),
  ).toHaveLength(1);
});

test("小屏后续页加载失败时保留现有 Card 并允许重试", async () => {
  setViewportWidth(456);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];

      constructor(private readonly callback: IntersectionObserverCallback) {}

      disconnect() {}
      takeRecords() {
        return [];
      }
      unobserve() {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
    },
  );
  let allowNextPage = false;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string | URL | Request) => {
      const page = new URL(
        String(input),
        window.location.origin,
      ).searchParams.get("page");
      if (page === "2" && !allowNextPage) {
        return Promise.resolve(new Response(null, { status: 500 }));
      }
      const item =
        page === "2"
          ? {
              ...chargingPoint,
              id: "00000000-0000-4000-8000-000000000002",
              name: "重试后加载的桩",
              identity: "SPARKBEE_002",
            }
          : chargingPoint;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [item],
            page: Number(page),
            pageSize: 20,
            total: 21,
          }),
          { status: 200 },
        ),
      );
    }),
  );
  const [{ App }, { router }] = await Promise.all([
    import("@/App"),
    import("@/app/router"),
  ]);
  await router.load();

  render(<App />);

  expect(await screen.findByText("主站测试桩")).toBeTruthy();
  const retryButton = await screen.findByRole(
    "button",
    { name: "重试加载" },
    { timeout: 4_000 },
  );
  expect(screen.getByText("主站测试桩")).toBeTruthy();
  allowNextPage = true;
  fireEvent.click(retryButton);
  expect(await screen.findByText("重试后加载的桩")).toBeTruthy();
});
