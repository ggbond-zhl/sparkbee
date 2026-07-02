import { create } from "zustand";
import type { PageSize } from "@spark-bee/contracts";

interface ChargingPointListState {
  keyword: string;
  page: number;
  pageSize: PageSize;
  selectedId: string | null;
  selectedIds: string[];
  setKeyword(keyword: string): void;
  setPage(page: number): void;
  setPageSize(pageSize: PageSize): void;
  selectChargingPoint(id: string | null): void;
  setSelectedIds(ids: string[]): void;
  removeDeletedId(id: string): void;
}

export const useChargingPointListStore = create<ChargingPointListState>((set) => ({
  keyword: "",
  page: 1,
  pageSize: 20,
  selectedId: null,
  selectedIds: [],
  setKeyword: (keyword) => set({ keyword, page: 1, selectedIds: [] }),
  setPage: (page) => set({ page, selectedIds: [] }),
  setPageSize: (pageSize) => set({ pageSize, page: 1, selectedIds: [] }),
  selectChargingPoint: (selectedId) => set({ selectedId }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  removeDeletedId: (id) =>
    set((state) => ({
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
    })),
}));
