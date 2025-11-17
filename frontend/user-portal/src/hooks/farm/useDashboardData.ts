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
  autoRefresh = false,
  refreshInterval = 30000,
}: UseDashboardDataOptions): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch dashboard data from API
   */
  const fetchDashboard = useCallback(async () => {
    if (!farmId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get<DashboardData>(
        `/v1/farm/dashboard/farms/${farmId}`
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

      setData(null);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    await fetchDashboard();
  }, [fetchDashboard]);

  /**
   * Initial fetch when farmId changes
   */
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  /**
   * Auto-refresh interval
   */
  useEffect(() => {
    if (!autoRefresh || !farmId) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchDashboard();
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
