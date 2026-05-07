/**
 * useBlockViewMode Hook
 *
 * Persists the Blocks-tab view mode (physical layout vs virtual-only)
 * to localStorage so the user's preference survives page navigation.
 */

import { useState } from 'react';

export type BlockViewMode = 'physical' | 'virtual';

const STORAGE_KEY = 'farm-detail-blocks-view';

function readStoredMode(): BlockViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'virtual' || stored === 'physical') {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return 'physical';
}

/**
 * Returns the current view mode and a setter that also persists to localStorage.
 *
 * @example
 * const [mode, setMode] = useBlockViewMode();
 */
export function useBlockViewMode(): [BlockViewMode, (mode: BlockViewMode) => void] {
  const [mode, setModeState] = useState<BlockViewMode>(readStoredMode);

  const setMode = (newMode: BlockViewMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // Ignore storage errors
    }
    setModeState(newMode);
  };

  return [mode, setMode];
}
