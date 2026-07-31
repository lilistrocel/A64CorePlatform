import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

// Night Observatory redesign (Docs/2-Working-Progress/night-observatory-spec.md
// §0): "Dark is the only mode." This is deliberate and reversible — the
// light theme is kept as dead code in theme.ts for a possible future light
// variant, but for now the mode is hard-forced to 'dark' and the switching
// actions are no-ops. `toggleTheme`/`setTheme` are kept (rather than
// removed) purely so their ~7 existing call sites keep compiling; the UI
// control that calls `toggleTheme` (MainLayout's ThemeToggleSmall) has been
// hidden, not deleted, so re-enabling this later is a small, contained
// change: bring back `persist` + getSystemPreference() + real set() bodies,
// and un-hide the toggle button.
//
// NOTE: deliberately NOT wrapped in zustand's `persist` middleware anymore.
// The previous version persisted `mode` to localStorage under
// 'theme-storage'; persist's default `merge` strategy layers the
// rehydrated value on top of this store's initial state, so a browser with
// a stale `{"mode":"light"}` from before this redesign would silently
// un-force dark mode on load. Since mode is now a constant, persisting it
// serves no purpose and only reintroduces that bug — so persistence is
// dropped rather than patched around.
export const useThemeStore = create<ThemeState>(() => ({
  mode: 'dark',

  toggleTheme: () => {
    // no-op — dark is the only mode (see module comment above)
  },
  setTheme: () => {
    // no-op — dark is the only mode (see module comment above)
  },
}));
