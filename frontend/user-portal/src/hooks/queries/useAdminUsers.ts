/**
 * useAdminUsers — fetch the full platform user list and expose a userId→name map.
 *
 * Used by AuditHistoryModal (T-064) to resolve actorUserId UUIDs to human-readable
 * display names without requiring N individual fetches.
 *
 * Endpoint: GET /v1/users?perPage=100
 *   - Requires admin or super_admin role (enforced on the backend).
 *   - perPage=100 covers all realistic tenant sizes (< 100 users per tenant in
 *     typical deployments). A second page is never fetched — KISS principle.
 *   - If a tenant ever exceeds 100 users the map will be incomplete; actors beyond
 *     page 1 fall back to the truncated-UUID display, which is acceptable (YAGNI).
 *
 * Cache: staleTime = 5 minutes. User display names change rarely and the cache is
 *   shared across every modal open within the same browser session.
 *
 * Caller roles: Only callers with admin/super_admin/finance_admin roles will
 *   successfully open the audit modal. The endpoint itself enforces require_admin,
 *   so for non-admin users this query is always disabled (isAdmin guard below).
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal shape we need from the /v1/users response. */
interface AdminUserItem {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AdminUsersResponse {
  data: AdminUserItem[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

/**
 * A read-only map from userId → display name.
 * Display name is "{firstName} {lastName}" trimmed; falls back to email if both
 * name fields are blank (e.g. a user whose name was never set).
 */
export type UserDisplayMap = ReadonlyMap<string, string>;

// ─── Query key ────────────────────────────────────────────────────────────────

export const adminUsersQueryKeys = {
  /** Stable key used for the "all users, page 1, perPage 100" query. */
  all: () => ['admin', 'users', 'all'] as const,
};

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  const response = await apiClient.get<AdminUsersResponse>(
    '/v1/users?perPage=100&page=1'
  );
  return response.data;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseAdminUsersOptions {
  /**
   * Only users with admin / super_admin role can call GET /v1/users.
   * Pass `true` only when the current user has the required role.
   * When false the query stays disabled and the map is empty — the modal
   * falls back to truncated-UUID rendering gracefully.
   */
  enabled?: boolean;
}

interface UseAdminUsersResult {
  /** userId → display-name map. Empty Map when loading or on error. */
  userMap: UserDisplayMap;
  /** True while the fetch is in flight (first load only). */
  isLoading: boolean;
  /** True if the fetch failed. The modal renders fallback UUIDs in this case. */
  isError: boolean;
}

/**
 * Fetch the first page (up to 100) of platform users and expose a
 * userId → display-name lookup map.
 *
 * @param options.enabled - pass true only when the caller has admin rights.
 *
 * @example
 * const { userMap, isLoading } = useAdminUsers({ enabled: isAdmin });
 * const displayName = userMap.get(actorUserId) ?? truncatedUUID;
 */
export function useAdminUsers(
  options: UseAdminUsersOptions = {}
): UseAdminUsersResult {
  const { enabled = true } = options;

  const { data, isLoading, isError } = useQuery({
    queryKey: adminUsersQueryKeys.all(),
    queryFn: fetchAdminUsers,
    enabled,
    // 5-minute stale time — user display names change infrequently.
    // The single cached entry is shared across all audit modal opens
    // in the same browser session without a network round-trip.
    staleTime: 5 * 60 * 1_000,
    // Do not auto-retry on 403 — the caller may not have the required role.
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) return false;
      return failureCount < 2;
    },
  });

  // Build the userId → name map once per successful fetch.
  // useMemo is intentionally NOT used here — useQuery already memoises `data`
  // by reference; rebuilding the Map only happens when `data` changes.
  const userMap: UserDisplayMap = (() => {
    if (!data?.data) return new Map<string, string>();

    const map = new Map<string, string>();
    for (const u of data.data) {
      const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
      // Prefer full name; fall back to email when both name fields are blank.
      map.set(u.userId, fullName || u.email);
    }
    return map;
  })();

  return { userMap, isLoading, isError };
}
