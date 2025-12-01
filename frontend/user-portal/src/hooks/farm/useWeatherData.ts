/**
 * Weather Data Hook
 *
 * Custom hook for fetching and managing agricultural weather data.
 * Includes auto-refresh functionality and error handling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { weatherApi } from '../../services/weatherApi';
import type { AgriWeatherData } from '../../types/farm';

interface UseWeatherDataOptions {
  /** Enable auto-refresh (default: true) */
  autoRefresh?: boolean;
  /** Refresh interval in milliseconds (default: 5 minutes) */
  refreshInterval?: number;
}

interface UseWeatherDataReturn {
  /** Agricultural weather data */
  data: AgriWeatherData | null;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Manually refresh data */
  refetch: () => Promise<void>;
  /** Last successful fetch timestamp */
  lastUpdated: Date | null;
}

/**
 * Hook for fetching agricultural weather data for a farm
 *
 * @param farmId - Farm UUID (null to disable fetching)
 * @param options - Configuration options
 * @returns Weather data state and controls
 */
export function useWeatherData(
  farmId: string | null,
  options: UseWeatherDataOptions = {}
): UseWeatherDataReturn {
  const {
    autoRefresh = true,
    refreshInterval = 5 * 60 * 1000, // 5 minutes
  } = options;

  const [data, setData] = useState<AgriWeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchWeatherData = useCallback(async () => {
    if (!farmId) {
      setData(null);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const weatherData = await weatherApi.getAgriData(farmId);
      setData(weatherData);
      setLastUpdated(new Date());

    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to load weather data';

      // Check for specific error types
      if (errorMessage.includes('400')) {
        setError('Farm does not have location coordinates configured');
      } else if (errorMessage.includes('403')) {
        setError('You do not have access to this farm\'s weather data');
      } else if (errorMessage.includes('503') || errorMessage.includes('Service')) {
        setError('Weather service temporarily unavailable');
      } else {
        setError(errorMessage);
      }

      console.error('Error fetching weather data:', err);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  // Initial fetch
  useEffect(() => {
    fetchWeatherData();
  }, [fetchWeatherData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && farmId) {
      intervalRef.current = setInterval(fetchWeatherData, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, farmId, refreshInterval, fetchWeatherData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchWeatherData,
    lastUpdated,
  };
}

/**
 * Hook for checking if a farm has weather data capability
 *
 * @param farm - Farm object
 * @returns Whether weather data is available for this farm
 */
export function useHasWeatherCapability(farm: {
  location?: {
    latitude?: number;
    longitude?: number;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
} | null): boolean {
  if (!farm || !farm.location) return false;

  // Check for direct latitude/longitude (backend model)
  const directLat = farm.location.latitude;
  const directLon = farm.location.longitude;

  if (directLat !== undefined && directLat !== null &&
      directLon !== undefined && directLon !== null) {
    return true;
  }

  // Check for nested coordinates (frontend model)
  const coords = farm.location.coordinates;
  if (coords && coords.latitude !== undefined && coords.longitude !== undefined) {
    return true;
  }

  return false;
}
