/**
 * FarmDetail Component
 *
 * Displays detailed information about a farm with tabs for different views.
 * Uses React Query for efficient data fetching and caching.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  BarChart3,
  Calendar,
  Pencil,
  Construction,
  ClipboardList,
  Sprout,
  Wheat,
  AlertTriangle,
  Map as MapIcon,
  X,
} from 'lucide-react';
import { useFarm, useFarmSummary, useFarmBlocks } from '../../hooks/queries';
import { PhysicalBlockGrid } from './PhysicalBlockGrid';
import { CreateBlockModal } from './CreateBlockModal';
import { EditBlockModal } from './EditBlockModal';
import { EditFarmModal } from './EditFarmModal';
import { EditFarmBoundaryModal } from './EditFarmBoundaryModal';
import { FarmHistoryTab } from './FarmHistoryTab';
import { FarmMapView } from './FarmMapView';
import { AgriDataTab, SensorFusionTab } from './weather';
import { FarmQuickSwitcher } from './FarmQuickSwitcher';
import { BlockMonitorHero } from './BlockMonitorHero';
import { BlockViewToggle } from './BlockViewToggle';
import { VirtualBlocksView } from './VirtualBlocksView';
import { FarmAnalyticsModal } from './FarmAnalyticsModal';
import { useBlockViewMode } from '../../hooks/farm/useBlockViewMode';
import { useDashboardData } from '../../hooks/farm/useDashboardData';
import { useFarmingYearsList } from '../../hooks/queries/useFarmingYears';
import { farmApi } from '../../services/farmApi';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import { Breadcrumb, PageHeader, Spinner, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import type { FarmSummary, DashboardSummary, Block, BlockCreate, BlockUpdate, FarmUpdate } from '../../types/farm';
import { formatNumber } from '../../utils';

/**
 * Adapts the lighter FarmSummary (from useFarmSummary) into a DashboardSummary
 * shape so BlockMonitorHero can consume it without a separate API call.
 *
 * TODO: avgYieldEfficiency is not present in FarmSummary — defaulting to 0 (N/A)
 *       until the /farm/farms/:id/summary endpoint includes it.
 * TODO: totalActualYieldKg is not present in FarmSummary — defaulting to 0.
 */
function adaptToDashboardSummary(s: FarmSummary): DashboardSummary {
  // FarmSummary.blocksByState uses strict interface keys, but the actual API
  // response may include extra keys (e.g. "planted"). Cast to a wider type
  // so the mapping works without breaking the DashboardSummary contract.
  const blocksByState = s.blocksByState as Record<string, number>;
  return {
    totalBlocks: s.totalBlocks,
    physicalBlocks: s.physicalBlocks,
    virtualBlocks: s.virtualBlocks,
    blocksByState,
    totalActivePlantings: s.activePlantings,
    totalPredictedYieldKg: s.predictedYield,
    totalActualYieldKg: 0, // TODO: not in FarmSummary
    avgYieldEfficiency: 0, // TODO: not in FarmSummary
    activeAlerts: {},
  };
}

// LocalStorage key for mobile view preference
const MOBILE_VIEW_PREF_KEY = 'farm-detail-mobile-view';
// LocalStorage key for farming year preference (per farm)

// ============================================================================
// STYLED COMPONENTS
// ============================================================================
// Night Observatory (T-901, screen sweep). Page-level Container stays
// transparent so the fixed Sky layer shows through; hero/tab panels below
// carry the glass treatment (spec §2/§4).

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
  color: ${({ theme }) => theme.colors.primary[500]};
  border: 1px solid ${({ theme }) => theme.colors.primary[500]};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-bottom: 24px;

  &:hover {
    background: ${({ theme }) => theme.colors.infoBg};
  }
`;

/** Hero panel — one glass layer holding the title block, quick actions and
 * the 4-stat BlockMonitorHero. */
const HeroPanel = styled.div`
  ${glassPanel}
  padding: 28px 32px 32px;
  margin-bottom: 28px;
`;

const HeaderTopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

/** PageHeader (breadcrumb + title + description) with its own bottom margin
 * stripped — HeaderTopRow controls spacing since HeaderActions sits beside it. */
const StyledPageHeader = styled(PageHeader)`
  margin-bottom: 0;
  flex: 1;
  min-width: 260px;
`;

const FarmingYearChip = styled.span`
  ${monoLabel}
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 20px;
  padding: 5px 12px;
  white-space: nowrap;

  svg {
    flex-shrink: 0;
  }
`;

/** Divider between the title/actions row and the hero stats. */
const HeaderDivider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  margin: 0 0 24px 0;
`;

const StatusBadge = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
`;

/** Primary CTA — the one gold element this button contributes to the page's
 * gold budget (spec §3/§4 Buttons: gold gradient + onAccent text). */
const EditButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[400]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease-in-out, box-shadow 150ms ease-in-out;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(220, 185, 79, 0.3);
  }

  @media (prefers-reduced-motion: reduce) {
    &:hover {
      transform: none;
    }
  }
`;

/** Secondary action — glass button per spec §4 Buttons ("Secondary: glass +
 * glass.border + cream text"). */
const StatsButton = styled.button`
  ${glassControl}
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    border-color: rgba(220, 185, 79, 0.35);
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

/** Content panel for the tab bar + tab views — transparent so nested tab
 * content (map, block grids, etc.) owns its own glass treatment; TabBar
 * itself is the one glass element here (spec §4 "Tab bar → glassControl"). */
const TabsContainer = styled.div``;

const TabBar = styled.div`
  ${glassControl}
  display: flex;
  overflow-x: auto;
  padding: 4px;
  gap: 2px;
  margin-bottom: 20px;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.line};
    border-radius: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 12px 20px;
  background: ${({ $active, theme }) => ($active ? theme.colors.glass.hi : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.celeste : theme.colors.muted)};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const TabContent = styled.div`
  padding: 4px 0 32px;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
`;

const ErrorContainer = styled.div`
  padding: 24px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.error};
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
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px 0;
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const InfoValue = styled.span`
  ${monoLabel}
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: none;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Mobile Map/List Toggle Components
const MobileViewToggle = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    padding: 0 16px;
  }
`;

const MobileToggleButton = styled.button<{ $active: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.glass.base)};
  color: ${({ $active, theme }) => ($active ? theme.colors.onDark : theme.colors.textSecondary)};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.glass.border)};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  min-height: 44px;

  &:active {
    transform: scale(0.98);
  }
`;

const MobileMapContainer = styled.div<{ $isFullScreen: boolean }>`
  @media (max-width: 768px) {
    background: ${({ theme }) => theme.colors.canvas};
    ${({ $isFullScreen }) => $isFullScreen && `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
    `}
  }
`;

const MobileMapHeader = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: ${({ theme }) => theme.colors.cosmosHi};
    border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  }
`;

const MobileMapTitle = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const MobileCloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: none;
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const MobileListContainer = styled.div`
  @media (max-width: 768px) {
    padding: 0;
  }
`;

// Floating Map Toggle Button (for when in list view on mobile)
const FloatingMapButton = styled.button`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 14px 20px;
    background: ${({ theme }) => theme.colors.primary[500]};
    color: ${({ theme }) => theme.colors.onDark};
    border: none;
    border-radius: 28px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: ${({ theme }) => `0 4px 12px ${theme.colors.primary[500]}66`};
    cursor: pointer;
    z-index: 100;
    transition: all 150ms ease-in-out;

    &:active {
      transform: scale(0.95);
    }
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

type TabType = 'overview' | 'blocks' | 'map' | 'plantings' | 'statistics' | 'history' | 'agridata' | 'sensors';
type MobileViewType = 'list' | 'map';

export function FarmDetail() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  // Farming year from global sidebar selector
  const { selectedYear: selectedFarmingYear } = useFarmingYearStore();

  // Use React Query hooks for data fetching with automatic caching
  const {
    data: farm,
    isLoading: farmLoading,
    error: farmError,
    refetch: refetchFarm,
  } = useFarm(farmId);

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useFarmSummary(farmId, selectedFarmingYear);

  const {
    data: physicalBlocks = [],
    isLoading: physicalBlocksLoading,
    error: physicalBlocksError,
    refetch: refetchPhysicalBlocks,
  } = useFarmBlocks(farmId, 'physical');

  const {
    data: virtualBlocks = [],
    isLoading: virtualBlocksLoading,
    error: virtualBlocksError,
    refetch: refetchVirtualBlocks,
  } = useFarmBlocks(farmId, 'virtual');

  // Richer dashboard summary (includes avgYieldEfficiency, activeAlerts, etc.)
  // Used by BlockMonitorHero. VirtualBlocksView calls useDashboardData independently
  // when the Blocks tab toggle is "Virtual only" — TanStack/internal state will dedupe
  // the underlying request via TanStack Query / React state where applicable.
  const { data: dashboardData, refetch: refetchDashboard } = useDashboardData({
    farmId: farmId ?? null,
    farmingYear: selectedFarmingYear,
    autoRefresh: false,
  });

  // Fetch the farming-years list so we can render the formatted timeframe
  // ("Aug 2025 - Jul 2026") next to the farm title instead of just "FY 2025".
  const { data: farmingYearsListData } = useFarmingYearsList();
  const selectedFarmingYearDisplay = selectedFarmingYear !== null
    ? farmingYearsListData?.years.find((y) => y.year === selectedFarmingYear)?.display
      ?? `FY ${selectedFarmingYear}`
    : null;

  // Derive the richer virtual DashboardBlock[] for the physical-block plantings modal.
  // Using blockCategory === 'virtual' as the canonical filter (parentBlockId !== null
  // is equivalent for well-formed data but blockCategory is more explicit).
  const virtualDashboardBlocks = dashboardData?.blocks?.filter(
    (b) => b.blockCategory === 'virtual'
  ) ?? [];

  // Combine blocks for backward compatibility with map view
  const blocks = [...physicalBlocks, ...virtualBlocks];

  // Combine loading and error states
  const loading = farmLoading || summaryLoading || physicalBlocksLoading || virtualBlocksLoading;
  const error = farmError || summaryError || physicalBlocksError || virtualBlocksError;

  const [activeTab, setActiveTab] = useState<TabType>('blocks');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [showBoundaryModal, setShowBoundaryModal] = useState(false);
  const [showEditFarmModal, setShowEditFarmModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

  // Blocks tab view mode: physical layout or virtual-only (persisted to localStorage)
  const [blocksViewMode, setBlocksViewMode] = useBlockViewMode();

  // Mobile view state - persisted to localStorage
  const [mobileView, setMobileView] = useState<MobileViewType>(() => {
    const saved = localStorage.getItem(MOBILE_VIEW_PREF_KEY);
    return (saved as MobileViewType) || 'list';
  });
  const [isMobile, setIsMobile] = useState(false);
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Persist mobile view preference
  const handleMobileViewChange = (view: MobileViewType) => {
    setMobileView(view);
    localStorage.setItem(MOBILE_VIEW_PREF_KEY, view);
    if (view === 'map') {
      setIsMapFullScreen(true);
    }
  };

  // Close full-screen map
  const handleCloseMapFullScreen = () => {
    setIsMapFullScreen(false);
    setMobileView('list');
    localStorage.setItem(MOBILE_VIEW_PREF_KEY, 'list');
  };

  // Refetch all data (used after mutations).
  // Includes refetchDashboard so the BlockMonitorHero stats and the
  // PhysicalBlockPlantingsModal (which renders DashboardBlock data) stay in sync.
  const loadFarmData = async () => {
    await Promise.all([
      refetchFarm(),
      refetchSummary(),
      refetchPhysicalBlocks(),
      refetchVirtualBlocks(),
      refetchDashboard(),
    ]);
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
          <Spinner size="large" />
        </LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Breadcrumb items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Farms', path: '/farm/farms' },
          { label: 'Error' },
        ]} />
        <ErrorContainer>
          {error instanceof Error ? error.message : 'Failed to load farm details. Please try again.'}
        </ErrorContainer>
      </Container>
    );
  }

  if (!farm || !summary) {
    return (
      <Container>
        <Breadcrumb items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Farms', path: '/farm/farms' },
          { label: 'Not Found' },
        ]} />
        <ErrorContainer>Farm not found</ErrorContainer>
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

  // Prefer the richer DashboardSummary from useDashboardData (includes avgYieldEfficiency,
  // activeAlerts). Fall back to adapting the lighter FarmSummary while dashboardData is
  // still loading so the hero renders immediately on navigation.
  const dashboardSummary: DashboardSummary =
    dashboardData?.summary ?? adaptToDashboardSummary(summary as unknown as FarmSummary);

  return (
    <Container>
      {/* Quick farm switcher — allows navigating to another farm without going back to list */}
      <FarmQuickSwitcher currentFarmId={farmId!} currentFarmName={farm.name} />

      <HeroPanel>
        <HeaderTopRow>
          <StyledPageHeader
            breadcrumb="Farm Manager · Detail"
            title={farm.name}
            description={locationText}
          />
          <HeaderActions>
            {selectedFarmingYearDisplay && (
              <FarmingYearChip>
                <Calendar size={13} strokeWidth={1.6} />
                {selectedFarmingYearDisplay}
              </FarmingYearChip>
            )}
            <StatusBadge $phase={farm.isActive ? 'inoculated' : 'decommissioned'}>
              {farm.isActive ? 'Active' : 'Inactive'}
            </StatusBadge>
            <StatsButton type="button" onClick={() => setShowAnalyticsModal(true)}>
              <BarChart3 size={16} strokeWidth={1.6} />
              <span>Farm Stats</span>
            </StatsButton>
            <EditButton onClick={() => setShowEditFarmModal(true)}>
              <Pencil size={16} strokeWidth={1.6} />
              <span>Edit Farm</span>
            </EditButton>
          </HeaderActions>
        </HeaderTopRow>

        <HeaderDivider />

        {/* 4-stat hero: Total Blocks, Active Plantings, Avg Yield Efficiency, Predicted Yield */}
        <BlockMonitorHero summary={dashboardSummary} />
      </HeroPanel>

      <TabsContainer>
        <TabBar>
          <Tab $active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </Tab>
          <Tab $active={activeTab === 'blocks'} onClick={() => setActiveTab('blocks')}>
            Blocks ({physicalBlocks.length} Physical · {virtualBlocks.length} Plantings)
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
                  <InfoLabel><Construction size={14} strokeWidth={1.6} /> Empty</InfoLabel>
                  <InfoValue>{formatNumber(summary.blocksByState.empty)}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel><ClipboardList size={14} strokeWidth={1.6} /> Planned</InfoLabel>
                  <InfoValue>{formatNumber(summary.blocksByState.planned)}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel><Sprout size={14} strokeWidth={1.6} /> Planted</InfoLabel>
                  <InfoValue>{formatNumber(summary.blocksByState.planted)}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel><Wheat size={14} strokeWidth={1.6} /> Harvesting</InfoLabel>
                  <InfoValue>{formatNumber(summary.blocksByState.harvesting)}</InfoValue>
                </InfoItem>
                {summary.blocksByState.alert > 0 && (
                  <InfoItem>
                    <InfoLabel><AlertTriangle size={14} strokeWidth={1.6} /> Alert</InfoLabel>
                    <InfoValue>{formatNumber(summary.blocksByState.alert)}</InfoValue>
                  </InfoItem>
                )}
              </InfoCard>
            </OverviewGrid>
          )}

          {activeTab === 'blocks' && (
            <>

              {/* Physical layout view (existing behaviour, untouched) */}
              {blocksViewMode === 'physical' && (
                <>
                  {/* Mobile View Toggle */}
                  <MobileViewToggle>
                    <MobileToggleButton
                      $active={mobileView === 'list'}
                      onClick={() => handleMobileViewChange('list')}
                    >
                      <ClipboardList size={16} strokeWidth={1.6} />
                      List View
                    </MobileToggleButton>
                    <MobileToggleButton
                      $active={mobileView === 'map'}
                      onClick={() => handleMobileViewChange('map')}
                    >
                      <MapIcon size={16} strokeWidth={1.6} />
                      Map View
                    </MobileToggleButton>
                  </MobileViewToggle>

                  {/* Mobile Full-Screen Map */}
                  {isMobile && isMapFullScreen && (
                    <MobileMapContainer $isFullScreen={true}>
                      <MobileMapHeader>
                        <MobileMapTitle><MapIcon size={16} strokeWidth={1.6} /> Farm Map</MobileMapTitle>
                        <MobileCloseButton onClick={handleCloseMapFullScreen}>
                          <X size={18} strokeWidth={1.8} />
                        </MobileCloseButton>
                      </MobileMapHeader>
                      <FarmMapView
                        farm={farm}
                        blocks={blocks}
                        onBlockClick={(block) => {
                          handleCloseMapFullScreen();
                          setEditingBlock(block);
                        }}
                        onEditFarmBoundary={() => setShowBoundaryModal(true)}
                        height="calc(100vh - 60px)"
                      />
                    </MobileMapContainer>
                  )}

                  {/* List View (or desktop) */}
                  {(!isMobile || !isMapFullScreen) && (
                    <MobileListContainer>
                      <PhysicalBlockGrid
                        physicalBlocks={physicalBlocks}
                        virtualBlocks={virtualBlocks}
                        farmId={farmId!}
                        onRefresh={loadFarmData}
                        onCreateBlock={() => setShowCreateModal(true)}
                        virtualDashboardBlocks={virtualDashboardBlocks}
                        headerActions={
                          <BlockViewToggle value={blocksViewMode} onChange={setBlocksViewMode} />
                        }
                      />
                    </MobileListContainer>
                  )}

                  {/* Floating Map Button (visible on mobile in list view) */}
                  {isMobile && !isMapFullScreen && (
                    <FloatingMapButton onClick={() => handleMobileViewChange('map')}>
                      <MapIcon size={16} strokeWidth={1.6} />
                      <span>View Map</span>
                    </FloatingMapButton>
                  )}
                </>
              )}

              {/* Virtual-only view — Block Monitor experience embedded */}
              {blocksViewMode === 'virtual' && farmId && (
                <VirtualBlocksView
                  farmId={farmId}
                  headerActions={
                    <BlockViewToggle value={blocksViewMode} onChange={setBlocksViewMode} />
                  }
                />
              )}
            </>
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
            <FarmHistoryTab farmId={farmId} farmingYear={selectedFarmingYear} />
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

      {/* Edit Farm Modal */}
      {farm && (
        <EditFarmModal
          farm={farm}
          isOpen={showEditFarmModal}
          onClose={() => setShowEditFarmModal(false)}
          onSuccess={loadFarmData}
        />
      )}

      {/* Farm analytics modal — moved out of VirtualBlocksView so it's reachable
          from the page header in both Physical and Virtual modes. */}
      {farm && farmId && (
        <FarmAnalyticsModal
          isOpen={showAnalyticsModal}
          onClose={() => setShowAnalyticsModal(false)}
          farmId={farmId}
          farmName={farm.name}
          farmingYear={selectedFarmingYear}
        />
      )}
    </Container>
  );
}
