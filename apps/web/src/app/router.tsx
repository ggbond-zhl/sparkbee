import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import { RootRoute } from "@/app/routes/RootRoute";
import { ChargingPointsRoute } from "@/features/charging-points/routes/ChargingPointsRoute";

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

const routeTree = rootRoute.addChildren([indexRoute, chargingPointsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
