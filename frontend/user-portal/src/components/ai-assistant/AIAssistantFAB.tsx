/**
 * AIAssistantFAB (Floating Action Button)
 *
 * Fixed-positioned chat bubble in the bottom-right corner.
 * - z-index 895 — above normal content, below modals (1000+)
 * - Visible for ALL authenticated users
 * - Hidden for unauthenticated users
 * - Shows an unread indicator dot when a streaming message finishes
 *   while the panel is closed (future enhancement — basic dot for now)
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

const pulse = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.4); }
  70%  { box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); }
  100% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
`;

const FAB = styled.button<{ $isOpen: boolean }>`
  position: fixed;
  bottom: 88px; /* Sits above the back-to-top button (bottom: 32px + height 44px + gap) */
  right: 28px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  z-index: 895;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${({ theme }) => theme.shadows.lg};
  transition: transform 200ms ease, background 150ms ease;

  background: ${({ $isOpen, theme }) =>
    $isOpen ? theme.colors.accent.sageDeep : theme.colors.accent.sage};
  color: white;

  /* Rotate icon slightly when panel is open for visual feedback */
  svg {
    transition: transform 200ms ease;
    transform: ${({ $isOpen }) => ($isOpen ? 'rotate(15deg)' : 'rotate(0)')};
  }

  &:hover {
    transform: scale(1.08);
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }

  &:active {
    transform: scale(0.96);
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 3px;
  }

  /* Subtle pulse animation when panel is closed to draw attention */
  ${({ $isOpen }) =>
    !$isOpen &&
    css`
      animation: ${pulse} 3s ease-out infinite;
    `}

  @media (max-width: 640px) {
    bottom: 24px;
    right: 16px;
    width: 48px;
    height: 48px;
  }
`;
