/**
 * Finance GL Accounts API Service
 *
 * Typed API calls for the Chart of Accounts module.
 * All endpoints are under /api/v1/finance/accounts.
 *
 * Reuses the shared apiClient (same axios instance, same JWT auth interceptor).
 * Finance endpoints are proxied via nginx on the same host — no separate base URL needed.
 */

import { apiClient } from './api';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type DrawerEnum =
  | 'ASSETS'
  | 'LIABILITIES'
  | 'EQUITY'
  | 'REVENUE'
  | 'COST_OF_SALES'
  | 'OPERATING_COST'
  | 'NON_OPERATING'
  | 'OTHER_INCOME'
  | 'TAXATION';

export type AccountTypeEnum =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense';

/**
 * Account level controls posting eligibility.
 * - drawer: top-level grouping header (e.g. "ASSETS"). Cannot be posted to.
 * - title: intermediate section header. Cannot be posted to.
 * - active: leaf account that can receive journal-entry postings.
 */
export type AccountLevel = 'drawer' | 'title' | 'active';

/**
 * Optional functional role for an account within the posting engine.
 * null = no specific role assigned.
 */
export type AccountRole =
  | 'posting'
  | 'bank'
  | 'cash'
  | 'reconciliation'
  | 'clearing'
  | 'contra'
  | 'revenue'
  | 'expense'
  | 'other'
  | null;

// Fixed display order for drawers in the tree.
export const DRAWER_ORDER: DrawerEnum[] = [
  'ASSETS',
  'LIABILITIES',
  'EQUITY',
  'REVENUE',
  'COST_OF_SALES',
  'OPERATING_COST',
  'NON_OPERATING',
  'OTHER_INCOME',
  'TAXATION',
];

/** Human-readable labels for each drawer value. */
export const DRAWER_LABELS: Record<DrawerEnum, string> = {
  ASSETS: 'Assets',
  LIABILITIES: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  COST_OF_SALES: 'Cost of Sales',
  OPERATING_COST: 'Operating Cost',
  NON_OPERATING: 'Non-Operating',
  OTHER_INCOME: 'Other Income',
  TAXATION: 'Taxation',
};

/** Human-readable labels for each account type. */
export const ACCOUNT_TYPE_LABELS: Record<AccountTypeEnum, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
};

/** Human-readable labels for each account level. */
export const ACCOUNT_LEVEL_LABELS: Record<AccountLevel, string> = {
  drawer: 'Drawer',
  title: 'Title (intermediate)',
  active: 'Active (postable)',
};

/** Human-readable labels for each account role (non-null values). */
export const ACCOUNT_ROLE_LABELS: Record<Exclude<AccountRole, null>, string> = {
  posting: 'Posting',
  bank: 'Bank',
  cash: 'Cash',
  reconciliation: 'Reconciliation',
  clearing: 'Clearing',
  contra: 'Contra',
  revenue: 'Revenue',
  expense: 'Expense',
  other: 'Other',
};

// ─── Shapes ───────────────────────────────────────────────────────────────────

/** GL account as returned by the backend. */
export interface GLAccount {
  accountId: string;
  organizationId: string;
  accountNumber: string;
  accountName: string;
  /** Free-text description. VARCHAR(500), nullable. */
  description: string | null;
  drawer: DrawerEnum;
  accountType: AccountTypeEnum;
  /**
   * Posting eligibility level.
   * Only 'active' accounts may receive journal-entry postings.
   */
  accountLevel: AccountLevel;
  /**
   * Optional functional role used by the posting engine.
   * null means no specific role assigned.
   */
  accountRole: AccountRole;
  /** IFRS classification tag. VARCHAR(10), nullable. */
  ifrsTag: string | null;
  parentAccountId: string | null;
  isHeader: boolean;
  isControlAccount: boolean;
  isActive: boolean;
  isLockedNumber: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Request body for creating a GL account. */
export interface GLAccountCreate {
  organizationId: string;
  accountNumber: string;
  accountName: string;
  description?: string | null;
  drawer: DrawerEnum;
  accountType: AccountTypeEnum;
  /** Defaults to 'active' on the backend when omitted. */
  accountLevel?: AccountLevel;
  accountRole?: AccountRole;
  ifrsTag?: string | null;
  parentAccountId?: string | null;
  isHeader?: boolean;
  isControlAccount?: boolean;
  isActive?: boolean;
}

/** Request body for partially updating a GL account. */
export interface GLAccountUpdate {
  accountName?: string;
  description?: string | null;
  /**
   * accountLevel is intentionally excluded from update — changing posting
   * eligibility after creation requires a migration-level operation.
   */
  accountRole?: AccountRole;
  ifrsTag?: string | null;
  parentAccountId?: string | null;
  isHeader?: boolean;
  isActive?: boolean;
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

// ─── Query params ─────────────────────────────────────────────────────────────

export interface ListAccountsParams {
  organizationId: string;
  drawer?: DrawerEnum;
  isActive?: boolean;
  page?: number;
  size?: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Fetch a page of GL accounts.
 * Uses `size=500` by default to load the entire CoA in one request (227 accounts
 * in seed data, well within the backend max of 500).
 */
export async function listAccounts(
  params: ListAccountsParams
): Promise<PaginatedResponse<GLAccount>> {
  const { organizationId, drawer, isActive, page = 1, size = 500 } = params;

  const queryParams: Record<string, string | number | boolean> = {
    organization_id: organizationId,
    page,
    size,
  };
  if (drawer !== undefined) queryParams.drawer = drawer;
  if (isActive !== undefined) queryParams.is_active = isActive;

  const response = await apiClient.get<PaginatedResponse<GLAccount>>(
    '/v1/finance/accounts',
    { params: queryParams }
  );
  return response.data;
}

/**
 * Fetch a single GL account by ID.
 */
export async function getAccount(
  accountId: string,
  organizationId: string
): Promise<GLAccount> {
  const response = await apiClient.get<SuccessResponse<GLAccount>>(
    `/v1/finance/accounts/${accountId}`,
    { params: { organization_id: organizationId } }
  );
  return response.data.data;
}

/**
 * Create a new GL account.
 */
export async function createAccount(data: GLAccountCreate): Promise<GLAccount> {
  const response = await apiClient.post<SuccessResponse<GLAccount>>(
    '/v1/finance/accounts',
    data
  );
  return response.data.data;
}

/**
 * Partially update an existing GL account.
 */
export async function updateAccount(
  accountId: string,
  data: GLAccountUpdate
): Promise<GLAccount> {
  const response = await apiClient.patch<SuccessResponse<GLAccount>>(
    `/v1/finance/accounts/${accountId}`,
    data
  );
  return response.data.data;
}

/**
 * Deactivate (soft-delete) a GL account.
 * The backend treats DELETE as deactivation — returns 204 No Content.
 */
export async function deactivateAccount(accountId: string): Promise<void> {
  await apiClient.delete(`/v1/finance/accounts/${accountId}`);
}

/**
 * Reactivate a previously deactivated GL account.
 * Uses PATCH with `{ isActive: true }`.
 */
export async function reactivateAccount(accountId: string): Promise<GLAccount> {
  return updateAccount(accountId, { isActive: true });
}
