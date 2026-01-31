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
import { AddVirtualCropModal } from './AddVirtualCropModal';
import { EmptyVirtualBlockModal } from './EmptyVirtualBlockModal';

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

// Multi-crop styled components
const AreaBudgetSection = styled.div`
  background: #f5f9ff;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
`;

const AreaBudgetTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1976d2;
  margin: 0 0 12px 0;
`;

const AreaBudgetBar = styled.div<{ $used: number; $total: number }>`
  width: 100%;
  height: 24px;
  background: #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: ${({ $used, $total }) => ($total > 0 ? ($used / $total) * 100 : 0)}%;
    background: linear-gradient(90deg, #3b82f6, #1976d2);
    transition: width 300ms ease-in-out;
  }
`;

const AreaBudgetText = styled.div`
  font-size: 14px;
  color: #616161;
  text-align: center;
  margin-bottom: 12px;
`;

const AddCropButton = styled.button`
  width: 100%;
  padding: 12px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #388e3c;
  }
`;

const VirtualChildrenSection = styled.div`
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid #e0e0e0;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #424242;
  margin: 0 0 16px 0;
`;

const VirtualChildCard = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: #e0e0e0;
  }

  span {
    font-size: 14px;
    color: #212121;

    &:first-child {
      font-weight: 600;
      color: #1976d2;
    }
  }
`;

const VirtualBlockInfo = styled.div`
  background: #e3f2fd;
  border: 1px solid #1976d2;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
`;

const VirtualBadge = styled.span`
  display: inline-block;
  background: #e3f2fd;
  color: #1976d2;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid #1976d2;
  margin-left: 12px;
`;

const EmptyVirtualButton = styled.button`
  margin-top: 16px;
  padding: 10px 16px;
  background: #ffebee;
  color: #c62828;
  border: 1px solid #ef5350;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  width: 100%;

  &:hover {
    background: #ffcdd2;
    border-color: #c62828;
  }
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

  // Multi-crop state
  const [childBlocks, setChildBlocks] = useState<Block[]>([]);
  const [showAddVirtualCropModal, setShowAddVirtualCropModal] = useState(false);
  const [showEmptyVirtualModal, setShowEmptyVirtualModal] = useState(false);

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

      // Load block data (required)
      const blockData = await farmApi.getBlock(farmId, blockId);
      setBlock(blockData);

      // If physical block, load child blocks
      if (blockData.blockCategory === 'physical' || !blockData.blockCategory) {
        try {
          const children = await farmApi.getBlockChildren(farmId, blockId);
          setChildBlocks(children);
        } catch (err) {
          console.error('Error loading child blocks:', err);
          // Not critical, just log it
          setChildBlocks([]);
        }
      }

      // Use block data directly to build summary (most reliable source)
      setSummary({
        blockId: blockData.blockId,
        currentState: blockData.state,
        currentPlantCount: blockData.actualPlantCount || 0,
        maxPlants: blockData.maxPlants,
        utilizationPercent: blockData.actualPlantCount && blockData.maxPlants
          ? (blockData.actualPlantCount / blockData.maxPlants) * 100
          : 0,
        currentPlanting: blockData.targetCrop ? {
          plantingId: blockData.targetCrop,
          plantCount: blockData.actualPlantCount || 0,
          plantedDate: blockData.plantedDate,
          estimatedHarvestDate: blockData.expectedHarvestDate,
        } : null,
        predictedYieldKg: blockData.kpi?.predictedYieldKg || 0,
        actualYieldKg: blockData.kpi?.actualYieldKg || 0,
        yieldEfficiencyPercent: blockData.kpi?.yieldEfficiencyPercent || 0,
      });
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
            <BlockTitle>
              {block.blockCode || block.name}
              {block.blockCategory === 'virtual' && <VirtualBadge>Virtual</VirtualBadge>}
            </BlockTitle>
            <BlockMeta>
              <span>Block ID: {block.blockId.substring(0, 8)}...</span>
              <span>•</span>
              <span>{(block.area ?? 0).toFixed(1)} m²</span>
              {block.targetCropName && (
                <>
                  <span>•</span>
                  <span style={{ fontWeight: 600, color: '#4CAF50' }}>🌱 {block.targetCropName}</span>
                </>
              )}
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
            <>
              {/* Multi-crop area budget section for physical blocks - only show when block is NOT empty */}
              {block.blockCategory !== 'virtual' && block.state !== 'empty' && (block.availableArea ?? 0) > 0 && (
                <AreaBudgetSection>
                  <AreaBudgetTitle>Multi-Crop Area Budget</AreaBudgetTitle>
                  <AreaBudgetBar
                    $used={(block.area ?? 0) - (block.availableArea ?? 0)}
                    $total={block.area ?? 0}
                  />
                  <AreaBudgetText>
                    {block.availableArea?.toFixed(2)} m² available of {block.area?.toFixed(2)} m² total
                  </AreaBudgetText>
                  <AddCropButton onClick={() => setShowAddVirtualCropModal(true)}>
                    + Add Additional Crop
                  </AddCropButton>
                </AreaBudgetSection>
              )}

              {/* Virtual children section for physical blocks */}
              {block.blockCategory !== 'virtual' && childBlocks.length > 0 && (
                <VirtualChildrenSection>
                  <SectionTitle>Active Virtual Crops ({childBlocks.length})</SectionTitle>
                  {childBlocks.map((child) => (
                    <VirtualChildCard
                      key={child.blockId}
                      onClick={() => navigate(`/farm/farms/${farmId}/blocks/${child.blockId}`)}
                    >
                      <span>{child.blockCode || child.name}</span>
                      <span>{child.targetCropName || 'No crop'}</span>
                      <span>{child.allocatedArea ? `${child.allocatedArea} m²` : 'N/A'}</span>
                      <span>{child.state}</span>
                    </VirtualChildCard>
                  ))}
                </VirtualChildrenSection>
              )}

              {/* Virtual block info section */}
              {block.blockCategory === 'virtual' && (
                <VirtualBlockInfo>
                  <InfoTitle>Virtual Block Information</InfoTitle>
                  <InfoItem>
                    <InfoLabel>Parent Block</InfoLabel>
                    <InfoValue
                      style={{ color: '#1976d2', cursor: 'pointer' }}
                      onClick={() => block.parentBlockId && navigate(`/farm/farms/${farmId}/blocks/${block.parentBlockId}`)}
                    >
                      {block.parentBlockId ? 'View Parent Block →' : 'Unknown'}
                    </InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Allocated Area</InfoLabel>
                    <InfoValue>{block.allocatedArea ? `${block.allocatedArea} m²` : 'N/A'}</InfoValue>
                  </InfoItem>
                  <EmptyVirtualButton onClick={() => setShowEmptyVirtualModal(true)}>
                    🗑️ Empty & Delete Virtual Block
                  </EmptyVirtualButton>
                </VirtualBlockInfo>
              )}

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

              {(block.state === 'planted' || block.state === 'growing' || block.state === 'fruiting' || block.state === 'harvesting') && (
                <InfoCard>
                  <InfoTitle>KPI Metrics</InfoTitle>
                  <InfoItem>
                    <InfoLabel>Predicted Yield</InfoLabel>
                    <InfoValue>{(summary.predictedYieldKg ?? 0).toFixed(1)} kg</InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Actual Yield</InfoLabel>
                    <InfoValue>{(summary.actualYieldKg ?? 0).toFixed(1)} kg</InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Yield Efficiency</InfoLabel>
                    <InfoValue style={{ color: (summary.yieldEfficiencyPercent ?? 0) >= 80 ? '#4CAF50' : (summary.yieldEfficiencyPercent ?? 0) >= 50 ? '#FF9800' : '#F44336' }}>
                      {(summary.yieldEfficiencyPercent ?? 0).toFixed(1)}%
                    </InfoValue>
                  </InfoItem>
                  {block.plantedDate && (
                    <InfoItem>
                      <InfoLabel>Days Since Planting</InfoLabel>
                      <InfoValue>
                        {Math.floor((new Date().getTime() - new Date(block.plantedDate).getTime()) / (1000 * 60 * 60 * 24))} days
                      </InfoValue>
                    </InfoItem>
                  )}
                  {block.expectedHarvestDate && (
                    <InfoItem>
                      <InfoLabel>Expected Harvest</InfoLabel>
                      <InfoValue>{farmApi.formatDateForDisplay(block.expectedHarvestDate)}</InfoValue>
                    </InfoItem>
                  )}
                </InfoCard>
              )}
            </OverviewGrid>
            </>
          )}

          {activeTab === 'alerts' && farmId && blockId && (
            <BlockAlertsTab farmId={farmId} blockId={blockId} onRefresh={loadBlockData} />
          )}

          {activeTab === 'harvests' && farmId && blockId && (
            <BlockHarvestsTab
              farmId={farmId}
              blockId={blockId}
              blockCategory={block?.blockCategory}
              parentBlockId={block?.parentBlockId || undefined}
              plantedDate={block?.plantedDate || undefined}
              onRefresh={loadBlockData}
              onNavigateToBlock={(targetBlockId) => navigate(`/farm/farms/${farmId}/blocks/${targetBlockId}`)}
            />
          )}

          {activeTab === 'archives' && farmId && blockId && (
            <BlockArchivesTab farmId={farmId} blockId={blockId} />
          )}
        </TabContent>
      </TabsContainer>

      {/* Multi-crop modals */}
      {block && (
        <>
          <AddVirtualCropModal
            isOpen={showAddVirtualCropModal}
            onClose={() => setShowAddVirtualCropModal(false)}
            block={block}
            onSuccess={() => {
              loadBlockData();
              setShowAddVirtualCropModal(false);
            }}
          />

          <EmptyVirtualBlockModal
            isOpen={showEmptyVirtualModal}
            onClose={() => setShowEmptyVirtualModal(false)}
            block={block}
            onSuccess={() => {
              // Navigate back to farm since block will be deleted
              navigate(`/farm/farms/${farmId}`);
            }}
          />
        </>
      )}
    </Container>
  );
}
