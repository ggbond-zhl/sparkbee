import { create } from "zustand";
import type { PageSize } from "@spark-bee/contracts";

interface ChargingPointListState {
  keyword: string;
  page: number;
  pageSize: PageSize;
  selectedId: string | null;
  setKeyword(keyword: string): void;
  setPage(page: number): void;
  setPageSize(pageSize: PageSize): void;
  selectChargingPoint(id: string | null): void;
  removeDeletedId(id: string): void;
}

export const useChargingPointListStore = create<ChargingPointListState>(
  (set) => ({
    keyword: "",
    page: 1,
    pageSize: 20,
    selectedId: null,
    setKeyword: (keyword) => set({ keyword, page: 1 }),
    setPage: (page) => set({ page }),
    setPageSize: (pageSize) => set({ pageSize, page: 1 }),
    selectChargingPoint: (selectedId) => set({ selectedId }),
    removeDeletedId: (id) =>
      set((state) => ({
        selectedId: state.selectedId === id ? null : state.selectedId,
      })),
  }),
);
