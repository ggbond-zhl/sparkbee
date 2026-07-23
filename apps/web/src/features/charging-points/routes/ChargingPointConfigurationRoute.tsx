import { lazy, Suspense } from "react";

const ChargingPointConfigurationPage = lazy(() =>
  import("@/features/charging-points/ui/ChargingPointConfigurationPage").then(
    (module) => ({ default: module.ChargingPointConfigurationPage }),
  )
);

export function ChargingPointConfigurationRoute() {
  return (
    <Suspense fallback={
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        协议配置加载中
      </div>
    }>
      <ChargingPointConfigurationPage />
    </Suspense>
  );
}
