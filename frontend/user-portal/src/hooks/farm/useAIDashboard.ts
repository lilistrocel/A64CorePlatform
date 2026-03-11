/**
 * useAIDashboard Hook
 *
 * Custom hook for fetching and managing AI Dashboard inspection reports.
 * Reports are generated every 4 hours by the backend, or manually by admins.
 * Follows the useState/useCallback pattern used across this codebase.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../services/api';
import type { DashboardReport } from '../../types/aiDashboard';

// ============================================================================
// RETURN TYPE
// ============================================================================

interface UseAIDashboardReturn {
  report: DashboardReport | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  generate: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useAIDashboard(): UseAIDashboardReturn {
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch the latest completed inspection report from the API.
   * A 404 means no reports exist yet — treated as an empty state, not an error.
   */
  const fetchLatest = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get<{ data: DashboardReport; message: string }>(
        '/v1/farm/ai-dashboard/latest'
      );

      setReport(response.data.data);
    } catch (err: unknown) {
      // 404 means no reports exist yet — this is an empty state, not an error
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        (err as { response?: { status?: number } }).response?.status === 404
      ) {
        setReport(null);
        setError(null);
      } else {
        const message =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { data?: { detail?: string; message?: string } } })
                .response?.data?.detail ||
              (err as { response?: { data?: { detail?: string; message?: string } } })
                .response?.data?.message ||
              'Failed to fetch inspection report'
            : 'Failed to fetch inspection report';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Trigger a new inspection report generation.
   * This is a long-running operation (30-60 seconds) — uses the `generating` flag
   * rather than `loading` to allow the UI to show a distinct in-progress state.
   * Auto-refreshes the report after generation completes.
   */
  const generate = useCallback(async () => {
    try {
      setGenerating(true);
      setError(null);

      const response = await apiClient.post<{ data: DashboardReport; message: string }>(
        '/v1/farm/ai-dashboard/generate'
      );

      setReport(response.data.data);
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { detail?: string; message?: string } } })
              .response?.data?.detail ||
            (err as { response?: { data?: { detail?: string; message?: string } } })
              .response?.data?.message ||
            'Failed to generate inspection report'
          : 'Failed to generate inspection report';
      setError(message);
    } finally {
      setGenerating(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  return {
    report,
    loading,
    generating,
    error,
    refresh: fetchLatest,
    generate,
  };
}
