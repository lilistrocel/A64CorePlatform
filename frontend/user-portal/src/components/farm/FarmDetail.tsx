/**
 * FarmDetail Component
 *
 * Displays detailed information about a farm with tabs for different views.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { BlockGrid } from './BlockGrid';
import { CreateBlockModal } from './CreateBlockModal';
import { EditBlockModal } from './EditBlockModal';
import { EditFarmBoundaryModal } from './EditFarmBoundaryModal';
import { FarmHistoryTab } from './FarmHistoryTab';
import { FarmMapView } from './FarmMapView';
import { AgriDataTab, SensorFusionTab } from './weather';
import { farmApi } from '../../services/farmApi';
import type { Farm, FarmSummary, Block, BlockCreate, BlockUpdate, FarmUpdate } from '../../types/farm';

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
  color: #3B82F6;
  border: 1px solid #3B82F6;
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

const FarmIcon = styled.div`
  font-size: 48px;
  margin-bottom: 12px;
`;

const FarmTitle = styled.h1`
  font-size: 36px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const Location = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: #616161;
`;

const StatusBadge = styled.span<{ $isActive: boolean }>`
  display: inline-block;
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 500;
  background: ${({ $isActive }) => ($isActive ? '#10B981' : '#6B7280')};
  color: white;
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
  color: ${({ $active }) => ($active ? '#3B82F6' : '#616161')};
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? '#3B82F6' : 'transparent')};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: #f5f5f5;
    color: #3B82F6;
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
  border-top-color: #3B82F6;
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
  background: #FEE2E2;
  border: 1px solid #EF4444;
  border-radius: 8px;
  color: #EF4444;
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

type TabType = 'overview' | 'blocks' | 'map' | 'plantings' | 'statistics' | 'history' | 'agridata' | 'sensors';

export function FarmDetail() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  const [farm, setFarm] = useState<Farm | null>(null);
  const [summary, setSummary] = useState<FarmSummary | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [showBoundaryModal, setShowBoundaryModal] = useState(false);

  useEffect(() => {
    if (farmId) {
      loadFarmData();
    }
  }, [farmId]);

  const loadFarmData = async () => {
    if (!farmId) return;

    try {
      setLoading(true);
      setError(null);

      const [farmData, summaryData, blocksData] = await Promise.all([
        farmApi.getFarm(farmId),
        farmApi.getFarmSummary(farmId),
        farmApi.getBlocks(farmId),
      ]);

      setFarm(farmData);
      setSummary(summaryData);
      setBlocks(blocksData);
    } catch (err) {
      setError('Failed to load farm details. Please try again.');
      console.error('Error loading farm data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/farm/farms');
  };

  const handleCreateBlock = async (data: Omit<BlockCreate, 'farmId'>) => {
    if (!farmId) return;

    try {
      await farmApi.createBlock(farmId, data);
      await loadFarmData(); // Reload to get updated data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create block';
      alert(errorMessage);
      throw err; // Re-throw to let modal handle it
    }
  };

  const handleUpdateBlock = async (blockId: string, data: BlockUpdate) => {
    if (!farmId) return;

    try {
      await farmApi.updateBlock(farmId, blockId, data);
      await loadFarmData(); // Reload to get updated data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update block';
      alert(errorMessage);
      throw err; // Re-throw to let modal handle it
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!farmId) return;

    try {
      await farmApi.deleteBlock(farmId, blockId);
      loadFarmData(); // Reload to get updated data
    } catch (err) {
      alert('Failed to delete block. Please try again.');
      console.error('Error deleting block:', err);
    }
  };

  const handleUpdateFarmBoundary = async (farmIdToUpdate: string, data: FarmUpdate) => {
    try {
      await farmApi.updateFarm(farmIdToUpdate, data);
      await loadFarmData(); // Reload to get updated data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update farm boundary';
      alert(errorMessage);
      throw err; // Re-throw to let modal handle it
    }
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

  if (error || !farm || !summary) {
    return (
      <Container>
        <BackButton onClick={handleBack}>
          <span>←</span>
          <span>Back to Farms</span>
        </BackButton>
        <ErrorContainer>{error || 'Farm not found'}</ErrorContainer>
      </Container>
    );
  }

  const locationText = [
    farm.location?.city,
    farm.location?.state,
    farm.location?.country
  ]
    .filter(Boolean)
    .join(', ') || 'No location specified';

  return (
    <Container>
      <BackButton onClick={handleBack}>
        <span>←</span>
        <span>Back to Farms</span>
      </BackButton>

      <Header>
        <TitleRow>
          <TitleSection>
            <FarmIcon>🏞️</FarmIcon>
            <FarmTitle>{farm.name}</FarmTitle>
            <Location>
              <span>📍</span>
              <span>{locationText}</span>
            </Location>
          </TitleSection>
          <StatusBadge $isActive={farm.isActive}>
            {farm.isActive ? 'Active' : 'Inactive'}
          </StatusBadge>
        </TitleRow>

        <StatsGrid>
          <StatCard>
            <StatLabel>Total Area</StatLabel>
            <StatValue>{(farm.totalArea ?? 0).toFixed(1)}</StatValue>
            <StatSubtext>hectares</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>Total Blocks</StatLabel>
            <StatValue>{summary.totalBlocks ?? 0}</StatValue>
            <StatSubtext>{(summary.totalBlockArea ?? 0).toFixed(1)} ha total</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>Active Plantings</StatLabel>
            <StatValue>{summary.activePlantings ?? 0}</StatValue>
            <StatSubtext>{summary.totalPlantedPlants ?? 0} plants</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>Predicted Yield</StatLabel>
            <StatValue>{(summary.predictedYield ?? 0).toFixed(0)}</StatValue>
            <StatSubtext>units expected</StatSubtext>
          </StatCard>
        </StatsGrid>
      </Header>

      <TabsContainer>
        <TabBar>
          <Tab $active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </Tab>
          <Tab $active={activeTab === 'blocks'} onClick={() => setActiveTab('blocks')}>
            Blocks ({summary.totalBlocks})
          </Tab>
          <Tab $active={activeTab === 'map'} onClick={() => setActiveTab('map')}>
            Map
          </Tab>
          <Tab $active={activeTab === 'plantings'} onClick={() => setActiveTab('plantings')}>
            Plantings ({summary.activePlantings})
          </Tab>
          <Tab $active={activeTab === 'statistics'} onClick={() => setActiveTab('statistics')}>
            Statistics
          </Tab>
          <Tab $active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
            History
          </Tab>
          <Tab $active={activeTab === 'agridata'} onClick={() => setActiveTab('agridata')}>
            AgriData
          </Tab>
          <Tab $active={activeTab === 'sensors'} onClick={() => setActiveTab('sensors')}>
            SensorFusion
          </Tab>
        </TabBar>

        <TabContent>
          {activeTab === 'overview' && (
            <OverviewGrid>
              <InfoCard>
                <InfoTitle>Farm Information</InfoTitle>
                <InfoItem>
                  <InfoLabel>Farm ID</InfoLabel>
                  <InfoValue>{farm.farmId?.substring(0, 8) ?? 'N/A'}...</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Manager ID</InfoLabel>
                  <InfoValue>{farm.managerId?.substring(0, 8) ?? 'N/A'}...</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Created</InfoLabel>
                  <InfoValue>{farm.createdAt ? farmApi.formatDateForDisplay(farm.createdAt) : 'N/A'}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Last Updated</InfoLabel>
                  <InfoValue>{farm.updatedAt ? farmApi.formatDateForDisplay(farm.updatedAt) : 'N/A'}</InfoValue>
                </InfoItem>
              </InfoCard>

              <InfoCard>
                <InfoTitle>Block Distribution</InfoTitle>
                <InfoItem>
                  <InfoLabel>🏗️ Empty</InfoLabel>
                  <InfoValue>{summary.blocksByState.empty}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>📋 Planned</InfoLabel>
                  <InfoValue>{summary.blocksByState.planned}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>🌱 Planted</InfoLabel>
                  <InfoValue>{summary.blocksByState.planted}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>🌾 Harvesting</InfoLabel>
                  <InfoValue>{summary.blocksByState.harvesting}</InfoValue>
                </InfoItem>
                {summary.blocksByState.alert > 0 && (
                  <InfoItem>
                    <InfoLabel>⚠️ Alert</InfoLabel>
                    <InfoValue>{summary.blocksByState.alert}</InfoValue>
                  </InfoItem>
                )}
              </InfoCard>
            </OverviewGrid>
          )}

          {activeTab === 'blocks' && (
            <BlockGrid
              blocks={blocks}
              farmId={farmId!}
              onCreateBlock={() => setShowCreateModal(true)}
              onEditBlock={(blockId) => {
                const block = blocks.find((b) => b.blockId === blockId);
                if (block) setEditingBlock(block);
              }}
              onDeleteBlock={handleDeleteBlock}
              onRefresh={loadFarmData}
            />
          )}

          {activeTab === 'map' && (
            <FarmMapView
              farm={farm}
              blocks={blocks}
              onBlockClick={(block) => {
                // Navigate to blocks tab and highlight the block
                setActiveTab('blocks');
                setEditingBlock(block);
              }}
              onEditFarmBoundary={() => setShowBoundaryModal(true)}
              height="600px"
            />
          )}

          {activeTab === 'plantings' && (
            <div>Plantings view - Coming soon</div>
          )}

          {activeTab === 'statistics' && (
            <div>Statistics view - Coming soon</div>
          )}

          {activeTab === 'history' && farmId && (
            <FarmHistoryTab farmId={farmId} />
          )}

          {activeTab === 'agridata' && farm && (
            <AgriDataTab farm={farm} />
          )}

          {activeTab === 'sensors' && farm && (
            <SensorFusionTab farm={farm} />
          )}
        </TabContent>
      </TabsContainer>

      {/* Create Block Modal */}
      {showCreateModal && farmId && (
        <CreateBlockModal
          farmId={farmId}
          farmBoundary={farm?.boundary}
          farmLocation={farm?.location}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateBlock}
        />
      )}

      {/* Edit Block Modal */}
      {editingBlock && farmId && (
        <EditBlockModal
          block={editingBlock}
          farmId={farmId}
          farmBoundary={farm?.boundary}
          farmLocation={farm?.location}
          onClose={() => setEditingBlock(null)}
          onUpdate={handleUpdateBlock}
        />
      )}

      {/* Edit Farm Boundary Modal */}
      {showBoundaryModal && farm && (
        <EditFarmBoundaryModal
          farm={farm}
          onClose={() => setShowBoundaryModal(false)}
          onUpdate={handleUpdateFarmBoundary}
        />
      )}
    </Container>
  );
}
