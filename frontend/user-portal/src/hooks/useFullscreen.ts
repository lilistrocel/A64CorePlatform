/**
 * Fullscreen Toggle Hook
 *
 * Manual fullscreen toggle for `document.documentElement`. There is
 * deliberately no auto-fullscreen-on-load path here: the Fullscreen API
 * requires a live user-activation gesture (click/tap/keypress) in every
 * modern browser. Calling `requestFullscreen()` outside that activation
 * window throws `TypeError: Permissions check failed` — verified live before
 * this hook was written. Genuine gesture-free fullscreen on load is only
 * achievable via the PWA manifest's `"display": "fullscreen"` when the app
 * is installed (see `public/manifest.webmanifest`).
 *
 * Handles the two details that are easy to get wrong:
 * - `isFullscreen` is derived from `document.fullscreenElement` via the
 *   `fullscreenchange` event, not local state set by the toggle function.
 *   The user can exit with Esc or F11 without touching the toggle button; a
 *   manually-tracked boolean would desync from reality the moment that
 *   happens.
 * - Safari (desktop and, historically, iOS) only exposes the
 *   `webkit`-prefixed API. Prefixes are feature-detected, never UA-sniffed.
 *   iOS Safari on iPhone does not support the Fullscreen API at all, which
 *   `isSupported` reflects so callers can hide the control cleanly.
 */

import { useCallback, useEffect, useState } from 'react';

/** Legacy `webkit`-prefixed Fullscreen API surface (Safari). */
interface WebkitFullscreenDocument {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  webkitFullscreenEnabled?: boolean;
}

interface WebkitFullscreenElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

export interface UseFullscreenResult {
  /** True when the document is currently in fullscreen, kept in sync with
   * the browser's own state (Esc/F11 exits included), not just this hook's
   * own toggle calls. */
  isFullscreen: boolean;
  /** Requests fullscreen if not active, exits if active. Swallows any
   * rejection (e.g. missing user activation, browser denial) — there is
   * nothing actionable to surface to the user for a failed toggle. */
  toggle: () => void;
  /** False when neither the standard nor the webkit-prefixed Fullscreen API
   * is available (e.g. iOS Safari on iPhone) — render nothing rather than a
   * control that silently does nothing. */
  isSupported: boolean;
}

function getFullscreenElement(): Element | null {
  const webkitDoc = document as unknown as WebkitFullscreenDocument;
  return document.fullscreenElement ?? webkitDoc.webkitFullscreenElement ?? null;
}

export function useFullscreen(): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => getFullscreenElement() !== null);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(getFullscreenElement() !== null);
    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, []);

  const toggle = useCallback(() => {
    if (getFullscreenElement()) {
      const webkitDoc = document as unknown as WebkitFullscreenDocument;
      const exit = document.exitFullscreen
        ? document.exitFullscreen.bind(document)
        : webkitDoc.webkitExitFullscreen?.bind(webkitDoc);
      exit?.()?.catch(() => {
        // Fail quietly — nothing useful to surface for a declined exit.
      });
    } else {
      const el = document.documentElement as HTMLElement & WebkitFullscreenElement;
      const request = el.requestFullscreen
        ? el.requestFullscreen.bind(el)
        : el.webkitRequestFullscreen?.bind(el);
      request?.()?.catch(() => {
        // Fail quietly — e.g. no transient user activation, or the browser
        // denied the request.
      });
    }
  }, []);

  const isSupported =
    typeof document !== 'undefined' &&
    Boolean(document.fullscreenEnabled || (document as unknown as WebkitFullscreenDocument).webkitFullscreenEnabled);

  return { isFullscreen, toggle, isSupported };
}
