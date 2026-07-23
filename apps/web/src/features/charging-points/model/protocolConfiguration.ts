import type { ProtocolConfigurationItem } from "@spark-bee/contracts";

export type ProtocolConfigurationFilter =
  | "all"
  | "writable"
  | "readonly"
  | "pending-restart";

export function filterProtocolConfigurationItems(
  items: ProtocolConfigurationItem[],
  keyword: string,
  filter: ProtocolConfigurationFilter,
): ProtocolConfigurationItem[] {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const matchesKeyword = normalizedKeyword.length === 0 ||
      item.key.toLocaleLowerCase().includes(normalizedKeyword) ||
      item.description.toLocaleLowerCase().includes(normalizedKeyword);
    if (!matchesKeyword) return false;

    switch (filter) {
      case "writable":
        return !item.readonly;
      case "readonly":
        return item.readonly;
      case "pending-restart":
        return item.pendingRestart;
      case "all":
        return true;
    }
  });
}
