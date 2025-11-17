/**
 * Farm Dashboard Page
 *
 * High-density dashboard view for monitoring all blocks in a specific farm.
 * Provides real-time visibility into block states, harvest progress, and performance metrics.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FarmSelector } from '../../components/farm/dashboard/FarmSelector';
import { DashboardHeader } from '../../components/farm/dashboard/DashboardHeader';
import { DashboardFilters } from '../../components/farm/dashboard/DashboardFilters';
import { BlockGrid } from '../../components/farm/dashboard/BlockGrid';
import { DashboardSettings } from '../../components/farm/dashboard/DashboardSettings';
import { useDashboardData } from '../../hooks/farm/useDashboardData';
import { useDashboardConfig } from '../../hooks/farm/useDashboardConfig';
import { useDashboardFilters } from '../../hooks/farm/useDashboardFilters';

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
  gap: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const Controls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const SettingsButton = styled.button`
  padding: 8px 16px;
  border: 1px solid #3B82F6;
  border-radius: 8px;
  background: white;
  color: #3B82F6;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #E3F2FD;
  }
`;

const RefreshButton = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #3B82F6;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1976D2;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
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
  border: 4px solid #E0E0E0;
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
  margin: 24px 0;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 32px;
  background: white;
  border-radius: 12px;
  color: #9E9E9E;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function FarmDashboardPage() {
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { config, updateConfig } = useDashboardConfig();

  // Fetch dashboard data
  const {
    data: dashboardData,
    loading,
    error,
    refetch
  } = useDashboardData(selectedFarmId);

  // Filter and sort blocks
  const {
    filteredBlocks,
    filters,
    setFilters,
    sortBy,
    setSortBy
  } = useDashboardFilters(dashboardData?.blocks || []);

  // Load last selected farm from localStorage
  useEffect(() => {
    const lastFarmId = localStorage.getItem('last-selected-farm-id');
    if (lastFarmId) {
      setSelectedFarmId(lastFarmId);
    }
  }, []);

  // Save selected farm to localStorage
  useEffect(() => {
    if (selectedFarmId) {
      localStorage.setItem('last-selected-farm-id', selectedFarmId);
    }
  }, [selectedFarmId]);

  const handleFarmChange = (farmId: string) => {
    setSelectedFarmId(farmId);
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <Container>
      <TopBar>
        <Title>Farm Dashboard</Title>
        <Controls>
          <FarmSelector
            selectedFarmId={selectedFarmId}
            onFarmChange={handleFarmChange}
          />
          <RefreshButton onClick={handleRefresh} disabled={loading}>
            🔄 Refresh
          </RefreshButton>
          <SettingsButton onClick={() => setShowSettings(true)}>
            ⚙️ Settings
          </SettingsButton>
        </Controls>
      </TopBar>

      {!selectedFarmId && (
        <EmptyState>
          <h3>No Farm Selected</h3>
          <p>Please select a farm from the dropdown above to view the dashboard.</p>
        </EmptyState>
      )}

      {selectedFarmId && loading && (
        <LoadingContainer>
          <Spinner />
        </LoadingContainer>
      )}

      {selectedFarmId && error && (
        <ErrorContainer>
          <strong>Error loading dashboard:</strong> {error}
        </ErrorContainer>
      )}

      {selectedFarmId && !loading && !error && dashboardData && (
        <>
          <DashboardHeader
            farmInfo={dashboardData.farmInfo}
            summary={dashboardData.summary}
          />

          <DashboardFilters
            filters={filters}
            onFiltersChange={setFilters}
            sortBy={sortBy}
            onSortChange={setSortBy}
            blocksByState={dashboardData.summary.blocksByState}
          />

          {filteredBlocks.length === 0 ? (
            <EmptyState>
              <h3>No Blocks Match Filters</h3>
              <p>Try adjusting your filter settings.</p>
            </EmptyState>
          ) : (
            <BlockGrid
              blocks={filteredBlocks}
              farmId={selectedFarmId}
              config={config}
              onBlockUpdate={refetch}
            />
          )}
        </>
      )}

      <DashboardSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        config={config}
        onConfigChange={updateConfig}
      />
    </Container>
  );
}
