/**
 * VirtualBlocksView Component
 *
 * Encapsulates the full virtual-block monitoring experience for a given farmId:
 *   - Fetches dashboard data via useDashboardData
 *   - Owns filter state via useDashboardFilters
 *   - Owns settings state via useDashboardConfig
 *   - Renders DashboardFilters, DashboardSettings (gear trigger), and BlockGrid
 *   - Wires QuickPlanModal through CompactBlockCard / BlockGrid (handled internally)
 *
 * This component was extracted from FarmDashboardPage so the same behaviour can
 * be embedded in FarmDetail's Blocks tab without re-implementing the logic.
 *
 * Props
 * -----
 * farmId: string — the farm to show virtual blocks for (required).
 */

import { useState } from 'react';
import styled from 'styled-components';
import { AlertTriangle, Package, RefreshCw, Settings } from 'lucide-react';
import { glassControl, monoLabel } from '@a64core/shared';
import { DashboardFilters } from './dashboard/DashboardFilters';
import { DashboardSettings } from './dashboard/DashboardSettings';
import { BlockGrid } from './dashboard/BlockGrid';
import { useDashboardData } from '../../hooks/farm/useDashboardData';
import { useDashboardConfig } from '../../hooks/farm/useDashboardConfig';
import { useDashboardFilters } from '../../hooks/farm/useDashboardFilters';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import type { DashboardBlockStatus, PerformanceCategory } from '../../types/farm';

interface VirtualBlocksViewProps {
  farmId: string;
  /** Optional content rendered on the right of the header (e.g., a view-mode toggle). */
  headerActions?: React.ReactNode;
}

export function VirtualBlocksView({ farmId, headerActions }: VirtualBlocksViewProps) {
  const [showSettings, setShowSettings] = useState(false);

  // Use the global farming year from sidebar
  const { selectedYear: selectedFarmingYear } = useFarmingYearStore();

  // Dashboard configuration (colors, icons, layout) — persisted to localStorage
  const { config, updateConfig } = useDashboardConfig();

  // Fetch dashboard data with auto-refresh every 30 seconds (silent refresh)
  const {
    data: dashboardData,
    loading,
    error,
    refetch,
  } = useDashboardData({
    farmId,
    farmingYear: selectedFarmingYear,
    autoRefresh: true,
    refreshInterval: 30000,
  });

  // Client-side filtering and sorting
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
  } = useDashboardFilters(dashboardData?.blocks ?? []);

  const handleStateToggle = (state: DashboardBlockStatus) => {
    const next = new Set(filters.states);
    if (next.has(state)) {
      next.delete(state);
    } else {
      next.add(state);
    }
    setStateFilter(next);
  };

  const handlePerformanceToggle = (category: PerformanceCategory) => {
    const next = new Set(filters.performanceCategories);
    if (next.has(category)) {
      next.delete(category);
    } else {
      next.add(category);
    }
    setPerformanceFilter(next);
  };

  // --- Loading state ---
  if (loading && !dashboardData) {
    return (
      <StateContainer>
        <Spinner />
        <StateText>Loading virtual blocks…</StateText>
      </StateContainer>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <ErrorBox>
        <ErrorIconWrap aria-hidden="true"><AlertTriangle size={28} strokeWidth={1.6} /></ErrorIconWrap>
        <ErrorTitle>Error loading virtual blocks</ErrorTitle>
        <ErrorMessage>{error}</ErrorMessage>
        <RetryButton type="button" onClick={refetch}>
          Retry
        </RetryButton>
      </ErrorBox>
    );
  }

  // --- Empty / no data yet ---
  if (!dashboardData) {
    return (
      <StateContainer>
        <StateIconWrap aria-hidden="true"><Package size={32} strokeWidth={1.5} /></StateIconWrap>
        <StateText>No data available for this farm.</StateText>
      </StateContainer>
    );
  }

  // Count of virtual blocks for the header subtitle. Prefer the backend
  // breakdown from summary; fall back to filtering the blocks array.
  const virtualCount =
    dashboardData.summary.virtualBlocks ??
    dashboardData.blocks.filter((b) => b.blockCategory === 'virtual').length;

  return (
    <Wrapper>
      {/* Header — mirrors PhysicalBlockGrid's title + count style so toggling
          between Physical layout and Virtual only feels visually consistent. */}
      <Header>
        <div>
          <Title>Virtual Blocks</Title>
          <BlockCount>
            {virtualCount} virtual {virtualCount === 1 ? 'block' : 'blocks'}
          </BlockCount>
        </div>
        {/* Order matters: Refresh + Settings on the left, headerActions
            (toggle) on the right so the toggle stays anchored to the rightmost
            edge in both Physical and Virtual modes. */}
        <HeaderRight>
          <RefreshButton
            type="button"
            onClick={refetch}
            disabled={loading}
            aria-label="Refresh virtual blocks"
          >
            <RefreshIcon $spinning={loading} aria-hidden="true"><RefreshCw size={14} strokeWidth={1.8} /></RefreshIcon>
            Refresh
          </RefreshButton>
          <ToolButton
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Open dashboard settings"
          >
            <Settings size={14} strokeWidth={1.8} aria-hidden="true" /> Settings
          </ToolButton>
          {headerActions}
        </HeaderRight>
      </Header>

      {/* Filters bar */}
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

      {/* Block grid (CompactBlockCard with QuickPlanModal wired internally) */}
      <BlockGrid
        blocks={filteredBlocks}
        farmId={farmId}
        config={config}
        onBlockUpdate={refetch}
      />

      {/* Settings modal */}
      <DashboardSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        config={config}
        onConfigChange={updateConfig}
      />

    </Wrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

/* Header styled to match PhysicalBlockGrid for visual parity across views. */
const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`;

const Title = styled.h2`
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const BlockCount = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  margin-top: 4px;
  display: block;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const ToolButton = styled.button`
  ${glassControl}
  padding: 8px 14px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const RefreshButton = styled(ToolButton)`
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const RefreshIcon = styled.span<{ $spinning: boolean }>`
  display: inline-flex;
  animation: ${({ $spinning }) => ($spinning ? 'spin 1s linear infinite' : 'none')};

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
`;

const StateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 12px;
`;

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const StateIconWrap = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
`;

const StateText = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

// Destructive tone: coral-b tinted glass, never solid red (spec §4).
const ErrorBox = styled.div`
  padding: 24px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error}66;
  border-radius: 12px;
  text-align: center;
  max-width: 480px;
  margin: 0 auto;
`;

const ErrorIconWrap = styled.div`
  color: ${({ theme }) => theme.colors.error};
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
`;

const ErrorTitle = styled.h3`
  font-size: 17px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.error};
  margin: 0 0 8px 0;
`;

const ErrorMessage = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 16px 0;
`;

const RetryButton = styled.button`
  ${monoLabel}
  padding: 8px 20px;
  border: 1px solid ${({ theme }) => theme.colors.error}66;
  border-radius: 8px;
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.72rem;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.error}22;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.error};
    outline-offset: 2px;
  }
`;
