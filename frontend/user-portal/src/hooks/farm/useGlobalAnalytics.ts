/**
 * useGlobalAnalytics Hook
 *
 * Custom hook for fetching and managing global analytics data across all farms.
 * Provides system-wide statistics and insights.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../services/api';
import type { GlobalAnalyticsData, TimePeriod } from '../../types/global-analytics';

interface UseGlobalAnalyticsReturn {
  analytics: GlobalAnalyticsData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetch global analytics from API
 */
export function useGlobalAnalytics(
  period: TimePeriod = '30d'
): UseGlobalAnalyticsReturn {
  const [analytics, setAnalytics] = useState<GlobalAnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const url = '/v1/farm/farms/analytics/global';
      const params = period !== 'all' ? { period } : {};

      const response = await apiClient.get<any>(url, { params });

      // Handle envelope response format: { data: GlobalAnalyticsData, message: string }
      const analyticsData = response.data.data || response.data;
      setAnalytics(analyticsData);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching global analytics:', err);
      setError(new Error(err.response?.data?.detail || err.message || 'Failed to fetch global analytics'));
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

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
