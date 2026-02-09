/**
 * useDashboardFilters Hook
 *
 * Provides filtering and sorting logic for dashboard blocks.
 * Follows the implementation plan structure.
 *
 * Features:
 * - State, search, performance, and farming year filters
 * - Persistent farming year selection across page navigation
 * - Filter summary display support
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
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

// Storage key for persisting farming year selection
const FARMING_YEAR_STORAGE_KEY = 'dashboard_farming_year_filter';

/**
 * Get persisted farming year from sessionStorage
 */
function getPersistedFarmingYear(): number | null {
  try {
    const stored = sessionStorage.getItem(FARMING_YEAR_STORAGE_KEY);
    if (stored === null) return null;
    const parsed = JSON.parse(stored);
    return typeof parsed === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist farming year to sessionStorage
 */
function persistFarmingYear(year: number | null): void {
  try {
    if (year === null) {
      sessionStorage.removeItem(FARMING_YEAR_STORAGE_KEY);
    } else {
      sessionStorage.setItem(FARMING_YEAR_STORAGE_KEY, JSON.stringify(year));
    }
  } catch {
    // Ignore storage errors
  }
}

export interface FilterState {
  states: Set<DashboardBlockStatus>;
  searchQuery: string;
  performanceCategories: Set<PerformanceCategory>;
  showDelayedOnly: boolean;
  showAlertsOnly: boolean;
  /** Selected farming year filter (null = all years) */
  farmingYear: number | null;
}

export interface UseDashboardFiltersReturn {
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

  // Farming year filter
  setFarmingYearFilter: (year: number | null) => void;
  resetFarmingYearFilter: () => void;

  // Sort state
  sortBy: SortOption;
  sortDirection: SortDirection;
  setSortBy: (sort: SortOption) => void;
  setSortDirection: (direction: SortDirection) => void;
  toggleSortDirection: () => void;

  // Metrics
  totalBlocks: number;
  filteredCount: number;

  // Filter summary
  filterSummary: string;
  hasActiveFilters: boolean;
}

const initialFilterState: FilterState = {
  states: new Set(),
  searchQuery: '',
  performanceCategories: new Set(),
  showDelayedOnly: false,
  showAlertsOnly: false,
  farmingYear: getPersistedFarmingYear(),
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

  /**
   * Set farming year filter (persisted to sessionStorage)
   */
  const setFarmingYearFilter = useCallback((farmingYear: number | null) => {
    persistFarmingYear(farmingYear);
    setFilters((prev) => ({ ...prev, farmingYear }));
  }, []);

  /**
   * Reset farming year filter to null (all years)
   */
  const resetFarmingYearFilter = useCallback(() => {
    persistFarmingYear(null);
    setFilters((prev) => ({ ...prev, farmingYear: null }));
  }, []);

  const clearFilters = () => {
    // When clearing all filters, also reset farming year but keep it persisted as null
    persistFarmingYear(null);
    setFilters({
      ...initialFilterState,
      farmingYear: null,
    });
  };

  /**
   * Sort controls
   */
  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  /**
   * Check if any filters are active
   */
  const hasActiveFilters = useMemo(() => {
    return (
      filters.states.size > 0 ||
      filters.searchQuery.trim() !== '' ||
      filters.performanceCategories.size > 0 ||
      filters.showDelayedOnly ||
      filters.showAlertsOnly ||
      filters.farmingYear !== null
    );
  }, [filters]);

  /**
   * Generate human-readable filter summary
   */
  const filterSummary = useMemo(() => {
    const parts: string[] = [];

    if (filters.farmingYear !== null) {
      // Format farming year display (e.g., "FY 2025" or year range if available)
      parts.push(`Farming Year: ${filters.farmingYear}`);
    }

    if (filters.states.size > 0) {
      const statesList = Array.from(filters.states).join(', ');
      parts.push(`States: ${statesList}`);
    }

    if (filters.searchQuery.trim()) {
      parts.push(`Search: "${filters.searchQuery.trim()}"`);
    }

    if (filters.performanceCategories.size > 0) {
      const perfList = Array.from(filters.performanceCategories).join(', ');
      parts.push(`Performance: ${perfList}`);
    }

    if (filters.showDelayedOnly) {
      parts.push('Delayed Only');
    }

    if (filters.showAlertsOnly) {
      parts.push('With Alerts');
    }

    if (parts.length === 0) {
      return 'No filters applied';
    }

    return parts.join(' | ');
  }, [filters]);

  return {
    filteredBlocks,
    filters,
    setStateFilter,
    setSearchQuery,
    setPerformanceFilter,
    setShowDelayedOnly,
    setShowAlertsOnly,
    clearFilters,
    setFarmingYearFilter,
    resetFarmingYearFilter,
    sortBy,
    sortDirection,
    setSortBy,
    setSortDirection,
    toggleSortDirection,
    totalBlocks: blocks.length,
    filteredCount: filteredBlocks.length,
    filterSummary,
    hasActiveFilters,
  };
}
