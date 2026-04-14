/**
 * AIAnalyticsChat Component
 *
 * Full-page AI monitoring chat interface with scope selector.
 * Supports global monitoring (read-only) and farm-level monitoring (with write actions).
 * Visual style matches FarmAIChat widget (green theme, message bubbles, tool badges).
 */

import { useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  Leaf,
  Send,
  Loader,
  Trash2,
  MessageCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Globe,
  Building2,
} from 'lucide-react';
import { useMultiLevelAIChat } from '../../hooks/farm/useMultiLevelAIChat';
import { ScopeSelector } from './ScopeSelector';
import type { AIScope, PendingAction } from '../../types/farmAI';

// ============================================================================
// TYPES
// ============================================================================

interface FarmOption {
  farmId: string;
  name: string;
}

export interface AIAnalyticsChatProps {
  farms: FarmOption[];
  scope: AIScope;
  onScopeChange: (scope: AIScope) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GLOBAL_QUICK_ACTIONS = [
  'Farm overview',
  'Any alerts?',
  'Compare farms',
  'Which farms have SenseHub?',
];

const FARM_QUICK_ACTIONS = [
  'Block status',
  'Sensor readings',
  'Active automations',
  'Any alerts?',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRiskIcon(level: string): React.ReactNode {
  switch (level) {
    case 'low': return <ShieldCheck size={16} color="#10B981" />;
    case 'medium': return <Shield size={16} color="#F59E0B" />;
    case 'high': return <ShieldAlert size={16} color="#EF4444" />;
    default: return <Shield size={16} />;
  }
}

function getRiskColor(level: string): string {
  switch (level) {
    case 'low': return '#10B981';
    case 'medium': return '#F59E0B';
    case 'high': return '#EF4444';
    default: return '#6B7280';
  }
}

function getExpiryRemaining(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ============================================================================
// CONFIRMATION CARD SUB-COMPONENT
// ============================================================================

interface ConfirmationCardProps {
  action: PendingAction;
  onConfirm: (id: string, approved: boolean) => void;
  confirming: boolean;
}

function ConfirmationCard({ action, onConfirm, confirming }: ConfirmationCardProps) {
  const [timeLeft, setTimeLeft] = useState(getExpiryRemaining(action.expires_at));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getExpiryRemaining(action.expires_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [action.expires_at]);

  return (
    <ActionCard $riskColor={getRiskColor(action.risk_level)}>
      <ActionHeader>
        {getRiskIcon(action.risk_level)}
        <ActionTitle>Confirmation Required</ActionTitle>
        <ExpiryBadge>{timeLeft}</ExpiryBadge>
      </ActionHeader>
      <ActionDescription>{action.description}</ActionDescription>
      <ActionButtons>
        <ApproveButton
          onClick={() => onConfirm(action.action_id, true)}
          disabled={confirming || timeLeft === 'Expired'}
        >
          {confirming ? 'Executing...' : 'Approve'}
        </ApproveButton>
        <DenyButton
          onClick={() => onConfirm(action.action_id, false)}
          disabled={confirming}
        >
          Deny
        </DenyButton>
      </ActionButtons>
    </ActionCard>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AIAnalyticsChat({ farms, scope, onScopeChange }: AIAnalyticsChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    sending,
    confirming,
    error,
    canWrite,
    sendMessage,
    confirmAction,
    clearMessages,
  } = useMultiLevelAIChat(scope);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: string) => {
    if (sending) return;
    sendMessage(action);
  };

  const quickActions = scope.level === 'global' ? GLOBAL_QUICK_ACTIONS : FARM_QUICK_ACTIONS;

  const scopeLabel = scope.level === 'global'
    ? 'Global Monitoring'
    : scope.farmName;

  return (
    <ChatContainer>
      {/* Header */}
      <ChatHeader>
        <HeaderLeft>
          <Leaf size={20} color="#10B981" aria-hidden="true" />
          <div>
            <HeaderTitle>AI Farm Monitor</HeaderTitle>
            <HeaderScope>
              {scope.level === 'global'
                ? <><Globe size={11} /> All Farms</>
                : <><Building2 size={11} /> {scopeLabel}</>
              }
            </HeaderScope>
          </div>
        </HeaderLeft>
        <HeaderCenter>
          <ScopeSelector
            farms={farms}
            scope={scope}
            onScopeChange={onScopeChange}
          />
        </HeaderCenter>
        <HeaderRight>
          {!canWrite && (
            <ReadOnlyBadge title="Global scope is read-only. Select a specific farm to enable write actions.">
              Read only
            </ReadOnlyBadge>
          )}
          <IconButton
            onClick={clearMessages}
            title="Clear chat history"
            aria-label="Clear chat history"
            disabled={messages.length === 0}
          >
            <Trash2 size={16} />
          </IconButton>
        </HeaderRight>
      </ChatHeader>

      {/* Messages area */}
      <MessagesContainer role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && (
          <WelcomeMessage>
            <MessageCircle size={36} color="#10B981" aria-hidden="true" />
            <WelcomeTitle>AI Farm Monitor</WelcomeTitle>
            <WelcomeText>
              {scope.level === 'global'
                ? 'Ask me about your farms, alerts, sensor status, or performance across all farms.'
                : `Ask me about ${scope.farmName} — block status, sensors, automations, or alerts.`
              }
            </WelcomeText>
            <QuickActionsGrid>
              {quickActions.map((action) => (
                <QuickActionChip
                  key={action}
                  onClick={() => handleQuickAction(action)}
                  disabled={sending}
                >
                  {action}
                </QuickActionChip>
              ))}
            </QuickActionsGrid>
          </WelcomeMessage>
        )}

        {messages.map((msg) => (
          <MessageRow key={msg.id} $isUser={msg.role === 'user'}>
            <MessageBubble $isUser={msg.role === 'user'}>
              <MessageText>{msg.content}</MessageText>

              {/* Tool badges under assistant messages */}
              {msg.tools_used && msg.tools_used.length > 0 && (
                <ToolBadges>
                  {msg.tools_used.map((tool, i) => (
                    <ToolBadge key={i}>{tool.replace(/_/g, ' ')}</ToolBadge>
                  ))}
                </ToolBadges>
              )}

              {/* Confirmation card for farm-level write actions */}
              {msg.pending_action && canWrite && (
                <ConfirmationCard
                  action={msg.pending_action}
                  onConfirm={confirmAction}
                  confirming={confirming}
                />
              )}
            </MessageBubble>
          </MessageRow>
        ))}

        {/* Bouncing dot typing indicator */}
        {sending && (
          <MessageRow $isUser={false}>
            <MessageBubble $isUser={false}>
              <TypingIndicator aria-label="AI is responding">
                <Dot $delay="0s" />
                <Dot $delay="0.2s" />
                <Dot $delay="0.4s" />
              </TypingIndicator>
            </MessageBubble>
          </MessageRow>
        )}

        {error && (
          <ErrorMessage role="alert">{error}</ErrorMessage>
        )}

        <div ref={messagesEndRef} />
      </MessagesContainer>

      {/* Quick action chips bar (after first message) */}
      {messages.length > 0 && (
        <QuickActionsBar>
          {quickActions.map((action) => (
            <QuickActionSmall
              key={action}
              onClick={() => handleQuickAction(action)}
              disabled={sending}
            >
              {action}
            </QuickActionSmall>
          ))}
        </QuickActionsBar>
      )}

      {/* Input area */}
      <InputContainer>
        <ChatInput
          ref={inputRef}
          type="text"
          placeholder={
            scope.level === 'global'
              ? 'Ask about your farms...'
              : `Ask about ${scope.farmName}...`
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          aria-label="Chat input"
        />
        <SendButton
          onClick={handleSend}
          disabled={!input.trim() || sending}
          aria-label="Send message"
        >
          {sending ? <Loader size={18} /> : <Send size={18} />}
        </SendButton>
      </InputContainer>
    </ChatContainer>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const bounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
`;

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const ChatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.successBg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  flex-shrink: 0;
  gap: 12px;

  @media (max-width: 768px) {
    flex-wrap: wrap;
    gap: 8px;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`;

const HeaderTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.2;
`;

const HeaderScope = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #10B981;
  font-weight: 500;
`;

const HeaderCenter = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;

  @media (max-width: 768px) {
    order: 3;
    width: 100%;
    justify-content: flex-start;
  }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const ReadOnlyBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[200]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  padding: 2px 8px;
  border-radius: 10px;
  cursor: help;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  border-radius: 6px;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[300]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  background: ${({ theme }) => theme.colors.neutral[50]};

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #d4d4d4;
    border-radius: 3px;
  }
`;

const WelcomeMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  flex: 1;
  padding: 32px 20px;
  gap: 14px;
`;

const WelcomeTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const WelcomeText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
  max-width: 480px;
`;

const QuickActionsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 8px;
  max-width: 560px;
`;

const QuickActionChip = styled.button`
  padding: 8px 18px;
  background: ${({ theme }) => theme.colors.successBg};
  color: ${({ theme }) => theme.colors.success};
  border: 1px solid ${({ theme }) => theme.colors.success}40;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[200]};
    border-color: ${({ theme }) => theme.colors.success}80;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const MessageRow = styled.div<{ $isUser: boolean }>`
  display: flex;
  justify-content: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
`;

const MessageBubble = styled.div<{ $isUser: boolean }>`
  max-width: 78%;
  padding: 10px 14px;
  border-radius: ${({ $isUser }) =>
    $isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px'};
  background: ${({ $isUser, theme }) => ($isUser ? '#10B981' : theme.colors.neutral[200])};
  color: ${({ $isUser, theme }) => ($isUser ? 'white' : theme.colors.textPrimary)};
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MessageText = styled.div`
  font-size: 14px;
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
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: capitalize;
`;

/* ---- Confirmation Card ---- */

const ActionCard = styled.div<{ $riskColor: string }>`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ $riskColor }) => $riskColor}40;
  border-left: 3px solid ${({ $riskColor }) => $riskColor};
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ActionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const ActionTitle = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  flex: 1;
`;

const ExpiryBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-family: monospace;
`;

const ActionDescription = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.4;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const ApproveButton = styled.button`
  flex: 1;
  padding: 6px 12px;
  background: #10B981;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) { background: #059669; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DenyButton = styled.button`
  flex: 1;
  padding: 6px 12px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.errorBg}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/* ---- Typing Indicator ---- */

const TypingIndicator = styled.div`
  display: flex;
  gap: 4px;
  padding: 2px 0;
`;

const Dot = styled.div<{ $delay: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.textDisabled};
  animation: ${bounce} 1.2s infinite ease-in-out;
  animation-delay: ${({ $delay }) => $delay};
`;

/* ---- Error ---- */

const ErrorMessage = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  padding: 8px 12px;
  border-radius: 8px;
  text-align: center;
`;

/* ---- Quick Actions Bar (after first message) ---- */

const QuickActionsBar = styled.div`
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  overflow-x: auto;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  background: ${({ theme }) => theme.colors.background};
  flex-shrink: 0;

  &::-webkit-scrollbar { display: none; }
`;

const QuickActionSmall = styled.button`
  padding: 4px 12px;
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
    background: ${({ theme }) => theme.colors.neutral[300]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/* ---- Input Area ---- */

const InputContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ theme }) => theme.colors.background};
  flex-shrink: 0;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #d4d4d4;
  border-radius: 22px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #10B981;
    box-shadow: 0 0 0 2px #10B98125;
    background: ${({ theme }) => theme.colors.background};
  }

  &::placeholder { color: ${({ theme }) => theme.colors.textDisabled}; }
  &:disabled { opacity: 0.6; }
`;

const SendButton = styled.button`
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.success};
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) { background: #059669; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;
