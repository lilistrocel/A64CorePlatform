/**
 * useDashboardData Hook
 *
 * Fetches and caches farm dashboard data with auto-refresh capability.
 * Follows the implementation plan structure.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../services/api';
import type { DashboardData } from '../../types/farm';

interface UseDashboardDataOptions {
  farmId: string | null;
  farmingYear?: number | null;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds, default 30s
}

interface UseDashboardDataReturn {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage dashboard data for a specific farm
 *
 * @param options - Configuration options
 * @returns Dashboard data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * const { data, loading, error, refetch } = useDashboardData({
 *   farmId: selectedFarmId,
 *   autoRefresh: true,
 *   refreshInterval: 30000 // 30 seconds
 * });
 * ```
 */
export function useDashboardData({
  farmId,
  farmingYear,
  autoRefresh = false,
  refreshInterval = 30000,
}: UseDashboardDataOptions): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch dashboard data from API.
   *
   * @param silent When true, does not toggle `loading` or clear `data`
   *   beforehand — the stale data stays rendered until the fresh response
   *   arrives, which replaces it seamlessly. Used by the auto-refresh
   *   interval so the screen doesn't flash a full-page loading state (and
   *   unmount open modals rooted in block cards) every 30 seconds.
   */
  const fetchDashboard = useCallback(async (silent: boolean = false) => {
    if (!farmId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
        setData(null); // Prevent old blockIds rendering with a new farmId
      }
      setError(null);

      // Build params with optional farmingYear filter
      const params: Record<string, any> = {};
      if (farmingYear !== null && farmingYear !== undefined) {
        params.farmingYear = farmingYear;
      }

      const response = await apiClient.get<DashboardData>(
        `/v1/farm/dashboard/farms/${farmId}`,
        { params }
      );

      setData(response.data);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);

      if (err.response?.status === 404) {
        setError('Farm not found');
      } else if (err.response?.status === 403) {
        setError('Access denied to this farm');
      } else if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Failed to load dashboard data');
      }

      // Only wipe data on non-silent fetches. Silent (auto-refresh)
      // failures keep the last-known-good data visible.
      if (!silent) {
        setData(null);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [farmId, farmingYear]);

  /**
   * Manual refetch function — shows the loading state (user-initiated
   * refreshes should give immediate visual feedback).
   */
  const refetch = useCallback(async () => {
    await fetchDashboard(false);
  }, [fetchDashboard]);

  /**
   * Initial fetch when farmId / farmingYear changes — clears stale data.
   */
  useEffect(() => {
    fetchDashboard(false);
  }, [fetchDashboard]);

  /**
   * Auto-refresh interval — silent so the page doesn't flash to a loading
   * spinner every 30 seconds and unmount modals rooted in block cards.
   */
  useEffect(() => {
    if (!autoRefresh || !farmId) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchDashboard(true);
    }, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [autoRefresh, farmId, refreshInterval, fetchDashboard]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}
