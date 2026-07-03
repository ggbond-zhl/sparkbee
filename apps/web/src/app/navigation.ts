const appName = "SparkBee";

export const appMenuItems = [
  { label: "充电桩列表", to: "/charging-points" },
] as const;

export function getMenuItemForPath(pathname: string) {
  return appMenuItems.find((item) => item.to === pathname) ?? null;
}

export function getDocumentTitleForPath(pathname: string) {
  const menuItem = getMenuItemForPath(pathname);

  return menuItem ? `${menuItem.label} - ${appName}` : null;
}
