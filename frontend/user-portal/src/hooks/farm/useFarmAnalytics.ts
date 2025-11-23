/**
 * useFarmAnalytics Hook
 *
 * Custom hook for fetching and managing farm-level analytics data.
 * Aggregates statistics from all blocks in a farm.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../services/api';
import type { FarmAnalytics } from '../../types/farmAnalytics';
import type { TimePeriod } from '../../types/analytics';

interface UseFarmAnalyticsReturn {
  analytics: FarmAnalytics | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetch farm-level analytics from API
 */
export function useFarmAnalytics(
  farmId: string | null,
  period: TimePeriod = '30d'
): UseFarmAnalyticsReturn {
  const [analytics, setAnalytics] = useState<FarmAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!farmId) {
      setError(new Error('Farm ID is required'));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const url = `/v1/farm/farms/${farmId}/analytics`;
      const params = period !== 'all' ? { period } : {};

      const response = await apiClient.get<any>(url, { params });

      // Handle envelope response format: { data: FarmAnalytics, message: string }
      const analyticsData = response.data.data || response.data;
      setAnalytics(analyticsData);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching farm analytics:', err);
      setError(new Error(err.response?.data?.detail || err.message || 'Failed to fetch farm analytics'));
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [farmId, period]);

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
