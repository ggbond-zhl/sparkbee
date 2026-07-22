const appName = "SparkBee";
const chargingPointDetailPathPattern = /^\/charging-points\/[^/]+$/;

export const appMenuItems = [
  { label: "充电桩列表", to: "/charging-points" },
] as const;

export function getMenuItemForPath(pathname: string) {
  return appMenuItems.find((item) => item.to === pathname) ?? null;
}

export function getPageTitleForPath(pathname: string) {
  const menuItem = getMenuItemForPath(pathname);

  if (menuItem) {
    return menuItem.label;
  }

  if (chargingPointDetailPathPattern.test(pathname)) {
    return "运行调试台";
  }

  return null;
}

export function getDocumentTitleForPath(pathname: string) {
  const pageTitle = getPageTitleForPath(pathname);

  return pageTitle ? `${pageTitle} - ${appName}` : null;
}
