/**
 * Farm Dashboard Page
 *
 * High-density dashboard view for monitoring all blocks in a specific farm.
 * Provides real-time visibility into block states, harvest progress, and performance metrics.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { FarmSelector } from '../../components/farm/dashboard/FarmSelector';
import { DashboardHeader } from '../../components/farm/dashboard/DashboardHeader';
import { DashboardFilters } from '../../components/farm/dashboard/DashboardFilters';
import { BlockGrid } from '../../components/farm/dashboard/BlockGrid';
import { DashboardSettings } from '../../components/farm/dashboard/DashboardSettings';
import { useDashboardData } from '../../hooks/farm/useDashboardData';
import { useDashboardConfig } from '../../hooks/farm/useDashboardConfig';
import { useDashboardFilters } from '../../hooks/farm/useDashboardFilters';
import type { DashboardBlockStatus, PerformanceCategory } from '../../types/farm';

export function FarmDashboardPage() {
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Configuration
  const { config, updateConfig } = useDashboardConfig();

  // Fetch dashboard data with auto-refresh
  const {
    data: dashboardData,
    loading,
    error,
    refetch,
  } = useDashboardData({
    farmId: selectedFarmId,
    autoRefresh: true,
    refreshInterval: 30000, // 30 seconds
  });

  // Filter and sort blocks
  const {
    filteredBlocks,
    filters,
    setStateFilter,
    setSearchQuery,
    setPerformanceFilter,
    setShowDelayedOnly,
    setShowAlertsOnly,
    clearFilters,
    sortBy,
    sortDirection,
    setSortBy,
    toggleSortDirection,
    totalBlocks,
    filteredCount,
  } = useDashboardFilters(dashboardData?.blocks || []);

  /**
   * Handle state filter toggle
   */
  const handleStateToggle = (state: DashboardBlockStatus) => {
    const newStates = new Set(filters.states);
    if (newStates.has(state)) {
      newStates.delete(state);
    } else {
      newStates.add(state);
    }
    setStateFilter(newStates);
  };

  /**
   * Handle performance filter toggle
   */
  const handlePerformanceToggle = (category: PerformanceCategory) => {
    const newCategories = new Set(filters.performanceCategories);
    if (newCategories.has(category)) {
      newCategories.delete(category);
    } else {
      newCategories.add(category);
    }
    setPerformanceFilter(newCategories);
  };

  return (
    <Container>
      {/* Top Bar */}
      <TopBar>
        <TitleSection>
          <Title>🌾 Farm Dashboard</Title>
          <Subtitle>Real-time block monitoring and management</Subtitle>
        </TitleSection>

        <Controls>
          <FarmSelector selectedFarmId={selectedFarmId} onFarmSelect={setSelectedFarmId} />

          <RefreshButton onClick={refetch} disabled={loading}>
            <RefreshIcon $spinning={loading}>🔄</RefreshIcon>
            Refresh
          </RefreshButton>

          <SettingsButton onClick={() => setShowSettings(true)}>
            ⚙️ Settings
          </SettingsButton>
        </Controls>
      </TopBar>

      {/* No Farm Selected */}
      {!selectedFarmId && (
        <EmptyState>
          <EmptyIcon>🌾</EmptyIcon>
          <EmptyTitle>No Farm Selected</EmptyTitle>
          <EmptyText>Please select a farm from the dropdown above to view the dashboard.</EmptyText>
        </EmptyState>
      )}

      {/* Loading State */}
      {selectedFarmId && loading && !dashboardData && (
        <LoadingContainer>
          <Spinner />
          <LoadingText>Loading dashboard data...</LoadingText>
        </LoadingContainer>
      )}

      {/* Error State */}
      {selectedFarmId && error && (
        <ErrorContainer>
          <ErrorIcon>⚠️</ErrorIcon>
          <ErrorTitle>Error Loading Dashboard</ErrorTitle>
          <ErrorMessage>{error}</ErrorMessage>
          <RetryButton onClick={refetch}>Retry</RetryButton>
        </ErrorContainer>
      )}

      {/* Dashboard Content */}
      {selectedFarmId && !error && dashboardData && (
        <>
          {/* Farm Info & Summary */}
          <DashboardHeader farmInfo={dashboardData.farmInfo} summary={dashboardData.summary} />

          {/* Filters */}
          <DashboardFilters
            selectedStates={filters.states}
            searchQuery={filters.searchQuery}
            selectedPerformance={filters.performanceCategories}
            showDelayedOnly={filters.showDelayedOnly}
            showAlertsOnly={filters.showAlertsOnly}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onStateToggle={handleStateToggle}
            onSearchChange={setSearchQuery}
            onPerformanceToggle={handlePerformanceToggle}
            onDelayedToggle={setShowDelayedOnly}
            onAlertsToggle={setShowAlertsOnly}
            onSortChange={setSortBy}
            onSortDirectionToggle={toggleSortDirection}
            onClearFilters={clearFilters}
            totalBlocks={totalBlocks}
            filteredCount={filteredCount}
          />

          {/* Block Grid */}
          <BlockGrid blocks={filteredBlocks} farmId={selectedFarmId} config={config} onBlockUpdate={refetch} />
        </>
      )}

      {/* Settings Modal */}
      <DashboardSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        config={config}
        onConfigChange={updateConfig}
      />
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 24px;
  max-width: 100%;
  min-height: 100vh;
  background: #f5f5f5;
`;

const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 24px;

  @media (max-width: 1024px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const TitleSection = styled.div`
  flex: 1;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  color: #212121;
  margin: 0 0 4px 0;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #757575;
  margin: 0;
`;

const Controls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    width: 100%;
  }
`;

const RefreshButton = styled.button`
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: #1976d2;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const RefreshIcon = styled.span<{ $spinning: boolean }>`
  display: inline-block;
  animation: ${(props) =>
    props.$spinning ? 'spin 1s linear infinite' : 'none'};

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const SettingsButton = styled.button`
  padding: 10px 16px;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  background: white;
  color: #3b82f6;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: #e3f2fd;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 16px;
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

const LoadingText = styled.div`
  font-size: 16px;
  color: #757575;
`;

const ErrorContainer = styled.div`
  padding: 32px;
  background: white;
  border: 2px solid #f44336;
  border-radius: 12px;
  text-align: center;
  max-width: 500px;
  margin: 48px auto;
`;

const ErrorIcon = styled.div`
  font-size: 48px;
  margin-bottom: 16px;
`;

const ErrorTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #f44336;
  margin: 0 0 8px 0;
`;

const ErrorMessage = styled.p`
  font-size: 14px;
  color: #757575;
  margin: 0 0 16px 0;
`;

const RetryButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #f44336;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #d32f2f;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  max-width: 600px;
  margin: 48px auto;
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.7;
`;

const EmptyTitle = styled.h3`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const EmptyText = styled.p`
  font-size: 16px;
  color: #757575;
  margin: 0;
`;
