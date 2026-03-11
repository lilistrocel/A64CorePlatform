/**
 * AIAnalytics Page
 *
 * Multi-level AI monitoring page with scope selector.
 * Fetches farm list on mount and passes it down to the chat component.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { AIAnalyticsChat } from '../../components/ai/AIAnalyticsChat';
import { getFarms } from '../../services/farmApi';
import type { AIScope } from '../../types/farmAI';

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

// ============================================================================
// COMPONENT
// ============================================================================

export function AIAnalytics() {
  const [farms, setFarms] = useState<Array<{ farmId: string; name: string }>>([]);
  const [scope, setScope] = useState<AIScope>({ level: 'global' });

  useEffect(() => {
    getFarms().then(data => {
      // getFarms returns { items, total, page, perPage, totalPages }
      const farmList = (data.items || []).map((f: any) => ({
        farmId: f.farmId,
        name: f.name,
      }));
      setFarms(farmList);
    }).catch(console.error);
  }, []);

  return (
    <PageContainer>
      <ChatWrapper>
        <AIAnalyticsChat
          farms={farms}
          scope={scope}
          onScopeChange={setScope}
        />
      </ChatWrapper>
    </PageContainer>
  );
}
