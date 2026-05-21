/**
 * MessageList
 *
 * Scrollable container that renders all chat messages.
 * Auto-scrolls to bottom on new messages or chunk appends.
 * Shows the empty state when no conversation is active.
 */

import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../stores/aiAssistant.store';

interface MessageListProps {
  messages: ChatMessage[];
  onQuickAction: (text: string) => void;
  isStreaming: boolean;
}

const QUICK_SUGGESTIONS = [
  "Show all blocks growing right now",
  "What's the alert summary?",
  "Compare yield across farms",
  "Which blocks need attention today?",
];

export function MessageList({
  messages,
  onQuickAction,
  isStreaming,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages array changes length or
  // the last message's content changes (streaming chunks)
  const lastContent = messages[messages.length - 1]?.content ?? '';
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, lastContent]);

  if (messages.length === 0) {
    return (
      <Container role="log" aria-live="polite" aria-label="Chat messages">
        <EmptyState>
          <EmptyIcon aria-hidden="true">💬</EmptyIcon>
          <EmptyTitle>Ask me anything about your farms</EmptyTitle>
          <EmptyDescription>
            I can query sensor data, check alerts, review block status, compare
            yields, and more — across all your farms or a specific one.
          </EmptyDescription>
          <SuggestionGrid>
            {QUICK_SUGGESTIONS.map((s) => (
              <SuggestionChip
                key={s}
                onClick={() => onQuickAction(s)}
                disabled={isStreaming}
                type="button"
              >
                {s}
              </SuggestionChip>
            ))}
          </SuggestionGrid>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container role="log" aria-live="polite" aria-label="Chat messages">
      <MessageListInner>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </MessageListInner>
      <div ref={bottomRef} />
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: ${({ theme }) => theme.colors.neutral[50]};

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.neutral[300]};
    border-radius: 3px;
  }
`;

const MessageListInner = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  flex: 1;
  padding: ${({ theme }) => theme.spacing.xl} ${({ theme }) => theme.spacing.md};
  gap: ${({ theme }) => theme.spacing.md};
`;

const EmptyIcon = styled.div`
  font-size: 36px;
`;

const EmptyTitle = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const EmptyDescription = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
  max-width: 320px;
`;

const SuggestionGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const SuggestionChip = styled.button`
  padding: 7px 14px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.primary[500]};
  border: 1px solid ${({ theme }) => theme.colors.primary[500]}40;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  font-family: inherit;
  cursor: pointer;
  transition: all 150ms ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[100]};
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
