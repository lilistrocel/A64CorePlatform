/**
 * AIAssistantPanel
 *
 * The slide-out drawer that contains the full Claude assistant UI.
 * - Anchors right side of viewport, full height, 420px wide on desktop
 * - Slides in/out with CSS transform (200ms ease-out)
 * - Closes via X button, backdrop click, or Escape key
 * - Backdrop is subtle (rgba 0,0,0,0.15) and does NOT block mouse events on
 *   the rest of the page (pointer-events: none on the backdrop overlay)
 * - Dark-mode aware via styled-components theme
 *
 * Mount location: MainLayout.tsx (so it appears on every authenticated page)
 */

import { useEffect, useCallback, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { X, Bot } from 'lucide-react';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { useAIAssistant } from '../../hooks/queries/useAIAssistant';

export function AIAssistantPanel() {
  const {
    isPanelOpen,
    closePanel,
    messages,
    isStreaming,
    sendMessage,
    cancelStreaming,
    draft,
    setDraft,
    conversations,
    conversationsLoading,
    currentConversationId,
    selectConversation,
    startNewConversation,
    deleteConversation,
    isDeletingConversation,
    panelError,
  } = useAIAssistant();

  // Ref to track which conversation is being deleted so we can grey out
  // the correct item while the mutation is in flight
  const deletingIdRef = useRef<string | undefined>(undefined);

  // ── Keyboard handling ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPanelOpen) {
        closePanel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen, closePanel]);

  // ── Send handler ─────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!draft.trim() || isStreaming) return;
    const text = draft;
    setDraft('');
    sendMessage(text);
  }, [draft, isStreaming, sendMessage, setDraft]);

  // ── Quick suggestion ─────────────────────────────────────────────────────
  const handleQuickAction = useCallback(
    (text: string) => {
      if (isStreaming) return;
      sendMessage(text);
    },
    [isStreaming, sendMessage]
  );

  // ── Delete conversation handler ──────────────────────────────────────────
  const handleDelete = useCallback(
    (id: string) => {
      deletingIdRef.current = id;
      deleteConversation(id);
    },
    [deleteConversation]
  );

  return (
    <>
      {/* Backdrop — purely decorative overlay (rgba 0,0,0,0.15). Never intercepts clicks. */}
      <Backdrop $isOpen={isPanelOpen} aria-hidden="true" />

      {/* Panel */}
      <Panel
        $isOpen={isPanelOpen}
        role="dialog"
        aria-modal="false"
        aria-label="AI Assistant"
        aria-hidden={!isPanelOpen}
      >
        {/* Header */}
        <PanelHeader>
          <HeaderLeft>
            <Bot size={18} aria-hidden="true" />
            <HeaderTitle>AI Assistant</HeaderTitle>
            <HeaderBadge>Claude</HeaderBadge>
          </HeaderLeft>
          <CloseButton
            onClick={closePanel}
            aria-label="Close AI assistant panel"
            title="Close (Escape)"
            type="button"
          >
            <X size={18} />
          </CloseButton>
        </PanelHeader>

        {/* Conversation history */}
        <ConversationList
          conversations={conversations}
          currentConversationId={currentConversationId}
          isLoading={conversationsLoading}
          onSelect={selectConversation}
          onDelete={handleDelete}
          onNew={startNewConversation}
          isDeletingId={isDeletingConversation ? deletingIdRef.current : undefined}
        />

        {/* Panel-level error (e.g. auth failed) */}
        {panelError && (
          <PanelError role="alert">{panelError}</PanelError>
        )}

        {/* Messages */}
        <MessageList
          messages={messages}
          onQuickAction={handleQuickAction}
          isStreaming={isStreaming}
        />

        {/* Input */}
        <InputBox
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          onCancel={cancelStreaming}
          isStreaming={isStreaming}
        />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const slideIn = keyframes`
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
`;

const slideOut = keyframes`
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
`;

// Backdrop: purely decorative — pointer-events: none always so it NEVER
// blocks clicks on the dashboard, sidebar, or any other page element.
// Closing is via X button, Escape key only (per spec).
const Backdrop = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  inset: 0;
  /* Dimming scrim retinted off lapis[900] (theme-invariant, always dark)
     rather than pure black, per spec's warm-shadow direction. */
  background: ${({ theme }) => theme.colors.primary[900]}26;
  z-index: 890;
  pointer-events: none;
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  transition: opacity 200ms ease-out;
`;

const Panel = styled.aside<{ $isOpen: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 90vw;
  z-index: 900;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.background};
  border-left: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  box-shadow: ${({ theme }) => theme.shadows.xl};

  /* Slide transition */
  transform: translateX(${({ $isOpen }) => ($isOpen ? '0' : '100%')});
  transition: transform 200ms ease-out;

  /* Keep in DOM for animation; hide from screen readers when closed */
  ${({ $isOpen }) =>
    !$isOpen &&
    css`
      pointer-events: none;
    `}
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  background: ${({ theme }) => theme.colors.surface};
  flex-shrink: 0;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.primary[500]};
`;

const HeaderTitle = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HeaderBadge = styled.span`
  font-size: 10px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.primary[500]};
  background: ${({ theme }) => theme.colors.primary[500]}15;
  border: 1px solid ${({ theme }) => theme.colors.primary[500]}40;
  padding: 1px 7px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  transition: all 150ms ease;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[200]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const PanelError = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.error}40;
  flex-shrink: 0;
`;
