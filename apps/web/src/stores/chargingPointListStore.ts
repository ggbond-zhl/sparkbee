import { create } from "zustand";

interface ChargingPointListState {
  keyword: string;
  selectedId: string | null;
  setKeyword(keyword: string): void;
  selectChargingPoint(id: string | null): void;
}

export const useChargingPointListStore = create<ChargingPointListState>((set) => ({
  keyword: "",
  selectedId: null,
  setKeyword: (keyword) => set({ keyword }),
  selectChargingPoint: (selectedId) => set({ selectedId }),
}));
