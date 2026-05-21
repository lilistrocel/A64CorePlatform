/**
 * BlockDetail Component
 *
 * Displays detailed information about a block with tabs for different views.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import { queryKeys } from '../../config/react-query.config';
import { Breadcrumb } from '@a64core/shared';
import type { BreadcrumbItem } from '@a64core/shared';
import type { Block, BlockSummary } from '../../types/farm';
import { formatNumber, formatPercentage } from '../../utils';

// Import tab components
import { BlockAlertsTab } from './BlockAlertsTab';
import { BlockAutomationTab } from './BlockAutomationTab';
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
  color: #0F6E56;
  border: 1px solid #0F6E56;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-bottom: 24px;

  &:hover {
    background: rgba(15, 110, 86, 0.05);
  }
`;

const Header = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
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
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 8px 0;
`;

const BlockMeta = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
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
        return '#4B4844';
      case 'planted':
        return '#0F6E56';
      case 'growing':
        return '#0F6E56';
      case 'fruiting':
        return '#B8842A';
      case 'harvesting':
        return '#B8842A';
      case 'cleaning':
        return '#0F6E56';
      case 'alert':
        return '#9E2A2A';
      default:
        return '#4B4844';
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
  border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const StatCard = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.tertiary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const StatValue = styled.span`
  font-size: 32px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const StatSubtext = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 4px;
`;

const TabsContainer = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.border.subtle};
    border-radius: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 16px 24px;
  background: ${({ $active, theme }) => ($active ? theme.colors.surface.canvas : 'transparent')};
  color: ${({ $active }) => ($active ? '#0F6E56' : 'inherit')};
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? '#0F6E56' : 'transparent')};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: #0F6E56;
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
  border: 4px solid ${({ theme }) => theme.colors.border.subtle};
  border-top-color: #0F6E56;
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
  background: ${({ theme }) => theme.colors.status.danger};
  border: 1px solid ${({ theme }) => theme.colors.status.danger};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.status.danger};
  text-align: center;
  margin-top: 24px;
`;

const OverviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
`;

const InfoCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 8px;
  padding: 20px;
`;

const InfoTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 16px 0;
`;

const InfoItem = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const InfoValue = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

// Multi-crop styled components
const AreaBudgetSection = styled.div`
  background: ${({ theme }) => theme.colors.surface.sunken};
  border: 1px solid ${({ theme }) => theme.colors.accent.sage};
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
`;

const AreaBudgetTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.accent.sageDeep};
  margin: 0 0 12px 0;
`;

const AreaBudgetBar = styled.div<{ $used: number; $total: number }>`
  width: 100%;
  height: 24px;
  background: ${({ theme }) => theme.colors.border.subtle};
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
    background: #0F6E56;
    transition: width 300ms ease-in-out;
  }
`;

const AreaBudgetText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-align: center;
  margin-bottom: 12px;
`;

const AddCropButton = styled.button`
  width: 100%;
  padding: 12px;
  background: #0F6E56;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #0F6E56;
  }
`;

const VirtualChildrenSection = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 16px 0;
`;

const VirtualChildCard = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.border.subtle};
  }

  span {
    font-size: 14px;
    color: ${({ theme }) => theme.colors.text.primary};

    &:first-child {
      font-weight: 600;
      color: #0F6E56;
    }
  }
`;

const VirtualBlockInfo = styled.div`
  background: ${({ theme }) => theme.colors.surface.sunken};
  border: 1px solid ${({ theme }) => theme.colors.accent.sageDeep};
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
`;

const VirtualBadge = styled.span`
  display: inline-block;
  background: ${({ theme }) => theme.colors.surface.sunken};
  color: ${({ theme }) => theme.colors.accent.sageDeep};
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid ${({ theme }) => theme.colors.accent.sageDeep};
  margin-left: 12px;
`;

const EmptyVirtualButton = styled.button`
  margin-top: 16px;
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.status.danger};
  color: ${({ theme }) => theme.colors.status.danger};
  border: 1px solid ${({ theme }) => theme.colors.status.danger};
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  width: 100%;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.sunken};
    border-color: ${({ theme }) => theme.colors.status.danger};
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

type TabType = 'overview' | 'alerts' | 'automation' | 'harvests' | 'archives';

export function BlockDetail() {
  const { farmId, blockId } = useParams<{ farmId: string; blockId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  // Breadcrumb items for navigation
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Farms', path: '/farm/farms', icon: '🏞️' },
    { label: block?.farmName || 'Farm', path: `/farm/farms/${farmId}` },
    { label: block?.name || block?.blockCode || 'Block Details', icon: '🌾' },
  ];

  if (error || !block || !summary) {
    return (
      <Container>
        <Breadcrumb items={[
          { label: 'Dashboard', path: '/dashboard', icon: '📊' },
          { label: 'Farms', path: '/farm/farms', icon: '🏞️' },
          { label: 'Farm', path: `/farm/farms/${farmId}` },
          { label: 'Error' },
        ]} />
        <ErrorContainer>{error || 'Block not found'}</ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Breadcrumb items={breadcrumbItems} />

      <Header>
        <TitleRow>
          <TitleSection>
            <BlockTitle>
              {block.name || block.blockCode}
              {block.blockCategory === 'virtual' && <VirtualBadge>Virtual</VirtualBadge>}
            </BlockTitle>
            <BlockMeta>
              <span>Block ID: {block.blockId.substring(0, 8)}...</span>
              <span>•</span>
              <span>{formatNumber(block.area ?? 0, { decimals: 2 })} m²</span>
              {block.targetCropName && (
                <>
                  <span>•</span>
                  <span style={{ fontWeight: 600, color: '#0F6E56' }}>🌱 {block.targetCropName}</span>
                </>
              )}
            </BlockMeta>
          </TitleSection>
          <StatusBadge $status={block.state}>{block.state}</StatusBadge>
        </TitleRow>

        <StatsGrid>
          <StatCard>
            <StatLabel>Capacity</StatLabel>
            <StatValue>{formatNumber(block.maxPlants)}</StatValue>
            <StatSubtext>max plants</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>Current Plants</StatLabel>
            <StatValue>{formatNumber(summary.currentPlantCount ?? 0)}</StatValue>
            <StatSubtext>
              {formatPercentage(summary.utilizationPercent ?? 0, 0)} utilized
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
              <StatValue style={{ fontSize: '20px' }}>{formatNumber(summary.currentPlanting.plantCount)}</StatValue>
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
          <Tab $active={activeTab === 'automation'} onClick={() => setActiveTab('automation')}>
            Automation
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
                    {formatNumber(block.availableArea ?? 0, { decimals: 2 })} m² available of {formatNumber(block.area ?? 0, { decimals: 2 })} m² total
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
                      <span>{child.name || child.blockCode}</span>
                      <span>{child.targetCropName || 'No crop'}</span>
                      <span>{child.allocatedArea ? `${formatNumber(child.allocatedArea, { decimals: 2 })} m²` : 'N/A'}</span>
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
                      style={{ color: '#0F6E56', cursor: 'pointer' }}
                      onClick={() => block.parentBlockId && navigate(`/farm/farms/${farmId}/blocks/${block.parentBlockId}`)}
                    >
                      {block.parentBlockId ? 'View Parent Block →' : 'Unknown'}
                    </InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Allocated Area</InfoLabel>
                    <InfoValue>{block.allocatedArea ? `${formatNumber(block.allocatedArea, { decimals: 2 })} m²` : 'N/A'}</InfoValue>
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
                  <InfoValue>{formatNumber(block.area ?? 0, { decimals: 2 })} hectares</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Max Plants</InfoLabel>
                  <InfoValue>{formatNumber(block.maxPlants)}</InfoValue>
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
                    <InfoValue>{formatNumber(summary.currentPlanting.plantCount)}</InfoValue>
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
                    <InfoValue>{formatNumber(summary.predictedYieldKg ?? 0, { decimals: 1 })} kg</InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Actual Yield</InfoLabel>
                    <InfoValue>{formatNumber(summary.actualYieldKg ?? 0, { decimals: 1 })} kg</InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Yield Efficiency</InfoLabel>
                    <InfoValue style={{ color: (summary.yieldEfficiencyPercent ?? 0) >= 80 ? '#0F6E56' : (summary.yieldEfficiencyPercent ?? 0) >= 50 ? '#B8842A' : '#9E2A2A' }}>
                      {formatPercentage(summary.yieldEfficiencyPercent ?? 0, 1)}
                    </InfoValue>
                  </InfoItem>
                  {block.plantedDate && (
                    <InfoItem>
                      <InfoLabel>Days Since Planting</InfoLabel>
                      <InfoValue>
                        {formatNumber(Math.floor((new Date().getTime() - new Date(block.plantedDate).getTime()) / (1000 * 60 * 60 * 24)))} days
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

          {activeTab === 'automation' && farmId && blockId && (
            <BlockAutomationTab farmId={farmId} blockId={blockId} />
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
              // Wipe the farm subtree from the cache so FarmDetail re-mounts
              // with no stale data to serve. The QueryClient is configured with
              // `refetchOnMount: false`, so plain `invalidateQueries` only marks
              // the cache stale without forcing a refetch on remount; the
              // deleted virtual block would keep showing until staleTime (30s)
              // expired or another observer kicked off a refetch. `removeQueries`
              // forces FarmDetail's useQuery hooks to do a clean fetch.
              if (farmId) {
                queryClient.removeQueries({ queryKey: queryKeys.farms.detail(farmId) });
              }
              // Navigate back to farm since block will be deleted
              navigate(`/farm/farms/${farmId}`);
            }}
          />
        </>
      )}
    </Container>
  );
}
