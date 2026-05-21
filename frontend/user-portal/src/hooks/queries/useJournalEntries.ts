/**
 * Journal Entries — TanStack Query hooks
 *
 * - useJournalEntries         — paginated list with filters
 * - useJournalEntry           — single JE with lines (for row-expand)
 * - useReverseJournalEntry    — mutation to reverse a posted JE
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as jeService from '../../services/journalEntriesService';
import type { ListJournalEntriesParams } from '../../services/journalEntriesService';

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
    },
  });
}
