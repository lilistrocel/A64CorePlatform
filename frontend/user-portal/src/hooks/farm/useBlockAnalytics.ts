/**
 * useBlockAnalytics Hook
 *
 * Custom hook for fetching and managing block analytics data.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../services/api';
import type { BlockAnalytics, TimePeriod } from '../../types/analytics';

interface UseBlockAnalyticsReturn {
  analytics: BlockAnalytics | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetch block analytics from API
 */
export function useBlockAnalytics(
  farmId: string,
  blockId: string,
  period: TimePeriod = '30d'
): UseBlockAnalyticsReturn {
  const [analytics, setAnalytics] = useState<BlockAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!farmId || !blockId) {
      setError(new Error('Farm ID and Block ID are required'));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const url = `/v1/farm/farms/${farmId}/blocks/${blockId}/analytics`;
      const params = period !== 'all' ? { period } : {};

      const response = await apiClient.get<any>(url, { params });

      // Handle envelope response format: { data: BlockAnalytics, message: string }
      const analyticsData = response.data.data || response.data;
      setAnalytics(analyticsData);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching block analytics:', err);
      setError(new Error(err.response?.data?.detail || err.message || 'Failed to fetch analytics'));
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [farmId, blockId, period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    analytics,
    loading,
    error,
    refetch: fetchAnalytics,
  };
}
