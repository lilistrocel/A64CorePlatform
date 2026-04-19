/**
 * FarmDetail Component
 *
 * Displays detailed information about a farm with tabs for different views.
 * Uses React Query for efficient data fetching and caching.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useFarm, useFarmSummary, useFarmBlocks } from '../../hooks/queries';
import { BlockGrid } from './BlockGrid';
import { PhysicalBlockGrid } from './PhysicalBlockGrid';
import { CreateBlockModal } from './CreateBlockModal';
import { EditBlockModal } from './EditBlockModal';
import { EditFarmModal } from './EditFarmModal';
import { EditFarmBoundaryModal } from './EditFarmBoundaryModal';
import { FarmHistoryTab } from './FarmHistoryTab';
import { FarmMapView } from './FarmMapView';
import { AgriDataTab, SensorFusionTab } from './weather';
import { farmApi } from '../../services/farmApi';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import { Breadcrumb } from '@a64core/shared';
import type { BreadcrumbItem } from '@a64core/shared';
import type { Farm, FarmSummary, Block, BlockCreate, BlockUpdate, FarmUpdate } from '../../types/farm';
import { formatNumber } from '../../utils';

// LocalStorage key for mobile view preference
const MOBILE_VIEW_PREF_KEY = 'farm-detail-mobile-view';
// LocalStorage key for farming year preference (per farm)

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

const Header = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  padding: 32px;
  box-shadow: ${({ theme }) => theme.shadows.md};
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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const Location = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
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

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const EditButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  padding-top: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const StatCard = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const StatValue = styled.span`
  font-size: 32px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatSubtext = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const TabsContainer = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  overflow: hidden;
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.neutral[300]};
    border-radius: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 16px 24px;
  background: ${({ $active, theme }) => ($active ? theme.colors.background : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.textSecondary)};
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary[500] : 'transparent')};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.primary[500]};
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
  border: 4px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
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
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
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
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoValue = styled.span`
  font-size: 14px;
  font-weight: 500;
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
  background: ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.background)};
  color: ${({ $active, theme }) => ($active ? 'white' : theme.colors.textSecondary)};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.neutral[300])};
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

const MobileToggleIcon = styled.span`
  font-size: 18px;
`;

const MobileMapContainer = styled.div<{ $isFullScreen: boolean }>`
  @media (max-width: 768px) {
    background: ${({ theme }) => theme.colors.background};
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
    background: ${({ theme }) => theme.colors.background};
    border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  }
`;

const MobileMapTitle = styled.span`
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
  background: ${({ theme }) => theme.colors.surface};
  border: none;
  border-radius: 8px;
  font-size: 20px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[300]};
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
    color: white;
    border: none;
    border-radius: 28px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
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
  } = useFarmSummary(farmId);

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

  // Refetch all data (used after mutations)
  const loadFarmData = async () => {
    await Promise.all([
      refetchFarm(),
      refetchSummary(),
      refetchPhysicalBlocks(),
      refetchVirtualBlocks(),
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
          <Spinner />
        </LoadingContainer>
      </Container>
    );
  }

  // Breadcrumb items for navigation
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Farms', path: '/farm/farms', icon: '🏞️' },
    { label: farm?.name || 'Farm Details' },
  ];

  if (error) {
    return (
      <Container>
        <Breadcrumb items={[
          { label: 'Dashboard', path: '/dashboard', icon: '📊' },
          { label: 'Farms', path: '/farm/farms', icon: '🏞️' },
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
          { label: 'Dashboard', path: '/dashboard', icon: '📊' },
          { label: 'Farms', path: '/farm/farms', icon: '🏞️' },
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

  return (
    <Container>
      <Breadcrumb items={breadcrumbItems} />

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
          <HeaderActions>
            <EditButton onClick={() => setShowEditFarmModal(true)}>
              <span>✏️</span>
              <span>Edit Farm</span>
            </EditButton>
            <StatusBadge $isActive={farm.isActive}>
              {farm.isActive ? 'Active' : 'Inactive'}
            </StatusBadge>
          </HeaderActions>
        </TitleRow>

        <StatsGrid>
          <StatCard>
            <StatLabel>Total Area</StatLabel>
            <StatValue>{formatNumber(farm.totalArea ?? 0, { decimals: 2 })}</StatValue>
            <StatSubtext>hectares</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>Total Blocks</StatLabel>
            <StatValue>{formatNumber(summary.totalBlocks ?? 0)}</StatValue>
            <StatSubtext>{formatNumber(summary.totalBlockArea ?? 0, { decimals: 2 })} ha total</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>Active Plantings</StatLabel>
            <StatValue>{formatNumber(summary.activePlantings ?? 0)}</StatValue>
            <StatSubtext>{formatNumber(summary.totalPlantedPlants ?? 0)} plants</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>Predicted Yield</StatLabel>
            <StatValue>{formatNumber(summary.predictedYield ?? 0)}</StatValue>
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
                  <InfoLabel>🏗️ Empty</InfoLabel>
                  <InfoValue>{formatNumber(summary.blocksByState.empty)}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>📋 Planned</InfoLabel>
                  <InfoValue>{formatNumber(summary.blocksByState.planned)}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>🌱 Planted</InfoLabel>
                  <InfoValue>{formatNumber(summary.blocksByState.planted)}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>🌾 Harvesting</InfoLabel>
                  <InfoValue>{formatNumber(summary.blocksByState.harvesting)}</InfoValue>
                </InfoItem>
                {summary.blocksByState.alert > 0 && (
                  <InfoItem>
                    <InfoLabel>⚠️ Alert</InfoLabel>
                    <InfoValue>{formatNumber(summary.blocksByState.alert)}</InfoValue>
                  </InfoItem>
                )}
              </InfoCard>
            </OverviewGrid>
          )}

          {activeTab === 'blocks' && (
            <>
              {/* Mobile View Toggle */}
              <MobileViewToggle>
                <MobileToggleButton
                  $active={mobileView === 'list'}
                  onClick={() => handleMobileViewChange('list')}
                >
                  <MobileToggleIcon>📋</MobileToggleIcon>
                  List View
                </MobileToggleButton>
                <MobileToggleButton
                  $active={mobileView === 'map'}
                  onClick={() => handleMobileViewChange('map')}
                >
                  <MobileToggleIcon>🗺️</MobileToggleIcon>
                  Map View
                </MobileToggleButton>
              </MobileViewToggle>

              {/* Mobile Full-Screen Map */}
              {isMobile && isMapFullScreen && (
                <MobileMapContainer $isFullScreen={true}>
                  <MobileMapHeader>
                    <MobileMapTitle>🗺️ Farm Map</MobileMapTitle>
                    <MobileCloseButton onClick={handleCloseMapFullScreen}>
                      ✕
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
                  />
                </MobileListContainer>
              )}

              {/* Floating Map Button (visible on mobile in list view) */}
              {isMobile && !isMapFullScreen && (
                <FloatingMapButton onClick={() => handleMobileViewChange('map')}>
                  <span>🗺️</span>
                  <span>View Map</span>
                </FloatingMapButton>
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
    </Container>
  );
}
