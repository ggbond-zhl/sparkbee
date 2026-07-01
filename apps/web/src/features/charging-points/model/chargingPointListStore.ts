import { create } from "zustand";

interface ChargingPointListState {
  keyword: string;
  selectedId: string | null;
  selectedIds: string[];
  setKeyword(keyword: string): void;
  selectChargingPoint(id: string | null): void;
  toggleSelectedId(id: string): void;
  toggleAllVisible(ids: string[]): void;
  removeDeletedId(id: string): void;
}

export const useChargingPointListStore = create<ChargingPointListState>((set) => ({
  keyword: "",
  selectedId: null,
  selectedIds: [],
  setKeyword: (keyword) => set({ keyword }),
  selectChargingPoint: (selectedId) => set({ selectedId }),
  toggleSelectedId: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id],
    })),
  toggleAllVisible: (ids) =>
    set((state) => {
      const visibleIds = new Set(ids);
      const allVisibleSelected =
        ids.length > 0 && ids.every((id) => state.selectedIds.includes(id));
      const remainingIds = state.selectedIds.filter((id) => !visibleIds.has(id));

      return {
        selectedIds: allVisibleSelected ? remainingIds : [...remainingIds, ...ids],
      };
    }),
  removeDeletedId: (id) =>
    set((state) => ({
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
    })),
}));
