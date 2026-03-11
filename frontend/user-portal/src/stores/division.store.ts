import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../services/api';
import { queryClient } from '../config/react-query.config';

export interface Division {
  divisionId: string;
  organizationId: string;
  name: string;
  divisionCode: string;
  industryType: 'vegetable_fruits' | 'mushroom';
  description?: string;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DivisionState {
  currentDivision: Division | null;
  availableDivisions: Division[];
  isLoading: boolean;
  error: string | null;

  loadDivisions: () => Promise<void>;
  setCurrentDivision: (division: Division) => Promise<void>;
  switchDivision: (division: Division) => Promise<void>;
  clearDivisionState: () => void;
}

export const useDivisionStore = create<DivisionState>()(
  persist(
    (set, get) => ({
      currentDivision: null,
      availableDivisions: [],
      isLoading: false,
      error: null,

      loadDivisions: async () => {
        const { isLoading } = get();
        if (isLoading) return;

        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.get<Division[]>('/v1/divisions/my-divisions');
          set({
            availableDivisions: response.data,
            isLoading: false,
            error: null,
          });
        } catch (error: unknown) {
          const message =
            (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            'Failed to load divisions. Please try again.';
          set({
            isLoading: false,
            error: typeof message === 'string' ? message : 'Failed to load divisions.',
          });
        }
      },

      setCurrentDivision: async (division: Division) => {
        set({ isLoading: true, error: null });
        try {
          await apiClient.post(`/v1/divisions/${division.divisionId}/select`);
          set({
            currentDivision: division,
            isLoading: false,
            error: null,
          });
        } catch (error: unknown) {
          const message =
            (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            'Failed to select division. Please try again.';
          set({
            isLoading: false,
            error: typeof message === 'string' ? message : 'Failed to select division.',
          });
          throw error;
        }
      },

      switchDivision: async (division: Division) => {
        await get().setCurrentDivision(division);
        // Invalidate ALL React Query caches when switching divisions so stale
        // division-scoped data from the previous division is not displayed.
        queryClient.clear();
      },

      clearDivisionState: () => {
        set({
          currentDivision: null,
          availableDivisions: [],
          isLoading: false,
          error: null,
        });
      },
    }),
    {
      name: 'division-storage',
      // Only persist the current division selection — the list is re-fetched on mount.
      partialize: (state) => ({
        currentDivision: state.currentDivision,
      }),
    }
  )
);
