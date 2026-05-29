/**
 * Audit Log API Service
 *
 * Typed API calls for the Finance Audit Log module.
 *
 * Endpoint:
 *   GET /api/v1/finance/audit-log
 *       Required query params: organization_id, entity_type, entity_id
 *       Optional: action, page, size
 *
 * Response envelope:
 *   PaginatedResponse shape — { items, total, page, size, pages }
 *   NOT the standard { data, message } envelope used by the ops backend.
 *   Matches backend `PaginatedResponse[AuditLogEntry]` directly.
 *
 * Actor resolution:
 *   The endpoint returns `actorUserId` (UUID) only. There is no shared
 *   user-fetch hook in this codebase (UserManagementPage fetches inline).
 *   The modal renders a truncated UUID fallback: actorUserId.slice(0,8) + "…".
 *   Follow-up task T-064 is logged in BACKLOG to add actor-name resolution.
 */

import { apiClient } from './api';

// ============================================================================
// Types
// ============================================================================

/**
 * A single audit log event row as returned by GET /api/v1/finance/audit-log.
 * Matches the backend `AuditLogEntry` Pydantic model exactly.
 */
export interface AuditLogEntry {
  auditLogId: string;
  /** The action performed, e.g. "CLOSE", "REOPEN", "manual_je_posted". */
  action: string;
  /** Type of the audited entity, e.g. "FiscalPeriod", "JournalEntry". */
  entityType: string;
  /** UUID of the audited entity. */
  entityId: string;
  /** Organisation scope. */
  organizationId: string;
  /**
   * UUID of the user who performed the action.
   * Resolve to a display name via the admin /v1/users endpoint.
   * Currently rendered as truncated UUID — see T-064 follow-up.
   */
  actorUserId: string;
  /**
   * Entity state snapshot before the action.
   * May be null (not all actions capture a before snapshot).
   */
  beforeJson: Record<string, unknown> | null;
  /**
   * Entity state snapshot after the action.
   * For CLOSE/REOPEN, includes a "reason" field when one was provided.
   */
  afterJson: Record<string, unknown> | null;
  /** When the action was recorded (UTC ISO datetime string). */
  timestamp: string;
}

/**
 * Paginated response envelope from the finance audit-log endpoint.
 * This is the standard `PaginatedResponse[T]` shape from the finance service —
 * NOT the `{ data, message }` envelope used by the ops backend.
 */
export interface AuditLogPaginatedResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Parameters for listing audit log events. */
export interface ListAuditLogParams {
  /** Required — org scope. Cross-org rows are filtered silently by the backend. */
  organizationId: string;
  /**
   * Required — entity type. Must be in the backend allow-list:
   *   "FiscalPeriod" | "JournalEntry"
   */
  entityType: string;
  /** Required — UUID of the specific entity to retrieve audit events for. */
  entityId: string;
  /**
   * Optional — filter to a specific action string.
   * e.g. "CLOSE", "REOPEN", "manual_je_posted"
   */
  action?: string;
  /** Page number (1-based). Defaults to 1. */
  page?: number;
  /**
   * Items per page. Defaults to 200 (backend default).
   * For fiscal period audit logs, 200 is more than sufficient — a period
   * will rarely have more than a handful of close/reopen events.
   * Pagination UI is intentionally omitted from the modal (KISS).
   */
  size?: number;
}

// ============================================================================
// API functions
// ============================================================================

/**
 * Fetch a paginated list of audit log events for a specific entity.
 * GET /api/v1/finance/audit-log
 *
 * Returns the full `PaginatedResponse` envelope (items, total, page, size, pages).
 * The caller typically consumes only `items` for display.
 *
 * Note: The backend default page size is 200, which is sufficient for fiscal
 * period audit history. Pagination UI is intentionally not exposed in the modal.
 */
export async function listAuditLog(
  params: ListAuditLogParams
): Promise<AuditLogPaginatedResponse> {
  const { organizationId, entityType, entityId, action, page = 1, size = 200 } = params;

  const queryParams: Record<string, string | number> = {
    organization_id: organizationId,
    entity_type: entityType,
    entity_id: entityId,
    page,
    size,
  };

  if (action) {
    queryParams.action = action;
  }

  const response = await apiClient.get<AuditLogPaginatedResponse>(
    '/v1/finance/audit-log',
    { params: queryParams }
  );

  // The finance audit-log endpoint returns PaginatedResponse directly at
  // response.data — it does NOT wrap in a { data, message } envelope.
  return response.data;
}
