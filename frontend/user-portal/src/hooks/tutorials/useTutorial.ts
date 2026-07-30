/**
 * Tutorial seen-state
 *
 * Stored per user on the server (users.metadata.tutorialsSeen) rather than in
 * localStorage, so dismissing a tour on the bench laptop keeps it dismissed in
 * the office — and a new team member gets the tour even on a shared browser.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';

const KEY = ['tutorials', 'seen'] as const;

export function useSeenTutorials() {
  return useQuery<string[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await apiClient.get('/v1/users/me/tutorials');
      return data.seen ?? [];
    },
    // Read once per session — this changes only when the user dismisses one,
    // and that path updates the cache directly.
    staleTime: Infinity,
  });
}

export function useMarkTutorialSeen() {
  const qc = useQueryClient();
  return useMutation<{ topic: string }, Error, string>({
    mutationFn: async (topic) => {
      const { data } = await apiClient.post(`/v1/users/me/tutorials/${topic}/seen`);
      return data;
    },
    // Optimistic: the modal closes immediately, so the list must reflect that
    // before the round trip lands or a remount could re-open it.
    onMutate: async (topic) => {
      const previous = qc.getQueryData<string[]>(KEY) ?? [];
      if (!previous.includes(topic)) {
        qc.setQueryData<string[]>(KEY, [...previous, topic]);
      }
      return { previous };
    },
    onError: (_e, _topic, context) => {
      const prev = (context as { previous?: string[] } | undefined)?.previous;
      if (prev) qc.setQueryData(KEY, prev);
    },
  });
}

export function useResetTutorials() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await apiClient.delete('/v1/users/me/tutorials');
    },
    onSuccess: () => qc.setQueryData(KEY, []),
  });
}
