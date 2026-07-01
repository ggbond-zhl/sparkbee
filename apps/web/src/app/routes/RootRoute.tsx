import { Outlet } from "@tanstack/react-router";

import { AppShell } from "@/app/ui/AppShell";

export function RootRoute() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
