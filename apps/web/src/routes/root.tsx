import { Link, Outlet } from "@tanstack/react-router";
import { BatteryChargingIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RootRoute() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BatteryChargingIcon data-icon="inline-start" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-none">SparkBee</span>
              <span className="text-xs text-muted-foreground">充电桩调试台</span>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/charging-points">桩实例</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
