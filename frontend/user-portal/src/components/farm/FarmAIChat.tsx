/**
 * Farm AI Chat Widget
 *
 * Floating chat panel for the AI farm assistant.
 * Supports natural language queries, tool results display,
 * and write-action confirmation cards.
 */

import { useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  MessageCircle,
  X,
  Send,
  ChevronDown,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Leaf,
  Loader,
  Trash2,
} from 'lucide-react';
import { useFarmAIChat } from '../../hooks/farm/useFarmAIChat';
import type { PendingAction } from '../../types/farmAI';

interface FarmAIChatProps {
  farmId: string;
  blockId: string;
  isConnected: boolean;
}

const QUICK_ACTIONS = [
  'Farm status',
  'Sensor readings',
  'Active automations',
  'Any alerts?',
];

export function FarmAIChat({ farmId, blockId, isConnected }: FarmAIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    sending,
    confirming,
    error,
    growthStage,
    sendMessage,
    confirmAction,
    clearMessages,
  } = useFarmAIChat(farmId, blockId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

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
    sendMessage(action);
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'low': return <ShieldCheck size={16} color="#10B981" />;
      case 'medium': return <Shield size={16} color="#F59E0B" />;
      case 'high': return <ShieldAlert size={16} color="#EF4444" />;
      default: return <Shield size={16} />;
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return '#10B981';
      case 'medium': return '#F59E0B';
      case 'high': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getExpiryRemaining = (expiresAt: string) => {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return 'Expired';
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isConnected) return null;

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <FloatingButton onClick={() => setIsOpen(true)}>
          <MessageCircle size={24} />
        </FloatingButton>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <ChatPanel>
          {/* Header */}
          <ChatHeader>
            <HeaderLeft>
              <Leaf size={18} color="#10B981" />
              <HeaderTitle>Farm AI Assistant</HeaderTitle>
            </HeaderLeft>
            <HeaderRight>
              {growthStage && (
                <GrowthBadge>
                  {growthStage.stage} - Day {growthStage.day}
                </GrowthBadge>
              )}
              <IconButton onClick={clearMessages} title="Clear chat">
                <Trash2 size={16} />
              </IconButton>
              <IconButton onClick={() => setIsOpen(false)} title="Close">
                <X size={18} />
              </IconButton>
            </HeaderRight>
          </ChatHeader>

          {/* Messages */}
          <MessagesContainer>
            {messages.length === 0 && (
              <WelcomeMessage>
                <Leaf size={32} color="#10B981" />
                <WelcomeTitle>Farm AI Assistant</WelcomeTitle>
                <WelcomeText>
                  Ask me about sensor readings, crop conditions, automations, or control equipment.
                </WelcomeText>
                <QuickActions>
                  {QUICK_ACTIONS.map((action) => (
                    <QuickActionChip key={action} onClick={() => handleQuickAction(action)}>
                      {action}
                    </QuickActionChip>
                  ))}
                </QuickActions>
              </WelcomeMessage>
            )}

            {messages.map((msg) => (
              <MessageRow key={msg.id} $isUser={msg.role === 'user'}>
                <MessageBubble $isUser={msg.role === 'user'}>
                  <MessageText>{msg.content}</MessageText>

                  {/* Tool badges */}
                  {msg.tools_used && msg.tools_used.length > 0 && (
                    <ToolBadges>
                      {msg.tools_used.map((tool, i) => (
                        <ToolBadge key={i}>{tool.replace(/_/g, ' ')}</ToolBadge>
                      ))}
                    </ToolBadges>
                  )}

                  {/* Pending action confirmation card */}
                  {msg.pending_action && (
                    <ConfirmationCard action={msg.pending_action} onConfirm={confirmAction} confirming={confirming} getRiskIcon={getRiskIcon} getRiskColor={getRiskColor} getExpiryRemaining={getExpiryRemaining} />
                  )}
                </MessageBubble>
              </MessageRow>
            ))}

            {sending && (
              <MessageRow $isUser={false}>
                <MessageBubble $isUser={false}>
                  <TypingIndicator>
                    <Dot $delay="0s" /><Dot $delay="0.2s" /><Dot $delay="0.4s" />
                  </TypingIndicator>
                </MessageBubble>
              </MessageRow>
            )}

            {error && (
              <ErrorMessage>{error}</ErrorMessage>
            )}

            <div ref={messagesEndRef} />
          </MessagesContainer>

          {/* Quick actions (show after first exchange) */}
          {messages.length > 0 && (
            <QuickActionsBar>
              {QUICK_ACTIONS.map((action) => (
                <QuickActionSmall key={action} onClick={() => handleQuickAction(action)} disabled={sending}>
                  {action}
                </QuickActionSmall>
              ))}
            </QuickActionsBar>
          )}

          {/* Input */}
          <InputContainer>
            <ChatInput
              ref={inputRef}
              type="text"
              placeholder="Ask about your farm..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <SendButton onClick={handleSend} disabled={!input.trim() || sending}>
              {sending ? <Loader size={18} /> : <Send size={18} />}
            </SendButton>
          </InputContainer>
        </ChatPanel>
      )}
    </>
  );
}

// Confirmation card sub-component
function ConfirmationCard({
  action,
  onConfirm,
  confirming,
  getRiskIcon,
  getRiskColor,
  getExpiryRemaining,
}: {
  action: PendingAction;
  onConfirm: (id: string, approved: boolean) => void;
  confirming: boolean;
  getRiskIcon: (level: string) => React.ReactNode;
  getRiskColor: (level: string) => string;
  getExpiryRemaining: (expiresAt: string) => string;
}) {
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
        <ApproveButton onClick={() => onConfirm(action.action_id, true)} disabled={confirming || timeLeft === 'Expired'}>
          {confirming ? 'Executing...' : 'Approve'}
        </ApproveButton>
        <DenyButton onClick={() => onConfirm(action.action_id, false)} disabled={confirming}>
          Deny
        </DenyButton>
      </ActionButtons>
    </ActionCard>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const FloatingButton = styled.button`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #10B981;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  transition: all 150ms ease-in-out;
  z-index: 1000;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.5);
  }
`;

const ChatPanel = styled.div`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 420px;
  max-height: 600px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1000;

  @media (max-width: 480px) {
    width: calc(100vw - 16px);
    max-height: calc(100vh - 80px);
    bottom: 8px;
    right: 8px;
  }
`;

const ChatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fdf9;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const HeaderTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: #212121;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const GrowthBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: #10B981;
  background: #10B98115;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: capitalize;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #616161;
  cursor: pointer;
  border-radius: 4px;

  &:hover {
    background: #e0e0e0;
    color: #212121;
  }
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  max-height: 380px;
`;

const WelcomeMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 16px;
  gap: 12px;
`;

const WelcomeTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
`;

const WelcomeText = styled.div`
  font-size: 13px;
  color: #616161;
  line-height: 1.5;
`;

const QuickActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
`;

const QuickActionChip = styled.button`
  padding: 6px 14px;
  background: #f0fdf4;
  color: #10B981;
  border: 1px solid #bbf7d0;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #dcfce7;
    border-color: #86efac;
  }
`;

const MessageRow = styled.div<{ $isUser: boolean }>`
  display: flex;
  justify-content: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
`;

const MessageBubble = styled.div<{ $isUser: boolean }>`
  max-width: 85%;
  padding: 10px 14px;
  border-radius: ${({ $isUser }) =>
    $isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px'};
  background: ${({ $isUser }) => ($isUser ? '#10B981' : '#f5f5f5')};
  color: ${({ $isUser }) => ($isUser ? 'white' : '#212121')};
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MessageText = styled.div`
  font-size: 14px;
  line-height: 1.5;
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
  color: #616161;
  background: #e0e0e0;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: capitalize;
`;

const ActionCard = styled.div<{ $riskColor: string }>`
  background: white;
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
  color: #212121;
  flex: 1;
`;

const ExpiryBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: #616161;
  font-family: monospace;
`;

const ActionDescription = styled.div`
  font-size: 13px;
  color: #424242;
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
  background: white;
  color: #EF4444;
  border: 1px solid #EF4444;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) { background: #FEE2E2; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const bounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
`;

const TypingIndicator = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px 0;
`;

const Dot = styled.div<{ $delay: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9E9E9E;
  animation: ${bounce} 1.2s infinite ease-in-out;
  animation-delay: ${({ $delay }) => $delay};
`;

const ErrorMessage = styled.div`
  font-size: 13px;
  color: #EF4444;
  background: #FEE2E2;
  padding: 8px 12px;
  border-radius: 8px;
  text-align: center;
`;

const QuickActionsBar = styled.div`
  display: flex;
  gap: 4px;
  padding: 6px 16px;
  overflow-x: auto;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;

  &::-webkit-scrollbar { display: none; }
`;

const QuickActionSmall = styled.button`
  padding: 3px 10px;
  background: #f5f5f5;
  color: #616161;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: #e0e0e0;
    color: #212121;
  }

  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const InputContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e0e0e0;
  background: white;
  flex-shrink: 0;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #d4d4d4;
  border-radius: 20px;
  font-size: 14px;
  color: #212121;
  background: #f9f9f9;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #10B981;
    box-shadow: 0 0 0 2px #10B98130;
    background: white;
  }

  &::placeholder { color: #9E9E9E; }
  &:disabled { opacity: 0.6; }
`;

const SendButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #10B981;
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
