/**
 * BlockDetail Component
 *
 * Displays detailed information about a block with tabs for different views.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import styled, { useTheme } from 'styled-components';
import { Trash2, Sprout, ArrowRight } from 'lucide-react';
import { farmApi } from '../../services/farmApi';
import { queryKeys } from '../../config/react-query.config';
import { Breadcrumb, glassPanel, monoLabel, phaseBadge } from '@a64core/shared';
import type { BreadcrumbItem } from '@a64core/shared';
import type { Block, BlockSummary, BlockState } from '../../types/farm';
import { BLOCK_STATE_PHASE_KEYS } from '../../types/farm';
import { formatNumber, formatPercentage } from '../../utils';

// Import tab components
import { BlockAlertsTab } from './BlockAlertsTab';
import { BlockAutomationTab } from './BlockAutomationTab';
import { BlockHarvestsTab } from './BlockHarvestsTab';
import { BlockArchivesTab } from './BlockArchivesTab';
import { AddVirtualCropModal } from './AddVirtualCropModal';
import { EmptyVirtualBlockModal } from './EmptyVirtualBlockModal';
import { BlockAnalyticsModal } from './BlockAnalyticsModal';

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
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-bottom: 24px;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Header = styled.div`
  ${glassPanel}
  padding: 32px;
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
  display: flex;
  align-items: center;
  font-size: 36px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const BlockMeta = styled.div`
  ${monoLabel}
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

// The §4 badge pattern via the shared phaseBadge mixin.
const StatusBadge = styled.span<{ $status: BlockState }>`
  ${({ $status }) => phaseBadge(BLOCK_STATE_PHASE_KEYS[$status] ?? 'empty')}
  padding: 8px 16px;
  font-size: 0.78rem;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  padding-top: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const StatCard = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

// Cream-hi, not gold — up to 4 of these render simultaneously and gold is
// budgeted at <=4 elements per view (spec §3); the active tab underline
// below is this view's gold-for-navigation element instead.
const StatValue = styled.span`
  font-size: 32px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatSubtext = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`;

const TabsContainer = styled.div`
  ${glassPanel}
  overflow: hidden;
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.cosmosHi};
    border-radius: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 16px 24px;
  background: transparent;
  color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.muted)};
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : 'transparent')};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.textPrimary)};
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
  border: 4px solid ${({ theme }) => theme.colors.glass.border};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
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
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.bright.coral};
  text-align: center;
  margin-top: 24px;
`;

const OverviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
`;

const InfoCard = styled.div`
  ${glassPanel}
  padding: 20px;
`;

const InfoTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px 0;
`;

const InfoItem = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoValue = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Multi-crop styled components
const AreaBudgetSection = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid rgba(107, 138, 224, 0.35);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 24px;
`;

const AreaBudgetTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onDark};
  margin: 0 0 12px 0;
`;

const AreaBudgetBar = styled.div<{ $used: number; $total: number }>`
  width: 100%;
  height: 24px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 99px;
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
    background: ${({ theme }) => `linear-gradient(90deg, ${theme.colors.bright.lapis}, ${theme.colors.primary[600]})`};
    transition: width 300ms ease-in-out;
  }
`;

const AreaBudgetText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.onDark};
  text-align: center;
  margin-bottom: 12px;
`;

// This tab's one gold-gradient CTA (spec §3) — mutually exclusive with
// EmptyVirtualButton below (physical vs. virtual block).
const AddCropButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

const VirtualChildrenSection = styled.div`
  ${glassPanel}
  padding: 20px;
  margin-bottom: 24px;
`;

const SectionTitle = styled.h3`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 16px 0;
`;

const VirtualChildCard = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: rgba(180, 200, 220, 0.1);
    border-color: ${({ theme }) => theme.colors.celeste};
  }

  span {
    font-size: 14px;
    color: ${({ theme }) => theme.colors.textPrimary};

    &:first-child {
      font-weight: 700;
      color: ${({ theme }) => theme.colors.bright.lapis};
    }
  }
`;

const VirtualBlockInfo = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid rgba(107, 138, 224, 0.4);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 24px;
`;

const VirtualBadge = styled.span`
  ${monoLabel}
  display: inline-block;
  background: rgba(107, 138, 224, 0.16);
  color: ${({ theme }) => theme.colors.bright.lapis};
  font-size: 0.6rem;
  padding: 4px 12px;
  border-radius: 99px;
  border: 1px solid rgba(107, 138, 224, 0.45);
  margin-left: 12px;
`;

// Destructive: coral-tinted glass, never solid red (spec §4 "Buttons").
const EmptyVirtualButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 16px;
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  width: 100%;

  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
`;

// Plant-data staleness banner — extrapolates "pending / awaiting action"
// (spec §5.2 → fruitingInit/terra), not gold-b/warning: gold stays reserved
// for the literal Harvesting phase and this view's one CTA (spec §3).
const StaleBanner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  background: rgba(232, 147, 95, 0.12);
  border: 1px solid rgba(232, 147, 95, 0.4);
  border-radius: 10px;
  margin-bottom: 24px;
`;

const StaleBannerText = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.onDark};
  line-height: 1.5;
`;

const StaleLockNote = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bright.terra};
  font-style: italic;
`;

const UpdatePlantDataButton = styled.button<{ $loading: boolean }>`
  align-self: flex-start;
  padding: 8px 16px;
  background: rgba(232, 147, 95, 0.2);
  color: ${({ theme }) => theme.colors.bright.terra};
  border: 1px solid rgba(232, 147, 95, 0.5);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: ${({ $loading }) => ($loading ? 'not-allowed' : 'pointer')};
  transition: background 150ms ease-in-out;
  opacity: ${({ $loading }) => ($loading ? 0.7 : 1)};

  &:hover:not(:disabled) {
    background: rgba(232, 147, 95, 0.32);
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

type TabType = 'overview' | 'alerts' | 'automation' | 'harvests' | 'archives';

export function BlockDetail() {
  const theme = useTheme();
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
  // Virtual child block whose analytics ("Stats") modal is open, mirroring the
  // dashboard virtual block card. Clicking a child opens this instead of navigating.
  const [analyticsBlockId, setAnalyticsBlockId] = useState<string | null>(null);

  // Plant-data version refresh
  const [refreshingPlantData, setRefreshingPlantData] = useState(false);
  const [refreshPlantDataError, setRefreshPlantDataError] = useState<string | null>(null);

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
      // Capacity utilization is area-based: (area - availableArea) / area * 100
      const totalArea = blockData.area || 0;
      const availableArea = blockData.availableArea ?? totalArea;
      const usedArea = totalArea - availableArea;
      const areaUtilizationPercent = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

      setSummary({
        blockId: blockData.blockId,
        currentState: blockData.state,
        currentPlantCount: blockData.actualPlantCount || 0,
        utilizationPercent: areaUtilizationPercent,
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

  const handleRefreshPlantData = async () => {
    if (!farmId || !blockId) return;
    setRefreshingPlantData(true);
    setRefreshPlantDataError(null);
    try {
      await farmApi.refreshPlantData(farmId, blockId);
      // Re-load the block to pick up the updated snapshot and reset staleness flag.
      await loadBlockData();
    } catch (err: unknown) {
      // Surface the error without crashing. A 409 means the server denied the
      // update (e.g., block is post-harvest). Show a human-readable message.
      let message = 'Failed to update plant data. Please try again.';
      if (
        err !== null &&
        typeof err === 'object' &&
        'response' in err &&
        err.response !== null &&
        typeof err.response === 'object' &&
        'status' in err.response &&
        err.response.status === 409
      ) {
        message = 'Update not allowed: this block cannot be updated in its current state.';
      }
      setRefreshPlantDataError(message);
    } finally {
      setRefreshingPlantData(false);
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

  // Breadcrumb items for navigation. The shared Breadcrumb component's `icon`
  // prop is typed as a plain string (rendered as text) — out of this shard's
  // file list to widen to ReactNode, so icons are omitted rather than passing
  // emoji glyphs (spec §6: no emoji icons).
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Farms', path: '/farm/farms' },
    { label: block?.farmName || 'Farm', path: `/farm/farms/${farmId}` },
    { label: block?.name || block?.blockCode || 'Block Details' },
  ];

  if (error || !block || !summary) {
    return (
      <Container>
        <Breadcrumb items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Farms', path: '/farm/farms' },
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: theme.colors.bright.emerald }}>
                    <Sprout size={12} strokeWidth={1.8} /> {block.targetCropName}
                  </span>
                </>
              )}
            </BlockMeta>
          </TitleSection>
          <StatusBadge $status={block.state}>{block.state}</StatusBadge>
        </TitleRow>

        <StatsGrid>
          {block.blockCategory !== 'virtual' && (
            <StatCard>
              <StatLabel>Area Used</StatLabel>
              <StatValue>{formatPercentage(summary.utilizationPercent ?? 0, 0)}</StatValue>
              <StatSubtext>of total area</StatSubtext>
            </StatCard>
          )}

          <StatCard>
            <StatLabel>Current Plants</StatLabel>
            <StatValue>{formatNumber(summary.currentPlantCount ?? 0)}</StatValue>
            <StatSubtext>plants in block</StatSubtext>
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
              {/* Plant-data version staleness banner */}
              {block.plantDataIsStale && (
                <StaleBanner role="alert">
                  <StaleBannerText>
                    This block uses plant data v{block.plantDataVersion ?? '?'}; the library now has
                    v{block.latestPlantDataVersion ?? '?'}. Its predicted yield and timeline reflect
                    the older data.
                  </StaleBannerText>
                  {(block.state === 'planned' || block.state === 'growing' || block.state === 'fruiting') ? (
                    <>
                      <UpdatePlantDataButton
                        $loading={refreshingPlantData}
                        disabled={refreshingPlantData}
                        onClick={handleRefreshPlantData}
                      >
                        {refreshingPlantData ? 'Updating...' : 'Update to latest version'}
                      </UpdatePlantDataButton>
                      {refreshPlantDataError && (
                        <StaleLockNote style={{ color: theme.colors.bright.coral }}>{refreshPlantDataError}</StaleLockNote>
                      )}
                    </>
                  ) : (
                    <StaleLockNote>
                      Locked — this cycle keeps the data it was planted with.
                    </StaleLockNote>
                  )}
                </StaleBanner>
              )}

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
                    <Sprout size={14} strokeWidth={1.8} /> Add Additional Crop
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
                      onClick={() => setAnalyticsBlockId(child.blockId)}
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
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: theme.colors.bright.lapis, cursor: 'pointer' }}
                      onClick={() => block.parentBlockId && navigate(`/farm/farms/${farmId}/blocks/${block.parentBlockId}`)}
                    >
                      {block.parentBlockId ? (<>View Parent Block <ArrowRight size={13} strokeWidth={1.8} /></>) : 'Unknown'}
                    </InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Allocated Area</InfoLabel>
                    <InfoValue>{block.allocatedArea ? `${formatNumber(block.allocatedArea, { decimals: 2 })} m²` : 'N/A'}</InfoValue>
                  </InfoItem>
                  <EmptyVirtualButton onClick={() => setShowEmptyVirtualModal(true)}>
                    <Trash2 size={14} strokeWidth={1.8} /> Empty &amp; Delete Virtual Block
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
                  <InfoLabel>Available Area</InfoLabel>
                  <InfoValue>{formatNumber(block.availableArea ?? 0, { decimals: 2 })} m²</InfoValue>
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
                    <InfoValue style={{ color: (summary.yieldEfficiencyPercent ?? 0) >= 80 ? theme.colors.bright.emerald : (summary.yieldEfficiencyPercent ?? 0) >= 50 ? theme.colors.bright.terra : theme.colors.bright.coral }}>
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

          {/* Virtual child analytics ("Stats") modal — same modal as the
              dashboard virtual block card, opened by clicking a child crop above. */}
          {farmId && (
            <BlockAnalyticsModal
              isOpen={analyticsBlockId !== null}
              onClose={() => setAnalyticsBlockId(null)}
              blockId={analyticsBlockId ?? ''}
              farmId={farmId}
            />
          )}

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
