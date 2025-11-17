/**
 * useBlockActions Hook
 *
 * Provides quick action functions for dashboard blocks (transitions and harvests).
 * Follows the implementation plan structure.
 */

import { useState, useCallback } from 'react';
import { apiClient } from '../../services/api';
import type {
  DashboardBlock,
  QuickTransitionRequest,
  QuickHarvestRequest,
} from '../../types/farm';

interface UseBlockActionsReturn {
  // Transition
  transitionBlock: (
    farmId: string,
    blockId: string,
    request: QuickTransitionRequest
  ) => Promise<DashboardBlock>;
  transitioning: boolean;
  transitionError: string | null;

  // Harvest
  recordHarvest: (
    farmId: string,
    blockId: string,
    request: QuickHarvestRequest
  ) => Promise<DashboardBlock>;
  recordingHarvest: boolean;
  harvestError: string | null;

  // Clear errors
  clearErrors: () => void;
}

/**
 * Hook to perform quick actions on dashboard blocks
 *
 * @returns Functions to transition state and record harvests
 *
 * @example
 * ```tsx
 * const { transitionBlock, recordHarvest, transitioning } = useBlockActions();
 *
 * // Quick transition
 * await transitionBlock(farmId, blockId, {
 *   newState: 'growing',
 *   notes: 'Transitioned from dashboard'
 * });
 *
 * // Quick harvest
 * await recordHarvest(farmId, blockId, {
 *   quantityKg: 25.5,
 *   qualityGrade: 'A',
 *   notes: 'Morning harvest'
 * });
 * ```
 */
export function useBlockActions(): UseBlockActionsReturn {
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const [recordingHarvest, setRecordingHarvest] = useState(false);
  const [harvestError, setHarvestError] = useState<string | null>(null);

  /**
   * Quick transition to new state
   */
  const transitionBlock = useCallback(
    async (
      farmId: string,
      blockId: string,
      request: QuickTransitionRequest
    ): Promise<DashboardBlock> => {
      try {
        setTransitioning(true);
        setTransitionError(null);

        const response = await apiClient.patch<{ data: DashboardBlock }>(
          `/v1/farm/dashboard/farms/${farmId}/blocks/${blockId}/quick-transition`,
          request
        );

        return response.data.data;
      } catch (err: any) {
        console.error('Error transitioning block:', err);

        let errorMessage = 'Failed to transition block';

        if (err.response?.status === 400) {
          errorMessage = err.response.data?.detail || 'Invalid transition';
        } else if (err.response?.status === 404) {
          errorMessage = 'Block not found';
        } else if (err.response?.data?.detail) {
          errorMessage = err.response.data.detail;
        }

        setTransitionError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setTransitioning(false);
      }
    },
    []
  );

  /**
   * Quick harvest recording
   */
  const recordHarvest = useCallback(
    async (
      farmId: string,
      blockId: string,
      request: QuickHarvestRequest
    ): Promise<DashboardBlock> => {
      try {
        setRecordingHarvest(true);
        setHarvestError(null);

        const response = await apiClient.post<{ data: DashboardBlock }>(
          `/v1/farm/dashboard/farms/${farmId}/blocks/${blockId}/quick-harvest`,
          request
        );

        return response.data.data;
      } catch (err: any) {
        console.error('Error recording harvest:', err);

        let errorMessage = 'Failed to record harvest';

        if (err.response?.status === 400) {
          errorMessage = err.response.data?.detail || 'Invalid harvest data';
        } else if (err.response?.status === 404) {
          errorMessage = 'Block not found';
        } else if (err.response?.data?.detail) {
          errorMessage = err.response.data.detail;
        }

        setHarvestError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setRecordingHarvest(false);
      }
    },
    []
  );

  /**
   * Clear all errors
   */
  const clearErrors = useCallback(() => {
    setTransitionError(null);
    setHarvestError(null);
  }, []);

  return {
    transitionBlock,
    transitioning,
    transitionError,
    recordHarvest,
    recordingHarvest,
    harvestError,
    clearErrors,
  };
}
