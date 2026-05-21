/**
 * Organizations — TanStack Query hooks
 *
 * Used by the Tenant Setup Wizard to list and create top-level organizations.
 *
 * - useOrganizations()     — query: list all organizations
 * - useCreateOrganization() — mutation: create a new organization
 * - useAssignUserOrg()      — mutation: assign user to an organization
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listOrganizations,
  createOrganization,
  assignUserOrganization,
} from '../../services/tenantBootstrapService';
import type {
  CreateOrganizationPayload,
  UserOrganizationAssignment,
} from '../../services/tenantBootstrapService';

// ─── Query key factory ────────────────────────────────────────────────────────

export const organizationsQueryKeys = {
  all: ['organizations'] as const,
  list: () => ['organizations', 'list'] as const,
};

// ─── Read hooks ───────────────────────────────────────────────────────────────

/**
 * List all active organizations.
 * Organizations are long-lived — 2-minute staleTime to reduce refetches.
 */
export function useOrganizations() {
  return useQuery({
    queryKey: organizationsQueryKeys.list(),
    queryFn: listOrganizations,
    staleTime: 2 * 60_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Create a new organization (super_admin only).
 * Invalidates the organizations list on success.
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOrganizationPayload) => createOrganization(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationsQueryKeys.all });
    },
  });
}

/**
 * Assign a user to an organization (super_admin only).
 * Does NOT invalidate organizations — it only changes the user doc.
 */
export function useAssignUserOrg() {
  return useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: UserOrganizationAssignment;
    }) => assignUserOrganization(userId, payload),
  });
}
