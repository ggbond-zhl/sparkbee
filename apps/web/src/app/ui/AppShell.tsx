import type { PropsWithChildren } from "react";

import { AppSidebar } from "@/app/ui/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <TooltipProvider>
      <SidebarProvider open onOpenChange={() => undefined}>
        <AppSidebar />
        <SidebarInset>
          <header className="hidden h-12 shrink-0 items-center justify-center border-b px-2 md:flex">
            <span>充电桩列表</span>
          </header>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden">
            <SidebarTrigger />
            <img
              src="/logo.svg"
              alt="logo"
              className="size-7 rounded-sm object-contain"
            />
            <span>SparkBee</span>
          </header>
          <main className="flex w-full flex-1 flex-col p-4">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
