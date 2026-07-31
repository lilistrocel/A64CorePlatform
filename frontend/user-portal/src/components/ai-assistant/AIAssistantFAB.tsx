/**
 * AIAssistantFAB (Floating Action Button)
 *
 * Fixed-positioned chat bubble in the bottom-right corner.
 * - z-index 895 — above normal content, below modals (1000+)
 * - Visible for ALL authenticated users
 * - Hidden for unauthenticated users
 * - Shows an unread indicator dot when a streaming message finishes
 *   while the panel is closed (future enhancement — basic dot for now)
 *
 * Night Observatory (T-901 Phase 2): this is the app's one floating-action
 * affordance, so it takes the spec §4/mockup l.237-241 FAB treatment — 52px
 * gold gradient circle, cosmos icon, gold glow. This is the ONE gold
 * primary-CTA budget item (spec §3); nothing else in the shell should be gold.
 */

import styled, { keyframes, css } from 'styled-components';
import { Bot } from 'lucide-react';
import { useAIAssistantStore } from '../../stores/aiAssistant.store';
import { useAuthStore } from '../../stores/auth.store';

export function AIAssistantFAB() {
  const { isAuthenticated } = useAuthStore();
  const { isPanelOpen, togglePanel } = useAIAssistantStore();

  if (!isAuthenticated) return null;

  return (
    <FAB
      onClick={togglePanel}
      $isOpen={isPanelOpen}
      aria-label={isPanelOpen ? 'Close AI assistant' : 'Open AI assistant'}
      title={isPanelOpen ? 'Close AI assistant' : 'Open AI assistant (Claude)'}
      type="button"
    >
      <Bot size={22} aria-hidden="true" />
    </FAB>
  );
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

// A function returning keyframes, not a module-level constant — keyframes
// can't read theme context directly, so the pulse ring colour (lapis) is
// threaded through at render time via the `css` helper below. Lapis is
// theme-invariant (identical hex in light/dark) so the value is stable.
const pulse = (color: string) => keyframes`
  0%   { box-shadow: 0 0 0 0 ${color}66; }
  70%  { box-shadow: 0 0 0 10px ${color}00; }
  100% { box-shadow: 0 0 0 0 ${color}00; }
`;

const FAB = styled.button<{ $isOpen: boolean }>`
  position: fixed;
  bottom: 88px; /* Sits above the back-to-top button (bottom: 32px + height 44px + gap) */
  right: 28px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid rgba(220, 185, 79, 0.5);
  cursor: pointer;
  z-index: 895;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Gold gradient + cosmos icon + gold glow — spec §4/mockup ".fab" l.237-241.
     This is the ONE primary-CTA gold budget item (spec §3). */
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  box-shadow: 0 10px 30px rgba(4, 6, 18, 0.6), 0 0 24px rgba(220, 185, 79, 0.35);
  transition: transform 200ms ease;

  /* Rotate icon slightly when panel is open for visual feedback */
  svg {
    transition: transform 200ms ease;
    transform: ${({ $isOpen }) => ($isOpen ? 'rotate(15deg)' : 'rotate(0)')};
  }

  &:hover {
    transform: scale(1.07);
  }

  &:active {
    transform: scale(0.96);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 3px;
  }

  /* Subtle pulse animation when panel is closed to draw attention */
  ${({ $isOpen, theme }) =>
    !$isOpen &&
    css`
      animation: ${pulse(theme.colors.secondary[500])} 3s ease-out infinite;
    `}

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    animation: none;

    &:hover {
      transform: none;
    }
  }

  @media (max-width: 640px) {
    /* Sits above the back-to-top button's OWN mobile rule (MainLayout.tsx
       BackToTopButton: bottom: 20px + height 44px, unchanged at this
       breakpoint) plus the same 12px gap the desktop rule above uses —
       20 + 44 + 12 = 76. The previous value here (24px) was carried over
       from a pre-mobile-breakpoint default and never recomputed against
       back-to-top's mobile offset, so at <=640px the two buttons landed
       almost exactly on top of each other (back-to-top's higher z-index
       then hid the FAB completely). Both buttons share this same 640px
       breakpoint, so there is no intermediate window where one has
       switched and the other hasn't. */
    bottom: 76px;
    right: 16px;
    width: 48px;
    height: 48px;
  }
`;
