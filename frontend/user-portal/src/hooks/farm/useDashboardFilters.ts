/**
 * useDashboardFilters Hook
 *
 * Provides filtering and sorting logic for dashboard blocks.
 * Follows the implementation plan structure.
 */

import { useState, useMemo } from 'react';
import type { DashboardBlock, DashboardBlockStatus, PerformanceCategory } from '../../types/farm';

export type SortOption =
  | 'blockCode'
  | 'state'
  | 'daysInState'
  | 'capacity'
  | 'yieldProgress'
  | 'performance'
  | 'delay';

export type SortDirection = 'asc' | 'desc';

interface FilterState {
  states: Set<DashboardBlockStatus>;
  searchQuery: string;
  performanceCategories: Set<PerformanceCategory>;
  showDelayedOnly: boolean;
  showAlertsOnly: boolean;
}

interface UseDashboardFiltersReturn {
  // Filtered and sorted blocks
  filteredBlocks: DashboardBlock[];

  // Filter state
  filters: FilterState;
  setStateFilter: (states: Set<DashboardBlockStatus>) => void;
  setSearchQuery: (query: string) => void;
  setPerformanceFilter: (categories: Set<PerformanceCategory>) => void;
  setShowDelayedOnly: (show: boolean) => void;
  setShowAlertsOnly: (show: boolean) => void;
  clearFilters: () => void;

  // Sort state
  sortBy: SortOption;
  sortDirection: SortDirection;
  setSortBy: (sort: SortOption) => void;
  setSortDirection: (direction: SortDirection) => void;
  toggleSortDirection: () => void;

  // Metrics
  totalBlocks: number;
  filteredCount: number;
}

const initialFilterState: FilterState = {
  states: new Set(),
  searchQuery: '',
  performanceCategories: new Set(),
  showDelayedOnly: false,
  showAlertsOnly: false,
};

/**
 * Hook to filter and sort dashboard blocks
 *
 * @param blocks - Array of dashboard blocks to filter and sort
 * @returns Filtered blocks, filter controls, and sort controls
 *
 * @example
 * ```tsx
 * const {
 *   filteredBlocks,
 *   filters,
 *   setStateFilter,
 *   setSearchQuery,
 *   sortBy,
 *   setSortBy
 * } = useDashboardFilters(data.blocks);
 * ```
 */
export function useDashboardFilters(
  blocks: DashboardBlock[]
): UseDashboardFiltersReturn {
  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [sortBy, setSortBy] = useState<SortOption>('blockCode');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  /**
   * Filter blocks based on current filter state
   */
  const filteredBlocks = useMemo(() => {
    let result = [...blocks];

    // Filter by state
    if (filters.states.size > 0) {
      result = result.filter((block) => filters.states.has(block.state));
    }

    // Filter by search query (block code, name, or crop name)
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase().trim();
      result = result.filter(
        (block) =>
          block.blockCode.toLowerCase().includes(query) ||
          block.name?.toLowerCase().includes(query) ||
          block.targetCropName?.toLowerCase().includes(query)
      );
    }

    // Filter by performance category
    if (filters.performanceCategories.size > 0) {
      result = result.filter((block) =>
        filters.performanceCategories.has(block.calculated.performanceCategory)
      );
    }

    // Filter delayed blocks only
    if (filters.showDelayedOnly) {
      result = result.filter((block) => block.calculated.isDelayed);
    }

    // Filter blocks with alerts only
    if (filters.showAlertsOnly) {
      result = result.filter((block) => block.activeAlerts.length > 0);
    }

    // Sort blocks
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'blockCode':
          comparison = a.blockCode.localeCompare(b.blockCode);
          break;

        case 'state':
          comparison = a.state.localeCompare(b.state);
          break;

        case 'daysInState':
          comparison =
            a.calculated.daysInCurrentState - b.calculated.daysInCurrentState;
          break;

        case 'capacity':
          comparison =
            a.calculated.capacityPercent - b.calculated.capacityPercent;
          break;

        case 'yieldProgress':
          comparison = a.calculated.yieldProgress - b.calculated.yieldProgress;
          break;

        case 'performance':
          // Sort by performance category (exceptional > exceeding > excellent > good > acceptable > poor)
          const perfOrder: Record<PerformanceCategory, number> = {
            exceptional: 6,
            exceeding: 5,
            excellent: 4,
            good: 3,
            acceptable: 2,
            poor: 1,
          };
          comparison =
            perfOrder[a.calculated.performanceCategory] -
            perfOrder[b.calculated.performanceCategory];
          break;

        case 'delay':
          comparison = a.calculated.delayDays - b.calculated.delayDays;
          break;

        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [blocks, filters, sortBy, sortDirection]);

  /**
   * Filter setters
   */
  const setStateFilter = (states: Set<DashboardBlockStatus>) => {
    setFilters((prev) => ({ ...prev, states }));
  };

  const setSearchQuery = (searchQuery: string) => {
    setFilters((prev) => ({ ...prev, searchQuery }));
  };

  const setPerformanceFilter = (performanceCategories: Set<PerformanceCategory>) => {
    setFilters((prev) => ({ ...prev, performanceCategories }));
  };

  const setShowDelayedOnly = (showDelayedOnly: boolean) => {
    setFilters((prev) => ({ ...prev, showDelayedOnly }));
  };

  const setShowAlertsOnly = (showAlertsOnly: boolean) => {
    setFilters((prev) => ({ ...prev, showAlertsOnly }));
  };

  const clearFilters = () => {
    setFilters(initialFilterState);
  };

  /**
   * Sort controls
   */
  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  return {
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
    setSortDirection,
    toggleSortDirection,
    totalBlocks: blocks.length,
    filteredCount: filteredBlocks.length,
  };
}
