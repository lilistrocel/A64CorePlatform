/**
 * AIHubChat Component
 *
 * The main chat interface for each AI Hub section.
 * Touch-optimized, mobile-first, with:
 *   - Scrollable message list with auto-scroll to bottom
 *   - User messages (right, accent-colored) / AI messages (left, gray)
 *   - Tool usage badges on AI messages
 *   - ConfirmationCard for pending actions (Control section only)
 *   - Quick action chips (section-specific, shown in welcome state and as a bar)
 *   - Bouncing typing indicator while sending
 *   - Textarea input (18px, 56px min) with 48px send button
 *
 * Props forward voice-related callbacks from the parent page so TTS/STT
 * can be integrated without coupling this component to the useVoice hook.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { Send, Loader, Trash2 } from 'lucide-react';
import { useAIHub } from '../../hooks/ai/useAIHub';
import { ConfirmationCard } from './ConfirmationCard';
import { exportReport } from '../../services/aiHubApi';
import type { AIHubSection } from '../../types/aiHub';

// ============================================================================
// TYPES
// ============================================================================

export interface AIHubChatProps {
  section: AIHubSection;
  accentColor: string;
  /** Called with AI reply text so the parent can optionally TTS it */
  onAIReply?: (text: string) => void;
  /** Pre-filled input text from voice STT transcript */
  voiceTranscript?: string;
  /** Called after the voice transcript has been consumed */
  onVoiceTranscriptConsumed?: () => void;
}

// ============================================================================
// CONSTANTS — quick actions per section
// ============================================================================

const QUICK_ACTIONS: Record<AIHubSection, string[]> = {
  control: [
    'Turn on irrigation',
    'Toggle automation',
    'Control relay',
    'Show automation schedules',
    'Create new schedule',
  ],
  monitor: [
    'Farm overview',
    'Live sensor readings',
    'Active alerts',
    'Equipment status',
    'Block states summary',
    'Connectivity check',
  ],
  report: [
    'Executive summary',
    'Farm performance report',
    'Harvest yield report',
    'Alert analysis report',
    'Equipment health report',
    'Nutrient analysis report',
  ],
  advise: [
    'Crop health check',
    'Irrigation optimization',
    'Nutrient recommendations',
    'Pest & disease advice',
    'Planting schedule',
    'Compare farm performance',
  ],
};

interface SectionWelcomeConfig {
  icon: string;
  title: string;
  subtitle: string;
}

const SECTION_WELCOME: Record<AIHubSection, SectionWelcomeConfig> = {
  control: {
    icon: '⚙️',
    title: 'Operations Control',
    subtitle:
      'Control relays, manage automations, and execute equipment commands. All actions require your confirmation.',
  },
  monitor: {
    icon: '📡',
    title: 'Live Monitoring',
    subtitle:
      'View real-time sensor data, equipment status, alerts, and farm statistics. Read-only access.',
  },
  report: {
    icon: '📊',
    title: 'Report Generator',
    subtitle: 'Generate structured reports with data analysis. Export as PDF or Excel.',
  },
  advise: {
    icon: '🌱',
    title: 'Agricultural Advisor',
    subtitle:
      'Get expert farming advice based on your live data and international best practices.',
  },
};

interface SectionBadgeConfig {
  icon: string;
  label: string;
  color: string;
}

const SECTION_BADGE: Record<AIHubSection, SectionBadgeConfig> = {
  control: { icon: '⚡', label: 'Write Access', color: '#F59E0B' },
  monitor: { icon: '👁️', label: 'Read Only',    color: '#3B82F6' },
  report:  { icon: '📄', label: 'Exportable',   color: '#8B5CF6' },
  advise:  { icon: '🧠', label: 'Expert Mode',  color: '#10B981' },
};

const SECTION_PLACEHOLDER: Record<AIHubSection, string> = {
  control: 'Ask me to control something...',
  monitor: 'Ask me about your farms...',
  report:  'Ask me for a report...',
  advise:  'Ask me for advice...',
};

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const bounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); }
  40%           { transform: translateY(-6px); }
`;

const ChatWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.colors.background};
  overflow: hidden;
`;

/* ----- Chat inner header (clear button, section info) ----- */

const ChatInnerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  background: ${({ theme }) => theme.colors.background};
  flex-shrink: 0;
  gap: 8px;
`;

interface AccentTextProps {
  $color: string;
}

const SectionLabel = styled.span<AccentTextProps>`
  font-size: 11px;
  font-weight: 600;
  color: ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}12`};
  border: 1px solid ${({ $color }) => `${$color}30`};
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: capitalize;
  margin-right: auto;
`;

const SectionBadge = styled.span<AccentTextProps>`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}12`};
  border: 1px solid ${({ $color }) => `${$color}30`};
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  white-space: nowrap;
  flex-shrink: 0;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.textDisabled};
  cursor: pointer;
  border-radius: 6px;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[200]};
    color: ${({ theme }) => theme.colors.textSecondary};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.textDisabled};
    outline-offset: 2px;
  }
`;

/* ----- Messages ----- */

const MessagesArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  background: ${({ theme }) => theme.colors.neutral[50]};

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.neutral[300]};
    border-radius: 2px;
  }

  @media (min-width: 768px) {
    padding: 20px 24px;
  }
`;

const WelcomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  flex: 1;
  padding: 32px 16px;
  gap: 16px;
`;

const WelcomeIcon = styled.div<AccentTextProps>`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${({ $color }) => `${$color}15`};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ $color }) => $color};
  font-size: 26px;
  line-height: 1;
`;

const WelcomeTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const WelcomeText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
  max-width: 480px;
  margin: 0;
`;

const QuickActionsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 4px;
  max-width: 560px;
`;

interface QuickChipProps {
  $accentColor: string;
}

const QuickChip = styled.button<QuickChipProps>`
  padding: 8px 16px;
  min-height: 40px;
  background: ${({ $accentColor }) => `${$accentColor}10`};
  color: ${({ $accentColor }) => $accentColor};
  border: 1px solid ${({ $accentColor }) => `${$accentColor}30`};
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ $accentColor }) => `${$accentColor}20`};
    border-color: ${({ $accentColor }) => `${$accentColor}60`};
  }

  &:focus-visible {
    outline: 2px solid ${({ $accentColor }) => $accentColor};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/* ----- Message rows ----- */

interface MessageRowProps {
  $isUser: boolean;
}

const MessageRow = styled.div<MessageRowProps>`
  display: flex;
  justify-content: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
`;

interface BubbleProps {
  $isUser: boolean;
  $accentColor: string;
}

const MessageBubble = styled.div<BubbleProps>`
  max-width: 88%;
  padding: 12px 16px;
  border-radius: ${({ $isUser }) =>
    $isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};
  background: ${({ $isUser, $accentColor, theme }) =>
    $isUser ? $accentColor : theme.colors.neutral[200]};
  color: ${({ $isUser, theme }) => ($isUser ? 'white' : theme.colors.textPrimary)};
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MessageText = styled.div`
  font-size: 16px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
`;

const ToolBadges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const ToolBadge = styled.span`
  font-size: 10px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[300]};
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: capitalize;
`;

/* ----- Typing indicator ----- */

const TypingIndicator = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px 2px;
`;

interface DotProps {
  $delay: string;
}

const Dot = styled.div<DotProps>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.textDisabled};
  animation: ${bounce} 1.2s infinite ease-in-out;
  animation-delay: ${({ $delay }) => $delay};
`;

/* ----- Error message ----- */

const ErrorBanner = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error}40;
  padding: 8px 14px;
  border-radius: 8px;
  text-align: center;
`;

/* ----- Report export buttons ----- */

const ExportBar = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ExportButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary?.[500] ?? '#2196f3'};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/* ----- Quick actions bar (shown after first message) ----- */

const QuickActionsBar = styled.div`
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  background: ${({ theme }) => theme.colors.background};
  flex-shrink: 0;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const QuickBarChip = styled.button<QuickChipProps>`
  padding: 5px 12px;
  min-height: 36px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ $accentColor }) => `${$accentColor}10`};
    color: ${({ $accentColor }) => $accentColor};
    border-color: ${({ $accentColor }) => `${$accentColor}40`};
  }

  &:focus-visible {
    outline: 2px solid ${({ $accentColor }) => $accentColor};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/* ----- Input area ----- */

const InputArea = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ theme }) => theme.colors.background};
  flex-shrink: 0;
`;

const TextareaInput = styled.textarea`
  flex: 1;
  min-height: 56px;
  max-height: 160px;
  padding: 16px 18px;
  border: 1.5px solid #d4d4d4;
  border-radius: 14px;
  font-size: 18px;
  line-height: 1.4;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  resize: none;
  transition: all 150ms ease-in-out;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.12);
    background: ${({ theme }) => theme.colors.background};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

interface SendButtonProps {
  $accentColor: string;
}

const SendButton = styled.button<SendButtonProps>`
  width: 52px;
  height: 52px;
  min-width: 52px;
  border-radius: 50%;
  background: ${({ $accentColor }) => $accentColor};
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    filter: brightness(0.9);
    transform: scale(1.05);
  }

  &:focus-visible {
    outline: 2px solid ${({ $accentColor }) => $accentColor};
    outline-offset: 3px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  /* Align with textarea bottom */
  margin-bottom: 2px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function AIHubChat({
  section,
  accentColor,
  onAIReply,
  voiceTranscript,
  onVoiceTranscriptConsumed,
}: AIHubChatProps) {
  const [inputValue, setInputValue] = useState('');
  // Tracks which message+format is currently being exported, e.g. "msg-123-pdf"
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    sending,
    confirming,
    error,
    canWrite,
    sendMessage,
    confirmAction,
    clearMessages,
  } = useAIHub(section);

  const handleSendText = useCallback(
    (text: string) => {
      if (!text.trim() || sending) return;
      sendMessage(text.trim());
    },
    [sending, sendMessage]
  );

  // Auto-scroll when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Consume voice transcript — show briefly in textarea then auto-send
  useEffect(() => {
    if (!voiceTranscript?.trim()) return;

    setInputValue(voiceTranscript);
    onVoiceTranscriptConsumed?.();

    const timer = setTimeout(() => {
      sendMessage(voiceTranscript.trim());
      setInputValue('');
    }, 300);

    return () => clearTimeout(timer);
  }, [voiceTranscript, onVoiceTranscriptConsumed, sendMessage]);

  // Notify parent of new AI replies so TTS can be triggered
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && onAIReply) {
        onAIReply(lastMsg.content);
      }
    }
    prevMessageCount.current = messages.length;
  }, [messages, onAIReply]);

  const handleSend = () => {
    if (!inputValue.trim() || sending) return;
    handleSendText(inputValue);
    setInputValue('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: string) => {
    if (sending) return;
    handleSendText(action);
  };

  const handleExport = useCallback(
    async (messageId: string, content: string, format: 'pdf' | 'excel') => {
      const key = `${messageId}-${format}`;
      if (exportingKey) return;
      setExportingKey(key);
      try {
        // Use the first line of the content as the title (strip markdown headings)
        const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim() || 'Report';
        await exportReport(content, firstLine, format);
      } catch {
        // Silent fail — the file download failing should not break the chat UI
      } finally {
        setExportingKey(null);
      }
    },
    [exportingKey]
  );

  const quickActions = QUICK_ACTIONS[section];
  const welcomeConfig = SECTION_WELCOME[section];
  const badgeConfig = SECTION_BADGE[section];

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Reset height so it can shrink
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <ChatWrapper>
      {/* Inner header: section badge + clear button */}
      <ChatInnerHeader>
        <SectionLabel $color={accentColor} aria-hidden="true">{section}</SectionLabel>
        <SectionBadge $color={badgeConfig.color} aria-label={badgeConfig.label}>
          <span aria-hidden="true">{badgeConfig.icon}</span>
          {badgeConfig.label}
        </SectionBadge>
        <IconButton
          onClick={clearMessages}
          disabled={messages.length === 0}
          title="Clear conversation"
          aria-label="Clear conversation history"
        >
          <Trash2 size={15} />
        </IconButton>
      </ChatInnerHeader>

      {/* Messages */}
      <MessagesArea role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && (
          <WelcomeContainer>
            <WelcomeIcon $color={accentColor} aria-hidden="true">
              {welcomeConfig.icon}
            </WelcomeIcon>
            <WelcomeTitle>{welcomeConfig.title}</WelcomeTitle>
            <WelcomeText>{welcomeConfig.subtitle}</WelcomeText>
            <QuickActionsGrid>
              {quickActions.map((action) => (
                <QuickChip
                  key={action}
                  $accentColor={accentColor}
                  onClick={() => handleQuickAction(action)}
                  disabled={sending}
                >
                  {action}
                </QuickChip>
              ))}
            </QuickActionsGrid>
          </WelcomeContainer>
        )}

        {messages.map((msg) => (
          <MessageRow key={msg.id} $isUser={msg.role === 'user'}>
            <MessageBubble $isUser={msg.role === 'user'} $accentColor={accentColor}>
              <MessageText>{msg.content}</MessageText>

              {/* Tool badges on AI messages */}
              {msg.role === 'assistant' &&
                msg.tools_used &&
                msg.tools_used.length > 0 && (
                  <ToolBadges>
                    {msg.tools_used.map((tool, i) => (
                      <ToolBadge key={i}>{tool.replace(/_/g, ' ')}</ToolBadge>
                    ))}
                  </ToolBadges>
                )}

              {/* Export buttons — Report section, AI messages only */}
              {msg.role === 'assistant' && section === 'report' && (
                <ExportBar>
                  <ExportButton
                    type="button"
                    onClick={() => handleExport(msg.id, msg.content, 'pdf')}
                    disabled={!!exportingKey}
                    aria-label="Export as PDF"
                    title="Export as PDF"
                  >
                    {exportingKey === `${msg.id}-pdf` ? (
                      <Loader size={11} />
                    ) : (
                      <span aria-hidden="true">📄</span>
                    )}
                    PDF
                  </ExportButton>
                  <ExportButton
                    type="button"
                    onClick={() => handleExport(msg.id, msg.content, 'excel')}
                    disabled={!!exportingKey}
                    aria-label="Export as Excel"
                    title="Export as Excel"
                  >
                    {exportingKey === `${msg.id}-excel` ? (
                      <Loader size={11} />
                    ) : (
                      <span aria-hidden="true">📊</span>
                    )}
                    Excel
                  </ExportButton>
                </ExportBar>
              )}

              {/* Confirmation card — Control section pending actions */}
              {msg.pending_action && canWrite && (
                <ConfirmationCard
                  pendingAction={msg.pending_action}
                  onConfirm={confirmAction}
                  confirming={confirming}
                />
              )}
            </MessageBubble>
          </MessageRow>
        ))}

        {/* Typing indicator */}
        {sending && (
          <MessageRow $isUser={false}>
            <MessageBubble $isUser={false} $accentColor={accentColor}>
              <TypingIndicator aria-label="AI is responding">
                <Dot $delay="0s" />
                <Dot $delay="0.2s" />
                <Dot $delay="0.4s" />
              </TypingIndicator>
            </MessageBubble>
          </MessageRow>
        )}

        {error && (
          <ErrorBanner role="alert">{error}</ErrorBanner>
        )}

        <div ref={messagesEndRef} aria-hidden="true" />
      </MessagesArea>

      {/* Quick actions bar (after first message) */}
      {messages.length > 0 && (
        <QuickActionsBar>
          {quickActions.map((action) => (
            <QuickBarChip
              key={action}
              $accentColor={accentColor}
              onClick={() => handleQuickAction(action)}
              disabled={sending}
            >
              {action}
            </QuickBarChip>
          ))}
        </QuickActionsBar>
      )}

      {/* Input area */}
      <InputArea>
        <TextareaInput
          ref={textareaRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={SECTION_PLACEHOLDER[section]}
          disabled={sending}
          rows={1}
          aria-label={`Message input for ${section} section`}
          aria-multiline="true"
        />
        <SendButton
          $accentColor={accentColor}
          onClick={handleSend}
          disabled={!inputValue.trim() || sending}
          aria-label="Send message"
        >
          {sending ? <Loader size={20} /> : <Send size={20} />}
        </SendButton>
      </InputArea>
    </ChatWrapper>
  );
}
