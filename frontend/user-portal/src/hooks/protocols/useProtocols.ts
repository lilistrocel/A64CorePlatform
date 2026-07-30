/**
 * Protocols (SOP) Hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../services/protocolsApi';
import type {
  CreateProtocolPayload,
  Protocol,
  UpdateProtocolPayload,
} from '../../types/protocols';
import type { Paginated } from '../../types/genetics';

const ROOT = ['protocols'] as const;

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ROOT });
}

export function useProtocols(params: api.ListProtocolsParams = {}) {
  return useQuery<Paginated<Protocol>>({
    queryKey: [...ROOT, 'list', params],
    queryFn: () => api.listProtocols(params),
  });
}

export function useProtocol(protocolId: string | undefined) {
  return useQuery<Protocol>({
    queryKey: [...ROOT, 'one', protocolId],
    queryFn: () => api.getProtocol(protocolId as string),
    enabled: !!protocolId,
  });
}

/**
 * Active protocols that apply at a given point of work. Cached for a while —
 * SOPs change rarely, and this runs on every modal open.
 */
export function useProtocolsForScope(scope: string | undefined) {
  return useQuery<Protocol[]>({
    queryKey: [...ROOT, 'scope', scope],
    queryFn: () => api.getProtocolsForScope(scope as string),
    enabled: !!scope,
    staleTime: 120_000,
  });
}

export function useCreateProtocol() {
  const invalidate = useInvalidate();
  return useMutation<Protocol, Error, CreateProtocolPayload>({
    mutationFn: api.createProtocol,
    onSuccess: invalidate,
  });
}

export function useUpdateProtocol(protocolId: string) {
  const invalidate = useInvalidate();
  return useMutation<Protocol, Error, UpdateProtocolPayload>({
    mutationFn: (payload) => api.updateProtocol(protocolId, payload),
    onSuccess: invalidate,
  });
}

export function useApproveProtocol(protocolId: string) {
  const invalidate = useInvalidate();
  return useMutation<Protocol, Error, string | undefined>({
    mutationFn: (approvedByName) => api.approveProtocol(protocolId, approvedByName),
    onSuccess: invalidate,
  });
}
