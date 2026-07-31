import styled from 'styled-components';

// Night Observatory background sky layer — spec §7.
//
// Source of truth (copied verbatim): `.sky` / `.sky::before` in
// Brand_Engineering/Brand/A20Core_NightObservatory_Glass.html lines 40–64,
// including all 15 starfield dots. Do not add twinkle/parallax animation —
// spec explicitly says stars are static. If they compete with dense
// content, dim the layer's opacity from the call site; don't remove stars.
//
// Render ONCE at the app shell (not per page): `position: fixed; inset: 0;
// z-index: 0; pointer-events: none`. The app shell itself must sit at
// z-index: 1 or higher, and must not paint an opaque background over the
// full viewport, or this layer is invisible — see the Phase 1 report for
// which app-shell containers currently do that.
const SkyLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 70% 55% at 78% -8%, rgba(32, 65, 154, 0.42), transparent 60%),
    radial-gradient(ellipse 45% 40% at 8% 108%, rgba(90, 42, 77, 0.35), transparent 60%),
    radial-gradient(ellipse 30% 25% at 92% 88%, rgba(194, 154, 51, 0.1), transparent 60%),
    linear-gradient(180deg, #0e1330 0%, #0a0e24 100%);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(1.6px 1.6px at 12% 22%, rgba(250, 243, 226, 0.5) 50%, transparent 51%),
      radial-gradient(1px 1px at 28% 8%, rgba(250, 243, 226, 0.35) 50%, transparent 51%),
      radial-gradient(1.4px 1.4px at 45% 30%, rgba(180, 200, 220, 0.45) 50%, transparent 51%),
      radial-gradient(1px 1px at 61% 12%, rgba(250, 243, 226, 0.3) 50%, transparent 51%),
      radial-gradient(1.8px 1.8px at 74% 26%, rgba(220, 185, 79, 0.55) 50%, transparent 51%),
      radial-gradient(1px 1px at 86% 7%, rgba(250, 243, 226, 0.4) 50%, transparent 51%),
      radial-gradient(1.2px 1.2px at 93% 40%, rgba(180, 200, 220, 0.35) 50%, transparent 51%),
      radial-gradient(1px 1px at 18% 55%, rgba(250, 243, 226, 0.25) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 38% 68%, rgba(180, 200, 220, 0.3) 50%, transparent 51%),
      radial-gradient(1px 1px at 55% 82%, rgba(250, 243, 226, 0.28) 50%, transparent 51%),
      radial-gradient(1.4px 1.4px at 70% 60%, rgba(250, 243, 226, 0.32) 50%, transparent 51%),
      radial-gradient(1px 1px at 82% 74%, rgba(220, 185, 79, 0.35) 50%, transparent 51%),
      radial-gradient(1.2px 1.2px at 6% 80%, rgba(180, 200, 220, 0.3) 50%, transparent 51%),
      radial-gradient(1px 1px at 48% 48%, rgba(250, 243, 226, 0.22) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 96% 92%, rgba(250, 243, 226, 0.3) 50%, transparent 51%);
  }
`;

/** Fixed, non-scrolling starfield-and-nebula background. Mount exactly once
 * at the app's always-rendered root (see App.tsx) — never per page. */
export function Sky() {
  return <SkyLayer aria-hidden="true" />;
}
