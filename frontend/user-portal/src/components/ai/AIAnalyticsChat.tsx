/**
 * AIAnalyticsChat Component
 *
 * Comprehensive chat interface for AI-powered farm analytics.
 * Displays conversation history, AI responses with detailed insights,
 * query explanations, statistics, and cost tracking.
 */

import { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useAIAnalytics } from '../../hooks/farm/useAIAnalytics';
import type { ChatMessage, AIAnalyticsResponse } from '../../types/analytics';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface AIAnalyticsChatProps {
  className?: string;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const ChatHeader = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ChatTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ChatSubtitle = styled.span`
  font-size: 13px;
  opacity: 0.85;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fafafa;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f5f5f5;
  }

  &::-webkit-scrollbar-thumb {
    background: #9e9e9e;
    border-radius: 4px;
  }
`;

const MessageWrapper = styled.div<{ $isUser: boolean }>`
  display: flex;
  justify-content: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
  animation: fadeIn 300ms ease-in-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const MessageBubble = styled.div<{ $isUser: boolean }>`
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 12px;
  background: ${({ $isUser }) => ($isUser ? '#3b82f6' : 'white')};
  color: ${({ $isUser }) => ($isUser ? 'white' : '#212121')};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  font-size: 15px;
  line-height: 1.5;
`;

const MessageTime = styled.div<{ $isUser: boolean }>`
  font-size: 11px;
  color: ${({ $isUser }) => ($isUser ? 'rgba(255,255,255,0.8)' : '#9e9e9e')};
  margin-top: 4px;
`;

const AIResponseContainer = styled.div`
  max-width: 85%;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ResponseSection = styled.div`
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const SectionTitle = styled.h4`
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #6366f1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SummaryText = styled.div`
  font-size: 16px;
  line-height: 1.6;
  color: #212121;
  font-weight: 500;
  padding: 12px;
  background: #f0f9ff;
  border-left: 4px solid #3b82f6;
  border-radius: 8px;
`;

const InsightsList = styled.ul`
  margin: 0;
  padding: 0 0 0 20px;
  list-style: none;

  li {
    margin-bottom: 8px;
    font-size: 14px;
    line-height: 1.5;
    color: #616161;
    position: relative;

    &::before {
      content: '✓';
      position: absolute;
      left: -20px;
      color: #4caf50;
      font-weight: bold;
    }
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
`;

const StatCard = styled.div`
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  text-align: center;
`;

const StatLabel = styled.div`
  font-size: 11px;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const StatValue = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
`;

const CollapsibleSection = styled.div`
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
`;

const CollapsibleHeader = styled.button<{ $isOpen: boolean }>`
  width: 100%;
  padding: 12px 16px;
  background: ${({ $isOpen }) => ($isOpen ? '#f5f5f5' : 'white')};
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  color: #212121;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }

  &::after {
    content: '${({ $isOpen }) => ($isOpen ? '▼' : '▶')}';
    font-size: 10px;
    color: #9e9e9e;
  }
`;

const CollapsibleContent = styled.div<{ $isOpen: boolean }>`
  max-height: ${({ $isOpen }) => ($isOpen ? '500px' : '0')};
  overflow: ${({ $isOpen }) => ($isOpen ? 'auto' : 'hidden')};
  transition: max-height 300ms ease-in-out;
  background: #fafafa;
`;

const CollapsibleInner = styled.div`
  padding: 16px;
`;

const CodeBlock = styled.pre`
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
  font-family: 'Courier New', monospace;
`;

const ResultsTable = styled.div`
  max-height: 300px;
  overflow: auto;
  font-size: 13px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.th`
  padding: 8px;
  text-align: left;
  background: #f5f5f5;
  font-weight: 600;
  color: #616161;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid #e0e0e0;
  position: sticky;
  top: 0;
`;

const TableCell = styled.td`
  padding: 8px;
  border-bottom: 1px solid #e0e0e0;
  color: #212121;
`;

const MetadataFooter = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  font-size: 12px;
  color: #616161;
`;

const MetadataItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;

  strong {
    color: #212121;
  }
`;

const CostBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  font-weight: 600;
`;

const CacheBadge = styled.span<{ $hit: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  background: ${({ $hit }) => ($hit ? '#d1fae5' : '#fee2e2')};
  color: ${({ $hit }) => ($hit ? '#065f46' : '#991b1b')};
  border-radius: 4px;
  font-weight: 600;
`;

const InputContainer = styled.div`
  padding: 12px 16px;
  border-top: 1px solid #e0e0e0;
  background: white;
`;

const InputWrapper = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const TextArea = styled.textarea`
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 20px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  min-height: 40px;
  max-height: 120px;
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;
  line-height: 1.4;

  &:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const CharCount = styled.div<{ $isOver: boolean }>`
  font-size: 11px;
  color: ${({ $isOver }) => ($isOver ? '#ef4444' : '#9ca3af')};
  position: absolute;
  right: 80px;
  bottom: 8px;
`;

const SendButton = styled.button<{ $disabled: boolean }>`
  padding: 10px 20px;
  background: ${({ $disabled }) => ($disabled ? '#d1d5db' : '#6366f1')};
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: ${({ $disabled }) => ($disabled ? '#d1d5db' : '#4f46e5')};
  }

  &:active {
    transform: ${({ $disabled }) => ($disabled ? 'none' : 'scale(0.98)')};
  }
`;

const ClearButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: #ef4444;
  border: 1px solid #ef4444;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-top: 8px;

  &:hover {
    background: #fee2e2;
  }
`;

const LoadingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  max-width: 200px;

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  animation: pulse 1.5s ease-in-out infinite;
`;

const ErrorMessage = styled.div`
  padding: 12px 16px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  border-left: 4px solid #ef4444;
  font-size: 14px;
  line-height: 1.5;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 20px;
  text-align: center;
  color: #9e9e9e;
`;

const EmptyIcon = styled.div`
  font-size: 36px;
  margin-bottom: 12px;
  opacity: 0.6;
`;

const EmptyTitle = styled.h3`
  margin: 0 0 6px 0;
  font-size: 15px;
  font-weight: 500;
  color: #6b7280;
`;

const EmptyText = styled.p`
  margin: 0 0 16px 0;
  font-size: 13px;
  line-height: 1.5;
  color: #9ca3af;
`;

const ExampleQueries = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 600px;
`;

const ExampleQuery = styled.button`
  padding: 8px 14px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: #6366f1;
    color: #6366f1;
    background: #f5f3ff;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function AIAnalyticsChat({ className }: AIAnalyticsChatProps) {
  const { messages, loading, error, sendMessage, clearHistory } = useAIAnalytics();
  const [inputValue, setInputValue] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const maxChars = 1000;
  const charCount = inputValue.length;
  const isOverLimit = charCount > maxChars;
  const canSend = inputValue.trim().length > 0 && !isOverLimit && !loading;

  const exampleQueries = [
    'What blocks are performing well?',
    'Show me all harvests from the last 30 days',
    'Which crops have the highest yield?',
    'What tasks are overdue?',
    'Show me farms with active alerts',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!canSend) return;

    await sendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExampleClick = (query: string) => {
    setInputValue(query);
  };

  const toggleSection = (messageId: string, section: string) => {
    const key = `${messageId}-${section}`;
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const renderAIResponse = (message: ChatMessage) => {
    if (!message.response) return null;

    const { query, results, report, metadata } = message.response;

    return (
      <AIResponseContainer>
        {/* Summary */}
        <ResponseSection>
          <SectionTitle>Summary</SectionTitle>
          <SummaryText>{report.summary}</SummaryText>
        </ResponseSection>

        {/* Insights */}
        {report.insights.length > 0 && (
          <ResponseSection>
            <SectionTitle>Key Insights</SectionTitle>
            <InsightsList>
              {report.insights.map((insight, idx) => (
                <li key={idx}>{insight}</li>
              ))}
            </InsightsList>
          </ResponseSection>
        )}

        {/* Statistics */}
        {Object.keys(report.statistics).length > 0 && (
          <ResponseSection>
            <SectionTitle>Statistics</SectionTitle>
            <StatsGrid>
              {Object.entries(report.statistics).map(([key, value]) => (
                <StatCard key={key}>
                  <StatLabel>{key}</StatLabel>
                  <StatValue>{typeof value === 'number' ? value.toFixed(2) : String(value)}</StatValue>
                </StatCard>
              ))}
            </StatsGrid>
          </ResponseSection>
        )}

        {/* Query Explanation (Collapsible) */}
        <ResponseSection>
          <CollapsibleSection>
            <CollapsibleHeader
              $isOpen={expandedSections[`${message.id}-query`] || false}
              onClick={() => toggleSection(message.id, 'query')}
            >
              Query Explanation
            </CollapsibleHeader>
            <CollapsibleContent $isOpen={expandedSections[`${message.id}-query`] || false}>
              <CollapsibleInner>
                <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: '1.5' }}>{query.explanation}</p>
                <div style={{ fontSize: '12px', color: '#9e9e9e', marginBottom: '8px' }}>
                  <strong>Collection:</strong> {query.collection}
                </div>
                <CodeBlock>{JSON.stringify(query.pipeline, null, 2)}</CodeBlock>
              </CollapsibleInner>
            </CollapsibleContent>
          </CollapsibleSection>
        </ResponseSection>

        {/* Results Preview (Collapsible) */}
        {results.length > 0 && (
          <ResponseSection>
            <CollapsibleSection>
              <CollapsibleHeader
                $isOpen={expandedSections[`${message.id}-results`] || false}
                onClick={() => toggleSection(message.id, 'results')}
              >
                Results ({results.length} {results.length === 1 ? 'item' : 'items'})
              </CollapsibleHeader>
              <CollapsibleContent $isOpen={expandedSections[`${message.id}-results`] || false}>
                <CollapsibleInner>
                  <ResultsTable>
                    <Table>
                      <thead>
                        <tr>
                          {results.length > 0 &&
                            Object.keys(results[0]).map((key) => <TableHeader key={key}>{key}</TableHeader>)}
                        </tr>
                      </thead>
                      <tbody>
                        {results.slice(0, 5).map((result, idx) => (
                          <tr key={idx}>
                            {Object.values(result).map((value, cellIdx) => (
                              <TableCell key={cellIdx}>{JSON.stringify(value)}</TableCell>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </ResultsTable>
                  {results.length > 5 && (
                    <div style={{ padding: '8px', textAlign: 'center', fontSize: '12px', color: '#9e9e9e' }}>
                      Showing first 5 of {results.length} results
                    </div>
                  )}
                </CollapsibleInner>
              </CollapsibleContent>
            </CollapsibleSection>
          </ResponseSection>
        )}

        {/* Metadata */}
        <ResponseSection>
          <MetadataFooter>
            <MetadataItem>
              <strong>Cost:</strong> <CostBadge>{formatCost(metadata.cost.total_cost_usd)}</CostBadge>
            </MetadataItem>
            <MetadataItem>
              <strong>Cache:</strong> <CacheBadge $hit={metadata.cache_hit}>{metadata.cache_hit ? 'HIT' : 'MISS'}</CacheBadge>
            </MetadataItem>
            <MetadataItem>
              <strong>Time:</strong> {metadata.execution_time_seconds.toFixed(2)}s
            </MetadataItem>
            <MetadataItem>
              <strong>Results:</strong> {metadata.result_count}
            </MetadataItem>
          </MetadataFooter>
        </ResponseSection>
      </AIResponseContainer>
    );
  };

  return (
    <ChatContainer className={className}>
      <ChatHeader>
        <ChatTitle>
          <span>AI Analytics</span>
        </ChatTitle>
        <ChatSubtitle>Ask questions in natural language</ChatSubtitle>
      </ChatHeader>

      <MessagesContainer>
        {messages.length === 0 && !loading ? (
          <EmptyState>
            <EmptyTitle>Try asking:</EmptyTitle>
            <ExampleQueries>
              {exampleQueries.map((query, idx) => (
                <ExampleQuery key={idx} onClick={() => handleExampleClick(query)}>
                  {query}
                </ExampleQuery>
              ))}
            </ExampleQueries>
          </EmptyState>
        ) : (
          <>
            {messages.map((message) => (
              <MessageWrapper key={message.id} $isUser={message.role === 'user'}>
                {message.role === 'user' ? (
                  <div>
                    <MessageBubble $isUser={true}>
                      {message.content}
                      <MessageTime $isUser={true}>{formatTime(message.timestamp)}</MessageTime>
                    </MessageBubble>
                  </div>
                ) : (
                  renderAIResponse(message)
                )}
              </MessageWrapper>
            ))}

            {loading && (
              <MessageWrapper $isUser={false}>
                <LoadingIndicator>
                  <div>Analyzing...</div>
                </LoadingIndicator>
              </MessageWrapper>
            )}

            {error && (
              <MessageWrapper $isUser={false}>
                <ErrorMessage>{error.message}</ErrorMessage>
              </MessageWrapper>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </MessagesContainer>

      <InputContainer>
        <InputWrapper>
          <div style={{ flex: 1 }}>
            <TextArea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask a question about your farm data..."
              disabled={loading}
            />
            <CharCount $isOver={isOverLimit}>
              {charCount} / {maxChars}
            </CharCount>
          </div>
          <SendButton $disabled={!canSend} onClick={handleSend} disabled={!canSend}>
            Send
          </SendButton>
        </InputWrapper>
        {messages.length > 0 && <ClearButton onClick={clearHistory}>Clear History</ClearButton>}
      </InputContainer>
    </ChatContainer>
  );
}
