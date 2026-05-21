/**
 * Approval Rules API Service
 *
 * Typed API calls for the Finance Approval Rules module.
 * All endpoints are under /api/v1/finance/master-data/approval-rules.
 *
 * Reuses the shared apiClient (same axios instance, same JWT auth interceptor).
 * Finance endpoints are proxied via nginx on the same host — no separate base URL needed.
 */

import { apiClient } from './api';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type DocType =
  | 'PR'
  | 'PO'
  | 'GRPO'
  | 'AP_INVOICE'
  | 'OUTGOING_PAYMENT'
  | 'AP_CREDIT_NOTE'
  | 'GOODS_ISSUE';

/**
 * Approver roles eligible to approve finance documents.
 * (moderator, user, guest are excluded — they don't approve finance docs.)
 */
export type ApproverRole =
  | 'super_admin'
  | 'admin'
  | 'procurement_officer'
  | 'procurement_manager'
  | 'accountant'
  | 'finance_admin'
  | 'auditor';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  PR: 'Purchase Request',
  PO: 'Purchase Order',
  GRPO: 'Goods Receipt PO',
  AP_INVOICE: 'AP Invoice',
  OUTGOING_PAYMENT: 'Outgoing Payment',
  AP_CREDIT_NOTE: 'AP Credit Note',
  GOODS_ISSUE: 'Goods Issue',
};

export const DOC_TYPE_ORDER: DocType[] = [
  'PR',
  'PO',
  'GRPO',
  'AP_INVOICE',
  'OUTGOING_PAYMENT',
  'AP_CREDIT_NOTE',
  'GOODS_ISSUE',
];

export const ROLE_LABELS: Record<ApproverRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  procurement_officer: 'Procurement Officer',
  procurement_manager: 'Procurement Manager',
  accountant: 'Accountant',
  finance_admin: 'Finance Admin',
  auditor: 'Auditor',
};

export const APPROVER_ROLES: ApproverRole[] = [
  'super_admin',
  'admin',
  'procurement_officer',
  'procurement_manager',
  'accountant',
  'finance_admin',
  'auditor',
];

// ─── Shapes ───────────────────────────────────────────────────────────────────

/** Approval rule as returned by the backend. */
export interface ApprovalRule {
  ruleId: string;
  organizationId: string;
  companyCode: string;
  docType: DocType;
  /**
   * Decimal returned as string by FastAPI Pydantic serializer.
   * null = no threshold (used when alwaysRequired=true).
   */
  thresholdAmount: string | null;
  approverRole: string;
  alwaysRequired: boolean;
  priority: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Request body for creating an approval rule. */
export interface ApprovalRuleCreate {
  organizationId: string;
  companyCode: string;
  docType: DocType;
  thresholdAmount: string | null;
  approverRole: string;
  alwaysRequired: boolean;
  priority: number;
  notes?: string | null;
}

/** Request body for partially updating an approval rule. */
export interface ApprovalRuleUpdate {
  thresholdAmount?: string | null;
  approverRole?: string;
  alwaysRequired?: boolean;
  priority?: number;
  isActive?: boolean;
  notes?: string | null;
}

/** Backend paginated list response wrapper. */
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Backend single-item success wrapper. */
interface SuccessResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

/** Response from the /resolve endpoint. */
export interface ApprovalRuleResolveResponse {
  requiresApproval: boolean;
  matchedRule: ApprovalRule | null;
  reason: string;
}

// ─── Query params ─────────────────────────────────────────────────────────────

export interface ListApprovalRulesParams {
  organizationId: string;
  companyCode?: string;
  docType?: DocType;
  isActive?: boolean;
  page?: number;
  size?: number;
}

export interface ResolveApprovalRuleParams {
  organizationId: string;
  companyCode: string;
  docType: DocType;
  amount?: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Fetch a paginated list of approval rules.
 * Uses size=200 by default — approval rules are few in number.
 */
export async function listApprovalRules(
  params: ListApprovalRulesParams
): Promise<PaginatedResponse<ApprovalRule>> {
  const { organizationId, companyCode, docType, isActive, page = 1, size = 200 } = params;

  const queryParams: Record<string, string | number | boolean> = {
    organization_id: organizationId,
    page,
    size,
  };
  if (companyCode !== undefined) queryParams.company_code = companyCode;
  if (docType !== undefined) queryParams.docType = docType;
  if (isActive !== undefined) queryParams.is_active = isActive;

  const response = await apiClient.get<PaginatedResponse<ApprovalRule>>(
    '/v1/finance/master-data/approval-rules',
    { params: queryParams }
  );
  return response.data;
}

/**
 * Create a new approval rule.
 */
export async function createApprovalRule(
  data: ApprovalRuleCreate
): Promise<ApprovalRule> {
  const response = await apiClient.post<SuccessResponse<ApprovalRule>>(
    '/v1/finance/master-data/approval-rules',
    data
  );
  return response.data.data;
}

/**
 * Partially update an existing approval rule.
 * Note: PATCH endpoint does NOT require organization_id as a query param
 * (it looks up by ruleId directly).
 */
export async function updateApprovalRule(
  ruleId: string,
  data: ApprovalRuleUpdate
): Promise<ApprovalRule> {
  const response = await apiClient.patch<SuccessResponse<ApprovalRule>>(
    `/v1/finance/master-data/approval-rules/${ruleId}`,
    data
  );
  return response.data.data;
}

/**
 * Soft-delete (deactivate) an approval rule.
 * Backend sets isActive=False — returns 204 No Content.
 * Note: DELETE endpoint does NOT require organization_id as a query param.
 */
export async function deleteApprovalRule(ruleId: string): Promise<void> {
  await apiClient.delete(`/v1/finance/master-data/approval-rules/${ruleId}`);
}

/**
 * Reactivate a previously deactivated approval rule.
 * Uses PATCH with { isActive: true }.
 */
export async function reactivateApprovalRule(ruleId: string): Promise<ApprovalRule> {
  return updateApprovalRule(ruleId, { isActive: true });
}

/**
 * Resolve whether a document would require approval given
 * the current active rules for an (org, company, docType).
 */
export async function resolveApprovalRule(
  params: ResolveApprovalRuleParams
): Promise<ApprovalRuleResolveResponse> {
  const { organizationId, companyCode, docType, amount } = params;
  const queryParams: Record<string, string | number> = {
    organization_id: organizationId,
    company_code: companyCode,
    docType: docType,
  };
  if (amount !== undefined) queryParams.amount = amount;

  const response = await apiClient.get<SuccessResponse<ApprovalRuleResolveResponse>>(
    '/v1/finance/master-data/approval-rules/resolve',
    { params: queryParams }
  );
  return response.data.data;
}
