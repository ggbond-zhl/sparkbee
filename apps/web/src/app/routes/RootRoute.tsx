import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { getDocumentTitleForPath } from "@/app/navigation";
import { AppShell } from "@/app/ui/AppShell";

export function RootRoute() {
  const documentTitle = useRouterState({
    select: (state) => getDocumentTitleForPath(state.location.pathname),
  });

  useEffect(() => {
    if (documentTitle) {
      document.title = documentTitle;
    }
  }, [documentTitle]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
