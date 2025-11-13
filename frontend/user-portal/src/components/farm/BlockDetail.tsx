/**
 * BlockDetail Component
 *
 * Displays detailed information about a block with tabs for different views.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { Block, BlockSummary } from '../../types/farm';

// Import tab components
import { BlockAlertsTab } from './BlockAlertsTab';
import { BlockHarvestsTab } from './BlockHarvestsTab';
import { BlockArchivesTab } from './BlockArchivesTab';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  color: #3b82f6;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-bottom: 24px;

  &:hover {
    background: #e3f2fd;
  }
`;

const Header = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  margin-bottom: 32px;
`;

const TitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 16px;
  }
`;

const TitleSection = styled.div``;

const BlockTitle = styled.h1`
  font-size: 36px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const BlockMeta = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 14px;
  color: #616161;
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 500;
  background: ${({ $status }) => {
    switch ($status) {
      case 'empty':
        return '#9E9E9E';
      case 'planted':
        return '#4CAF50';
      case 'growing':
        return '#8BC34A';
      case 'fruiting':
        return '#FF9800';
      case 'harvesting':
        return '#FFC107';
      case 'cleaning':
        return '#03A9F4';
      case 'alert':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  }};
  color: white;
  text-transform: capitalize;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  padding-top: 24px;
  border-top: 1px solid #e0e0e0;
`;

const StatCard = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const StatValue = styled.span`
  font-size: 32px;
  font-weight: 600;
  color: #212121;
`;

const StatSubtext = styled.span`
  font-size: 14px;
  color: #616161;
  margin-top: 4px;
`;

const TabsContainer = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #e0e0e0;
    border-radius: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 16px 24px;
  background: ${({ $active }) => ($active ? 'white' : 'transparent')};
  color: ${({ $active }) => ($active ? '#3b82f6' : '#616161')};
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? '#3b82f6' : 'transparent')};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: #f5f5f5;
    color: #3b82f6;
  }
`;

const TabContent = styled.div`
  padding: 32px;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
`;

const Spinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid #e0e0e0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const ErrorContainer = styled.div`
  padding: 24px;
  background: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  color: #ef4444;
  text-align: center;
  margin-top: 24px;
`;

const OverviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
`;

const InfoCard = styled.div`
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
`;

const InfoTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 16px 0;
`;

const InfoItem = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #e0e0e0;

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  font-size: 14px;
  color: #616161;
`;

const InfoValue = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

// ============================================================================
// COMPONENT
// ============================================================================

type TabType = 'overview' | 'alerts' | 'harvests' | 'archives';

export function BlockDetail() {
  const { farmId, blockId } = useParams<{ farmId: string; blockId: string }>();
  const navigate = useNavigate();

  const [block, setBlock] = useState<Block | null>(null);
  const [summary, setSummary] = useState<BlockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (farmId && blockId) {
      loadBlockData();
    }
  }, [farmId, blockId]);

  const loadBlockData = async () => {
    if (!farmId || !blockId) return;

    try {
      setLoading(true);
      setError(null);

      const [blockData, summaryData] = await Promise.all([
        farmApi.getBlock(farmId, blockId),
        farmApi.getBlockSummary(farmId, blockId),
      ]);

      setBlock(blockData);
      setSummary(summaryData);
    } catch (err) {
      setError('Failed to load block details. Please try again.');
      console.error('Error loading block data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/farm/farms/${farmId}`);
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Spinner />
        </LoadingContainer>
      </Container>
    );
  }

  if (error || !block || !summary) {
    return (
      <Container>
        <BackButton onClick={handleBack}>
          <span>←</span>
          <span>Back to Farm</span>
        </BackButton>
        <ErrorContainer>{error || 'Block not found'}</ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <BackButton onClick={handleBack}>
        <span>←</span>
        <span>Back to Farm</span>
      </BackButton>

      <Header>
        <TitleRow>
          <TitleSection>
            <BlockTitle>{block.name}</BlockTitle>
            <BlockMeta>
              <span>Block ID: {block.blockId.substring(0, 8)}...</span>
              <span>•</span>
              <span>{(block.area ?? 0).toFixed(1)} ha</span>
            </BlockMeta>
          </TitleSection>
          <StatusBadge $status={block.state}>{block.state}</StatusBadge>
        </TitleRow>

        <StatsGrid>
          <StatCard>
            <StatLabel>Capacity</StatLabel>
            <StatValue>{block.maxPlants}</StatValue>
            <StatSubtext>max plants</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>Current Plants</StatLabel>
            <StatValue>{summary.currentPlantCount ?? 0}</StatValue>
            <StatSubtext>
              {summary.utilizationPercent ? `${summary.utilizationPercent.toFixed(0)}% utilized` : '0% utilized'}
            </StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>State</StatLabel>
            <StatValue style={{ fontSize: '20px', textTransform: 'capitalize' }}>{summary.currentState}</StatValue>
            <StatSubtext>current status</StatSubtext>
          </StatCard>

          {summary.currentPlanting && (
            <StatCard>
              <StatLabel>Current Planting</StatLabel>
              <StatValue style={{ fontSize: '20px' }}>{summary.currentPlanting.plantCount}</StatValue>
              <StatSubtext>plants</StatSubtext>
            </StatCard>
          )}
        </StatsGrid>
      </Header>

      <TabsContainer>
        <TabBar>
          <Tab $active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </Tab>
          <Tab $active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')}>
            Alerts
          </Tab>
          <Tab $active={activeTab === 'harvests'} onClick={() => setActiveTab('harvests')}>
            Harvests
          </Tab>
          <Tab $active={activeTab === 'archives'} onClick={() => setActiveTab('archives')}>
            Archives
          </Tab>
        </TabBar>

        <TabContent>
          {activeTab === 'overview' && (
            <OverviewGrid>
              <InfoCard>
                <InfoTitle>Block Information</InfoTitle>
                <InfoItem>
                  <InfoLabel>Block ID</InfoLabel>
                  <InfoValue>{block.blockId.substring(0, 8)}...</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Farm ID</InfoLabel>
                  <InfoValue>{block.farmId.substring(0, 8)}...</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Area</InfoLabel>
                  <InfoValue>{(block.area ?? 0).toFixed(1)} hectares</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Max Plants</InfoLabel>
                  <InfoValue>{block.maxPlants}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Created</InfoLabel>
                  <InfoValue>{farmApi.formatDateForDisplay(block.createdAt)}</InfoValue>
                </InfoItem>
              </InfoCard>

              {summary.currentPlanting && (
                <InfoCard>
                  <InfoTitle>Current Planting</InfoTitle>
                  <InfoItem>
                    <InfoLabel>Plant Count</InfoLabel>
                    <InfoValue>{summary.currentPlanting.plantCount}</InfoValue>
                  </InfoItem>
                  {summary.currentPlanting.plantedDate && (
                    <InfoItem>
                      <InfoLabel>Planted Date</InfoLabel>
                      <InfoValue>{farmApi.formatDateForDisplay(summary.currentPlanting.plantedDate)}</InfoValue>
                    </InfoItem>
                  )}
                  {summary.currentPlanting.estimatedHarvestDate && (
                    <InfoItem>
                      <InfoLabel>Est. Harvest</InfoLabel>
                      <InfoValue>
                        {farmApi.formatDateForDisplay(summary.currentPlanting.estimatedHarvestDate)}
                      </InfoValue>
                    </InfoItem>
                  )}
                </InfoCard>
              )}
            </OverviewGrid>
          )}

          {activeTab === 'alerts' && farmId && blockId && (
            <BlockAlertsTab farmId={farmId} blockId={blockId} onRefresh={loadBlockData} />
          )}

          {activeTab === 'harvests' && farmId && blockId && (
            <BlockHarvestsTab farmId={farmId} blockId={blockId} onRefresh={loadBlockData} />
          )}

          {activeTab === 'archives' && farmId && blockId && (
            <BlockArchivesTab farmId={farmId} blockId={blockId} />
          )}
        </TabContent>
      </TabsContainer>
    </Container>
  );
}
