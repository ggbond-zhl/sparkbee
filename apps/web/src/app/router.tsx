import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import { RootRoute } from "@/app/routes/RootRoute";
import { ChargingPointDetailRoute } from "@/features/charging-points/routes/ChargingPointDetailRoute";
import { ChargingPointsRoute } from "@/features/charging-points/routes/ChargingPointsRoute";
import { ChargingPointConfigurationRoute } from "@/features/charging-points/routes/ChargingPointConfigurationRoute";

const rootRoute = createRootRoute({
  component: RootRoute,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/charging-points" });
  },
});

const chargingPointsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/charging-points",
  component: ChargingPointsRoute,
});

const chargingPointDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/charging-points/$chargingPointId",
  component: ChargingPointDetailRoute,
});

const chargingPointConfigurationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/charging-points/$chargingPointId/configuration",
  component: ChargingPointConfigurationRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  chargingPointsRoute,
  chargingPointDetailRoute,
  chargingPointConfigurationRoute,
]);

export const router = createRouter({ routeTree, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
