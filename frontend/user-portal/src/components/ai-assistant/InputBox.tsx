/**
 * InputBox
 *
 * Textarea + Send button at the bottom of the panel.
 * - Enter sends (Shift+Enter for newline)
 * - Character counter when approaching 8000 limit
 * - Disabled while streaming
 */

import { useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import styled from 'styled-components';
import { Send, Square } from 'lucide-react';
import { glassControl } from '@a64core/shared';

interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const MAX_CHARS = 8000;
const WARN_THRESHOLD = 7000;

export function InputBox({
  value,
  onChange,
  onSend,
  onCancel,
  isStreaming,
  disabled = false,
}: InputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const charCount = value.length;
  const isNearLimit = charCount >= WARN_THRESHOLD;
  const isAtLimit = charCount >= MAX_CHARS;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming && value.trim() && !isAtLimit) {
          onSend();
        }
      }
    },
    [isStreaming, value, isAtLimit, onSend]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= MAX_CHARS) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  const canSend = !isStreaming && value.trim().length > 0 && !isAtLimit && !disabled;

  return (
    <Container>
      <InputRow>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your farms, sensors, alerts…"
          rows={1}
          disabled={disabled}
          aria-label="Chat input"
          aria-multiline="true"
        />
        {isStreaming ? (
          <ActionButton
            onClick={onCancel}
            aria-label="Cancel response"
            title="Cancel"
            $variant="cancel"
            type="button"
          >
            <Square size={16} />
          </ActionButton>
        ) : (
          <ActionButton
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            title="Send (Enter)"
            $variant="send"
            type="button"
          >
            <Send size={16} />
          </ActionButton>
        )}
      </InputRow>
      {isNearLimit && (
        <CharCounter $isAtLimit={isAtLimit}>
          {charCount}/{MAX_CHARS}
        </CharCounter>
      )}
      <Hint>Enter to send · Shift+Enter for new line</Hint>
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InputRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Textarea = styled.textarea`
  ${glassControl}
  flex: 1;
  padding: 9px 14px;
  border-radius: 20px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: none;
  line-height: 1.5;
  min-height: 38px;
  max-height: 140px;
  overflow-y: auto;
  transition: border-color 150ms ease, box-shadow 150ms ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.cosmosHi};
    border-radius: 2px;
  }
`;

const ActionButton = styled.button<{ $variant: 'send' | 'cancel' }>`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 150ms ease;
  background: ${({ $variant, theme }) =>
    $variant === 'send' ? theme.colors.primary[500] : theme.colors.error};
  /* Both fills (lapis/coral) are bright, not gold — onDark, not onAccent
     (spec §1.1 onAccent audit). */
  color: ${({ theme }) => theme.colors.onDark};

  &:hover:not(:disabled) {
    background: ${({ $variant, theme }) =>
      $variant === 'send' ? theme.colors.primary[700] : theme.colors.terracotta[600]};
    transform: scale(1.05);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }
`;

const CharCounter = styled.div<{ $isAtLimit: boolean }>`
  font-size: 11px;
  color: ${({ $isAtLimit, theme }) =>
    $isAtLimit ? theme.colors.error : theme.colors.warning};
  text-align: right;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const Hint = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-align: center;
`;
