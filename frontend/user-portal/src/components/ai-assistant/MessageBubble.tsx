/**
 * MessageBubble
 *
 * Renders a single chat message (user or assistant).
 * - User: right-aligned green bubble
 * - Assistant: left-aligned neutral bubble with markdown rendering,
 *   tool call cards, cost indicator, and error state
 *
 * Markdown is rendered with a lightweight inline parser (no external dep
 * needed since react-markdown is not installed). For the common patterns
 * Claude outputs (bold, code, lists, code blocks) we handle them manually.
 * If react-markdown is added in future, swap the render function.
 *
 * Performance: The bubble memoizes on message content + isStreaming so
 * only the streaming bubble re-renders per chunk.
 */

import { memo } from 'react';
import styled, { keyframes } from 'styled-components';
import { ToolCallCard } from './ToolCallCard';
import type { ChatMessage } from '../../stores/aiAssistant.store';

interface MessageBubbleProps {
  message: ChatMessage;
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer (no external dep)
// Handles: **bold**, `inline code`, ```code block```, - list items
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): string {
  // Escape HTML first to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  const withCodeBlocks = escaped.replace(
    /```(?:\w+)?\n?([\s\S]*?)```/g,
    (_match, code) =>
      `<pre><code>${code.trim()}</code></pre>`
  );

  // Inline code
  const withInlineCode = withCodeBlocks.replace(
    /`([^`]+)`/g,
    '<code>$1</code>'
  );

  // Bold
  const withBold = withInlineCode.replace(
    /\*\*(.*?)\*\*/g,
    '<strong>$1</strong>'
  );

  // Italic
  const withItalic = withBold.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Unordered list items (- item or * item)
  const withLists = withItalic.replace(
    /^[-*]\s+(.+)$/gm,
    '<li>$1</li>'
  );

  // Wrap consecutive <li> elements in <ul>
  const withUl = withLists.replace(
    /(<li>.*?<\/li>)(\n<li>.*?<\/li>)*/gs,
    (match) => `<ul>${match}</ul>`
  );

  // Newlines to <br> (but not inside pre/code blocks)
  const withBr = withUl.replace(/\n(?!<\/?(pre|code|ul|li))/g, '<br/>');

  return withBr;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MessageBubble = memo(function MessageBubble({
  message,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <Row $isUser={isUser}>
      {!isUser && <Avatar aria-hidden="true">AI</Avatar>}
      <Bubble $isUser={isUser} $isError={!!message.isError}>
        {isUser ? (
          <MessageText>{message.content}</MessageText>
        ) : (
          <>
            {message.content && (
              <MarkdownText
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(message.content),
                }}
              />
            )}

            {/* Streaming typing indicator when no content yet */}
            {message.isStreaming && !message.content && (
              <TypingIndicator aria-label="AI is responding">
                <Dot $delay="0s" />
                <Dot $delay="0.2s" />
                <Dot $delay="0.4s" />
              </TypingIndicator>
            )}

            {/* Tool call cards */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <ToolCallList>
                {message.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.name} toolCall={tc} />
                ))}
              </ToolCallList>
            )}

            {/* Cost indicator */}
            {message.costUsd !== undefined && message.costUsd > 0 && (
              <CostTag title="Approximate AI cost for this response">
                ${message.costUsd.toFixed(4)}
              </CostTag>
            )}
          </>
        )}
      </Bubble>
    </Row>
  );
},
// Re-render only when content, streaming state, toolCalls, or costUsd changes
(prev, next) =>
  prev.message.content === next.message.content &&
  prev.message.isStreaming === next.message.isStreaming &&
  prev.message.isError === next.message.isError &&
  prev.message.costUsd === next.message.costUsd &&
  JSON.stringify(prev.message.toolCalls) ===
    JSON.stringify(next.message.toolCalls)
);

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const bounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
`;

const Row = styled.div<{ $isUser: boolean }>`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  justify-content: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
`;

const Avatar = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  font-size: 9px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0.5px;
`;

const Bubble = styled.div<{ $isUser: boolean; $isError: boolean }>`
  max-width: 82%;
  padding: 10px 14px;
  border-radius: ${({ $isUser }) =>
    $isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
  background: ${({ $isUser, $isError, theme }) => {
    if ($isError) return theme.colors.status.danger;
    if ($isUser) return theme.colors.accent.sage;
    return theme.colors.surface.sunken;
  }};
  color: ${({ $isUser, $isError, theme }) => {
    if ($isError) return theme.colors.status.danger;
    if ($isUser) return 'white';
    return theme.colors.text.primary;
  }};
  display: flex;
  flex-direction: column;
  gap: 8px;
  word-break: break-word;
`;

const MessageText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  line-height: 1.55;
  white-space: pre-wrap;
`;

const MarkdownText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  line-height: 1.6;

  strong {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }

  em {
    font-style: italic;
  }

  code {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 12px;
    background: ${({ theme }) => theme.colors.border.subtle};
    padding: 1px 5px;
    border-radius: 3px;
  }

  pre {
    background: ${({ theme }) => theme.colors.border.subtle};
    border-radius: ${({ theme }) => theme.radii.md};
    padding: 10px 12px;
    overflow-x: auto;
    margin: 4px 0;

    code {
      background: none;
      padding: 0;
    }
  }

  ul {
    padding-left: 18px;
    margin: 4px 0;

    li {
      margin-bottom: 3px;
    }
  }
`;

const ToolCallList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const CostTag = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  align-self: flex-end;
  font-family: 'JetBrains Mono', monospace;
`;

const TypingIndicator = styled.div`
  display: flex;
  gap: 4px;
  padding: 2px 0;
`;

const Dot = styled.div<{ $delay: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.text.tertiary};
  animation: ${bounce} 1.2s infinite ease-in-out;
  animation-delay: ${({ $delay }) => $delay};
`;
