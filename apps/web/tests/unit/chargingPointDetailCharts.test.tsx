// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const chargingPointId = "00000000-0000-4000-8000-000000000001";
const chargingPoint = {
  id: chargingPointId,
  name: "曲线提示测试桩",
  description: null,
  identity: "CHART_TOOLTIP_CP",
  protocol: "OCPP16J",
  centralSystemUrl: "ws://localhost:9000/ocpp",
  vendor: "SparkBee",
  model: "DebugBox",
  firmwareVersion: null,
  serialNumber: null,
  connectors: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      chargingPointId,
      evseId: 1,
      connectorId: 1,
      type: "IEC_62196_T2",
      format: "socket",
      powerType: "ac",
      maxVoltage: 230,
      maxCurrent: 32,
      maxPower: null,
      sortOrder: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  window.history.replaceState({}, "", `/charging-points/${chargingPointId}`);
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.stubGlobal(
    "EventSource",
    class {
      onerror = null;
      addEventListener() {}
      removeEventListener() {}
      close() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      disconnect() {}
      unobserve() {}
      observe(target: Element) {
        this.callback(
          [{
            target,
            contentRect: {
              width: 600,
              height: 160,
            },
          } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 160,
    height: 160,
    left: 0,
    right: 600,
    top: 0,
    width: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/active-transaction-samples")) {
        return jsonResponse({
          items: [{
            transactionId: "transaction-1",
            evseId: 1,
            connectorId: 1,
            samples: [
              {
                id: "sample-1",
                sampledAt: "2026-07-21T06:00:00.000Z",
                meterWh: 1_250,
                powerW: 3_680,
                currentA: 16,
                voltageV: 230,
              },
              {
                id: "sample-2",
                sampledAt: "2026-07-21T06:01:00.000Z",
                meterWh: 1_500,
                powerW: 7_360,
                currentA: 32,
                voltageV: 230,
              },
            ],
          }],
        });
      }
      if (url.pathname.endsWith("/protocol-messages") ||
          url.pathname.endsWith("/protocol-events")) {
        return jsonResponse({ items: [], previousCursor: null });
      }
      if (url.pathname.endsWith("/status")) {
        return jsonResponse({
          chargingPointId,
          status: "running",
          bootStatus: "Accepted",
        });
      }
      if (url.pathname === `/api/charging-points/${chargingPointId}`) {
        return jsonResponse(chargingPoint);
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
});

afterEach(async () => {
  cleanup();
  const { queryClient } = await import("@/app/queryClient");
  queryClient.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("鼠标移入充电曲线时显示采样时间、数值和单位", async () => {
  const [{ App }, { router }] = await Promise.all([
    import("@/App"),
    import("@/app/router"),
  ]);
  await router.load();
  render(<App />);

  expect(await screen.findByText("功率 / 电流 / 电压曲线")).toBeTruthy();
  const charts = await waitFor(() => {
    const items = document.querySelectorAll<HTMLElement>(".recharts-wrapper");
    expect(items).toHaveLength(4);
    return items;
  });

  fireEvent.mouseMove(charts[0]!, { clientX: 80, clientY: 80 });
  const powerTooltip = await waitFor(() => {
    const tooltip = [...document.querySelectorAll<HTMLElement>(
      ".recharts-tooltip-wrapper",
    )].find((item) => item.textContent?.includes("3.68 kW"));
    expect(tooltip).toBeDefined();
    return tooltip!;
  });
  expect(powerTooltip.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);

  fireEvent.mouseMove(charts[3]!, { clientX: 80, clientY: 80 });
  const energyTooltip = await waitFor(() => {
    const tooltip = [...document.querySelectorAll<HTMLElement>(
      ".recharts-tooltip-wrapper",
    )].find((item) => item.textContent?.includes("1.25 kWh"));
    expect(tooltip).toBeDefined();
    return tooltip!;
  });
  expect(energyTooltip.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
});
