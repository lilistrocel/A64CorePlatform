/**
 * ConversationList
 *
 * Left/top sidebar tab inside the AI panel.
 * Shows the last 3 saved conversations with:
 *   - Title (truncated)
 *   - Relative timestamp
 *   - Message count
 *   - Delete button
 *   - "New conversation" button at top
 */

import styled from 'styled-components';
import { Trash2, Plus, MessageCircle } from 'lucide-react';
import type { ConversationSummary } from '../../stores/aiAssistant.store';

interface ConversationListProps {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  isDeletingId?: string;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ConversationList({
  conversations,
  currentConversationId,
  isLoading,
  onSelect,
  onDelete,
  onNew,
  isDeletingId,
}: ConversationListProps) {
  return (
    <Container>
      <NewButton onClick={onNew} type="button">
        <Plus size={14} />
        New conversation
      </NewButton>

      {isLoading && <LoadingText>Loading…</LoadingText>}

      {!isLoading && conversations.length === 0 && (
        <EmptyText>No saved conversations yet</EmptyText>
      )}

      {conversations.map((conv) => {
        const isActive = conv.conversationId === currentConversationId;
        const isDeleting = isDeletingId === conv.conversationId;

        return (
          <ConvItem
            key={conv.conversationId}
            $isActive={isActive}
            onClick={() => onSelect(conv.conversationId)}
            role="button"
            tabIndex={0}
            aria-selected={isActive}
            aria-label={`Conversation: ${conv.title}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(conv.conversationId);
              }
            }}
          >
            <ConvIcon $isActive={isActive}>
              <MessageCircle size={14} />
            </ConvIcon>
            <ConvContent>
              <ConvTitle>{conv.title}</ConvTitle>
              <ConvMeta>
                {formatRelativeTime(conv.updatedAt)} · {conv.message_count} msg
                {conv.message_count !== 1 ? 's' : ''}
              </ConvMeta>
            </ConvContent>
            <DeleteButton
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.conversationId);
              }}
              disabled={isDeleting}
              aria-label={`Delete conversation: ${conv.title}`}
              title="Delete"
              type="button"
            >
              <Trash2 size={12} />
            </DeleteButton>
          </ConvItem>
        );
      })}
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${({ theme }) => theme.space['2']};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  background: ${({ theme }) => theme.colors.surface.raised};
`;

const NewButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
  width: 100%;
  padding: 8px ${({ theme }) => theme.space['2']};
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease;
  margin-bottom: ${({ theme }) => theme.space['1']};

  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
`;

const LoadingText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-align: center;
  padding: ${({ theme }) => theme.space['2']};
`;

const EmptyText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.tertiary};
  text-align: center;
  padding: ${({ theme }) => theme.space['2']};
`;

const ConvItem = styled.div<{ $isActive: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['2']};
  padding: 8px ${({ theme }) => theme.space['2']};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  background: ${({ $isActive, theme }) =>
    $isActive ? `${theme.colors.accent.sage}15` : 'transparent'};
  border: 1px solid ${({ $isActive, theme }) =>
    $isActive ? `${theme.colors.accent.sage}40` : 'transparent'};
  transition: all 150ms ease;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 1px;
  }
`;

const ConvIcon = styled.div<{ $isActive: boolean }>`
  color: ${({ $isActive, theme }) =>
    $isActive ? theme.colors.accent.sage : theme.colors.text.secondary};
  flex-shrink: 0;
`;

const ConvContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ConvTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ConvMeta = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-top: 1px;
`;

const DeleteButton = styled.button`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.tertiary};
  border-radius: ${({ theme }) => theme.radii.sm};
  cursor: pointer;
  transition: all 150ms ease;
  opacity: 0;

  ${ConvItem}:hover & {
    opacity: 1;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.status.danger};
    background: ${({ theme }) => theme.colors.status.danger};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;
