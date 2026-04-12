import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

/**
 * Detect the OS/browser preferred color scheme.
 * Returns 'dark' if the user prefers dark mode, 'light' otherwise.
 */
function getSystemPreference(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  // Default to dark mode when system preference is unavailable
  return 'dark';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // Default: use system preference (falls back to dark if unavailable)
      mode: getSystemPreference(),

      toggleTheme: () =>
        set((state) => ({ mode: state.mode === 'light' ? 'dark' : 'light' })),

      setTheme: (mode) => set({ mode }),
    }),
    {
      name: 'theme-storage',
      // Only persist the mode — actions are not serializable
      partialize: (state) => ({ mode: state.mode }),
    }
  )
);
