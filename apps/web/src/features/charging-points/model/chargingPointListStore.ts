import { create } from "zustand";

interface ChargingPointListState {
  keyword: string;
  selectedId: string | null;
  selectedIds: string[];
  setKeyword(keyword: string): void;
  selectChargingPoint(id: string | null): void;
  setSelectedIds(ids: string[]): void;
  removeDeletedId(id: string): void;
}

export const useChargingPointListStore = create<ChargingPointListState>((set) => ({
  keyword: "",
  selectedId: null,
  selectedIds: [],
  setKeyword: (keyword) => set({ keyword }),
  selectChargingPoint: (selectedId) => set({ selectedId }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  removeDeletedId: (id) =>
    set((state) => ({
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
    })),
}));
