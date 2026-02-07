/**
 * MFA Query Hooks
 *
 * React Query hooks for MFA-related data fetching
 * Optimized to prevent unnecessary API calls and preserve QR codes
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import { queryKeys } from '../../config/react-query.config';

/**
 * MFA Setup Response interface
 */
export interface MFASetupResponse {
  secret: string;
  qrCodeUri: string;
  qrCodeDataUrl: string | null;
  message: string;
}

/**
 * MFA Enable Response interface
 */
export interface MFAEnableResponse {
  enabled: boolean;
  backupCodes: string[];
  message: string;
}

/**
 * MFA Status Response interface
 */
export interface MFAStatusResponse {
  isEnabled: boolean;
  setupRequired: boolean;
  backupCodesRemaining: number;
  lastUsed: string | null;
  mfaEnabled: boolean;
  mfaSetupPending: boolean;
  hasBackupCodes: boolean;
}

// Cache key for sessionStorage persistence across browser sessions
const MFA_SETUP_CACHE_KEY = 'mfa_setup_pending';
const MFA_SETUP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface CachedMFASetup {
  data: MFASetupResponse;
  timestamp: number;
}

/**
 * Get cached setup data from sessionStorage
 */
function getCachedSetupData(): MFASetupResponse | null {
  try {
    const cached = sessionStorage.getItem(MFA_SETUP_CACHE_KEY);
    if (!cached) return null;

    const parsed: CachedMFASetup = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;

    // Check if cached data has expired (10 minutes)
    if (age > MFA_SETUP_EXPIRY_MS) {
      sessionStorage.removeItem(MFA_SETUP_CACHE_KEY);
      return null;
    }

    return parsed.data;
  } catch {
    sessionStorage.removeItem(MFA_SETUP_CACHE_KEY);
    return null;
  }
}

/**
 * Save setup data to sessionStorage
 */
function setCachedSetupData(data: MFASetupResponse): void {
  try {
    const cacheEntry: CachedMFASetup = {
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(MFA_SETUP_CACHE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear cached setup data from sessionStorage
 */
export function clearMFASetupCache(): void {
  try {
    sessionStorage.removeItem(MFA_SETUP_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook to fetch MFA setup data (TOTP secret and QR code)
 *
 * Features:
 * - 10-minute stale time to prevent unnecessary refetches
 * - No refetch on window focus, mount, or reconnect
 * - Persists to sessionStorage for tab/visibility changes
 * - QR code cached in component state
 *
 * @param enabled - Whether to enable the query (default: true)
 */
export function useMFASetup(enabled: boolean = true) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.mfa.setup(),
    queryFn: async (): Promise<MFASetupResponse> => {
      // Check sessionStorage cache first
      const cachedData = getCachedSetupData();
      if (cachedData) {
        return cachedData;
      }

      // Fetch fresh setup data from API
      const response = await apiClient.post<MFASetupResponse>('/v1/auth/mfa/setup');
      const data = response.data;

      // Cache to sessionStorage for persistence across page visibility changes
      setCachedSetupData(data);

      return data;
    },
    enabled,
    // 10-minute stale time - data is considered fresh for 10 minutes
    staleTime: MFA_SETUP_EXPIRY_MS,
    // Keep in cache for 15 minutes
    gcTime: 15 * 60 * 1000,
    // Never refetch automatically - user must explicitly retry
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // Don't retry failed setup requests automatically
    retry: false,
  });
}

/**
 * Hook to enable MFA with TOTP code verification
 *
 * On success:
 * - Clears the MFA setup cache
 * - Invalidates MFA status query
 */
export function useEnableMFA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (totpCode: string): Promise<MFAEnableResponse> => {
      const response = await apiClient.post<MFAEnableResponse>('/v1/auth/mfa/enable', {
        totpCode,
      });
      return response.data;
    },
    onSuccess: () => {
      // Clear sessionStorage cache after successful MFA enable
      clearMFASetupCache();
      // Remove setup query from React Query cache
      queryClient.removeQueries({ queryKey: queryKeys.mfa.setup() });
      // Invalidate MFA status to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.mfa.status() });
    },
  });
}

/**
 * Hook to fetch MFA status
 */
export function useMFAStatus(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.mfa.status(),
    queryFn: async (): Promise<MFAStatusResponse> => {
      const response = await apiClient.get<MFAStatusResponse>('/v1/auth/mfa/status');
      return response.data;
    },
    enabled,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Clear all MFA-related caches (both React Query and sessionStorage)
 */
export function useClearMFACache() {
  const queryClient = useQueryClient();

  return () => {
    clearMFASetupCache();
    queryClient.removeQueries({ queryKey: queryKeys.mfa.setup() });
  };
}
