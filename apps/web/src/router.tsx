import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import { ChargingPointsRoute } from "@/routes/charging-points";
import { RootRoute } from "@/routes/root";

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
