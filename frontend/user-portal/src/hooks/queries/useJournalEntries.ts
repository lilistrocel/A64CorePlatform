/**
 * Journal Entries — TanStack Query hooks
 *
 * - useJournalEntries         — paginated list with filters
 * - useJournalEntry           — single JE with lines (for row-expand)
 * - useReverseJournalEntry    — mutation to reverse a posted JE
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as jeService from '../../services/journalEntriesService';
import type {
  ListJournalEntriesParams,
  ManualJECreateRequest,
  ManualJECreateResponse,
} from '../../services/journalEntriesService';

// ─── Query key factory ─────────────────────────────────────────────────────────

export const jeQueryKeys = {
  all: (orgId: string) => ['finance', 'journal-entries', orgId] as const,
  list: (params: ListJournalEntriesParams) =>
    ['finance', 'journal-entries', params.organizationId, 'list', params] as const,
  detail: (jeId: string) =>
    ['finance', 'journal-entries', 'detail', jeId] as const,
};

// ─── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Paginated list of journal entries with filtering.
 */
export function useJournalEntries(params: ListJournalEntriesParams) {
  return useQuery({
    queryKey: jeQueryKeys.list(params),
    queryFn: () => jeService.listJournalEntries(params),
    enabled: !!params.organizationId,
    staleTime: 30_000,
  });
}

/**
 * Single JE with lines.
 * Used for row-expand: fetch on demand when the user expands a row.
 * Disabled until jeId is truthy.
 */
export function useJournalEntry(jeId: string | null, organizationId: string) {
  return useQuery({
    queryKey: jeQueryKeys.detail(jeId!),
    queryFn: () => jeService.getJournalEntry(jeId!, organizationId),
    enabled: !!jeId && !!organizationId,
    staleTime: 60_000,   // JEs are immutable — longer cache is fine
  });
}

/**
 * Mutation: create a manual (correcting / adjusting) journal entry.
 * On success, invalidates the JE list and downstream caches so the new JE
 * appears immediately in the list page and financial reports are re-fetched.
 *
 * Returns ManualJECreateResponse — the caller should inspect meta.warnings[]
 * and show a warning toast if non-empty.
 */
export function useCreateManualJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation<ManualJECreateResponse, unknown, ManualJECreateRequest>({
    mutationFn: (body: ManualJECreateRequest) =>
      jeService.createManualJournalEntry(body),
    onSuccess: (_result, variables) => {
      // Invalidate JE list queries for this org so the new JE appears
      queryClient.invalidateQueries({
        queryKey: ['finance', 'journal-entries', variables.organizationId],
      });
      // A new JE changes trial balance, reports, etc.
      queryClient.invalidateQueries({ queryKey: ['finance', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'trial-balance'] });
    },
  });
}

/**
 * Mutation: reverse a posted journal entry.
 * On success, invalidates the JE list so the original row shows as void
 * and the new reversal JE appears.
 */
export function useReverseJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      jeId,
      orgId,
      reason,
    }: {
      jeId: string;
      orgId: string;
      reason: string;
    }) => jeService.reverseJournalEntry(jeId, orgId, reason),
    onSuccess: (_result, variables) => {
      // Invalidate all JE list queries for this org so the list refreshes
      queryClient.invalidateQueries({
        queryKey: ['finance', 'journal-entries', variables.orgId],
      });
      // Reversing a JE affects downstream payments + reports — refresh them
      // so the "Reversed" badge appears on the Vendor Payments list and
      // balances update on Vendor Sub-Ledger, AP Aging, and Trial Balance.
      queryClient.invalidateQueries({ queryKey: ['finance', 'ap-payments'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'ap-totals-paid'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'vendor-sub-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'ap-aging'] });
    },
  });
}
