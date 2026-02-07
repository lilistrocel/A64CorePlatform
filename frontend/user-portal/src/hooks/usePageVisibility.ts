/**
 * Page Visibility Hook
 *
 * Handles mobile app switching and browser tab visibility changes to preserve state.
 * Uses the Page Visibility API and pageshow event for bfcache restoration.
 *
 * Features:
 * - Fires callback when page becomes hidden (user switches apps)
 * - Fires callback when page becomes visible again
 * - Handles Safari iOS aggressive page unloading via pageshow event
 * - Detects bfcache restoration (back/forward cache)
 */

import { useEffect, useCallback, useRef } from 'react';

export interface PageVisibilityCallbacks {
  /** Called when page becomes hidden (user switches away) */
  onHidden?: () => void;
  /** Called when page becomes visible again */
  onVisible?: () => void;
  /** Called when page is restored from bfcache (Safari iOS) */
  onBfcacheRestore?: () => void;
}

/**
 * Hook to handle page visibility changes for mobile app switching
 *
 * @param callbacks - Object containing callback functions for visibility events
 *
 * @example
 * ```tsx
 * usePageVisibility({
 *   onHidden: () => saveStateToSessionStorage(),
 *   onVisible: () => restoreStateFromSessionStorage(),
 *   onBfcacheRestore: () => refreshData(),
 * });
 * ```
 */
export function usePageVisibility(callbacks: PageVisibilityCallbacks) {
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref updated to avoid stale closures
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Handle visibilitychange event
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // Page is now hidden - persist state
      callbacksRef.current.onHidden?.();
    } else {
      // Page is now visible - restore state if needed
      callbacksRef.current.onVisible?.();
    }
  }, []);

  // Handle pageshow event for bfcache restoration (Safari iOS)
  const handlePageShow = useCallback((event: PageTransitionEvent) => {
    // persisted = true means page was restored from bfcache
    if (event.persisted) {
      callbacksRef.current.onBfcacheRestore?.();
    }
  }, []);

  useEffect(() => {
    // Listen for visibility changes (most browsers)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for pageshow event (Safari iOS bfcache)
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [handleVisibilityChange, handlePageShow]);
}

/**
 * Hook to detect if the device is likely a mobile device
 * Useful for showing mobile-specific UI hints
 */
export function useIsMobile(): boolean {
  if (typeof window === 'undefined') return false;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768;
}

/**
 * Hook that returns true if page is currently visible
 */
export function useIsPageVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.hidden;
}
