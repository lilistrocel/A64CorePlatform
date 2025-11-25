/**
 * AIAnalytics Page
 *
 * Clean, full-screen AI chat interface for farm analytics.
 * Maximizes chat area with minimal chrome.
 */

import styled from 'styled-components';
import { AIAnalyticsChat } from '../../components/ai/AIAnalyticsChat';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  padding: 12px;
  background: #f5f5f5;

  @media (max-width: 768px) {
    padding: 8px;
  }
`;

const ChatWrapper = styled.div`
  flex: 1;
  display: flex;
  min-height: 0;
`;

const StyledChat = styled(AIAnalyticsChat)`
  width: 100%;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function AIAnalytics() {
  return (
    <PageContainer>
      <ChatWrapper>
        <StyledChat />
      </ChatWrapper>
    </PageContainer>
  );
}
