import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FarmingYearState {
  selectedYear: number | null;
  setYear: (year: number | null) => void;
  /**
   * Sets the year only when it has not yet been persisted (first load).
   * Subsequent calls are no-ops — the persisted value takes precedence.
   */
  initialize: (currentYear: number) => void;
}

export const useFarmingYearStore = create<FarmingYearState>()(
  persist(
    (set, get) => ({
      selectedYear: null,

      setYear: (year) => set({ selectedYear: year }),

      initialize: (currentYear) => {
        // Only set when the store has never been written to (null = not yet initialized)
        if (get().selectedYear === null) {
          set({ selectedYear: currentYear });
        }
      },
    }),
    {
      name: 'farming-year-storage',
      // Only persist the selected year — actions are not serializable
      partialize: (state) => ({ selectedYear: state.selectedYear }),
    }
  )
);
