/**
 * React Query hooks for Finance Approval Rules.
 *
 * Query key pattern: ['finance', 'approval-rules', orgId, filters]
 * All mutations invalidate the list query so the table refreshes automatically.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listApprovalRules,
  createApprovalRule,
  updateApprovalRule,
  deleteApprovalRule,
  reactivateApprovalRule,
  resolveApprovalRule,
  type ListApprovalRulesParams,
  type ApprovalRuleCreate,
  type ApprovalRuleUpdate,
  type ResolveApprovalRuleParams,
} from '../../services/approvalRulesService';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const approvalRulesQueryKeys = {
  all: (orgId: string) => ['finance', 'approval-rules', orgId] as const,
  list: (orgId: string, filters: Omit<ListApprovalRulesParams, 'organizationId'>) =>
    ['finance', 'approval-rules', orgId, 'list', filters] as const,
  resolve: (orgId: string, params: Omit<ResolveApprovalRuleParams, 'organizationId'>) =>
    ['finance', 'approval-rules', orgId, 'resolve', params] as const,
};

// ─── List hook ────────────────────────────────────────────────────────────────

/**
 * Fetch paginated approval rules with optional filters.
 * Skips the query if orgId is empty (user not yet hydrated).
 */
export function useApprovalRules(
  orgId: string,
  filters: Omit<ListApprovalRulesParams, 'organizationId'> = {}
) {
  return useQuery({
    queryKey: approvalRulesQueryKeys.list(orgId, filters),
    queryFn: () => listApprovalRules({ organizationId: orgId, ...filters }),
    enabled: !!orgId,
    staleTime: 30_000, // 30s — approval rules don't change often
  });
}

// ─── Resolve hook (optional tester widget) ────────────────────────────────────

/**
 * Test whether a document would require approval under current rules.
 * Only runs when all params are populated and enabled=true.
 */
export function useResolveApprovalRule(
  orgId: string,
  params: Omit<ResolveApprovalRuleParams, 'organizationId'>,
  enabled = false
) {
  return useQuery({
    queryKey: approvalRulesQueryKeys.resolve(orgId, params),
    queryFn: () => resolveApprovalRule({ organizationId: orgId, ...params }),
    enabled: enabled && !!orgId && !!params.companyCode && !!params.docType,
    staleTime: 0, // always fresh for the tester widget
    retry: false,
  });
}

// ─── Create mutation ──────────────────────────────────────────────────────────

export function useCreateApprovalRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ApprovalRuleCreate) => createApprovalRule(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: approvalRulesQueryKeys.all(variables.organizationId),
      });
    },
  });
}

// ─── Update mutation ──────────────────────────────────────────────────────────

export function useUpdateApprovalRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ruleId,
      orgId,
      data,
    }: {
      ruleId: string;
      orgId: string;
      data: ApprovalRuleUpdate;
    }) => updateApprovalRule(ruleId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: approvalRulesQueryKeys.all(variables.orgId),
      });
    },
  });
}

// ─── Delete mutation ──────────────────────────────────────────────────────────

export function useDeleteApprovalRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ruleId }: { ruleId: string; orgId: string }) =>
      deleteApprovalRule(ruleId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: approvalRulesQueryKeys.all(variables.orgId),
      });
    },
  });
}

// ─── Reactivate mutation ──────────────────────────────────────────────────────

export function useReactivateApprovalRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ruleId }: { ruleId: string; orgId: string }) =>
      reactivateApprovalRule(ruleId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: approvalRulesQueryKeys.all(variables.orgId),
      });
    },
  });
}
