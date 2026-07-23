import { Link, useRouterState } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";
import { ArrowLeftIcon } from "lucide-react";

import { getPageTitleForPath } from "@/app/navigation";
import { AppSidebar } from "@/app/ui/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell({ children }: PropsWithChildren) {
  const { currentPageTitle, pathname } = useRouterState({
    select: (state) => ({
      currentPageTitle: getPageTitleForPath(state.location.pathname),
      pathname: state.location.pathname,
    }),
  });
  const isChargingPointDetail = /^\/charging-points\/[^/]+$/.test(pathname);
  const configurationMatch = pathname.match(
    /^\/charging-points\/([^/]+)\/configuration$/,
  );

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-background px-2">
            {configurationMatch ? (
              <Link
                to="/charging-points/$chargingPointId"
                params={{ chargingPointId: configurationMatch[1]! }}
                aria-label="返回运行调试台"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <ArrowLeftIcon className="size-5" />
              </Link>
            ) : isChargingPointDetail ? (
              <Link
                to="/charging-points"
                aria-label="返回桩实例列表"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <ArrowLeftIcon className="size-5" />
              </Link>
            ) : null}
            <span className="font-medium">{currentPageTitle ?? "SparkBee"}</span>
            <div className="ml-auto flex items-center gap-2 md:hidden">
              <img
                src="/logo.svg"
                alt="logo"
                className="size-7 rounded-sm object-contain"
              />
              <span>SparkBee</span>
              <SidebarTrigger />
            </div>
          </header>
          <main className="flex w-full flex-1 flex-col p-4">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
