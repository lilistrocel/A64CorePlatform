/**
 * AuditHistoryModal
 *
 * Displays a read-only audit event list for a given entity (typically a
 * FiscalPeriod). Fetches from GET /api/v1/finance/audit-log via useAuditLog.
 *
 * Design decisions:
 *  - Modal does NOT close on overlay click (project-wide rule: feedback_modal_ux.md).
 *    X button (top-right) or Esc key or the Close footer button close it.
 *  - No pagination UI — backend default size=200 covers all realistic audit
 *    histories for a single fiscal period (KISS principle).
 *  - Actor names resolved via useAdminUsers (T-064). Requires the viewing user
 *    to have admin/super_admin role to call GET /v1/users. For roles that cannot
 *    call that endpoint (finance_admin, finance_reviewer) the hook is disabled
 *    and the display falls back to truncated UUID.
 *  - Parameterised on entityType so the modal is reusable for JournalEntry
 *    audit history in a future task without modification.
 *
 * Props:
 *  - isOpen         — controls visibility (parent manages open/close state)
 *  - onClose        — called when X, Esc, or footer Close button triggers close
 *  - organizationId — required for the audit-log query (cross-org filter)
 *  - entityType     — e.g. "FiscalPeriod" (backend allow-list)
 *  - entityId       — UUID of the entity whose audit history to show
 *  - entityLabel    — human-readable label for the modal header, e.g. "2026 P1"
 *  - viewerRole     — (optional) role of the currently authenticated user,
 *                     used to gate the /v1/users fetch. Pass from useAuthStore.
 */

import { useEffect, useRef, useMemo } from 'react';
import styled from 'styled-components';
import { useAuditLog } from '../../../hooks/queries/useAuditLog';
import { useAdminUsers } from '../../../hooks/queries/useAdminUsers';
import type { AuditLogEntry } from '../../../services/auditLogService';
import { useToastStore } from '../../../stores/toast.store';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Roles that are permitted to call GET /v1/users (require_admin on the backend).
 * Only for these roles will actor names be resolved; all others fall back to
 * truncated UUID without an error.
 */
const USER_FETCH_ROLES = new Set(['admin', 'super_admin']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an ISO datetime string to a user-readable local time.
 * Shows date + time so audit events can be sequenced accurately.
 * Falls back to "—" for falsy input (null, undefined, empty string).
 */
function formatAuditTimestamp(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Extract the reason text from an AuditLogEntry's afterJson.
 * For CLOSE/REOPEN events, the backend stores { reason: "…", … } in afterJson.
 * Returns an em dash when no reason was recorded.
 */
function extractReason(entry: AuditLogEntry): string {
  if (!entry.afterJson) return '—';
  const reason = (entry.afterJson as { reason?: string }).reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : '—';
}

/**
 * Truncate a UUID-style actor ID to 8 chars + "…" for compact display.
 * The full UUID is exposed via title tooltip for accessibility/clipboard.
 */
function truncateUserId(userId: string): string {
  if (!userId) return '—';
  return `${userId.slice(0, 8)}…`;
}

// ─── Styled components ────────────────────────────────────────────────────────

/**
 * Backdrop: no onClick handler — modal closes only via X, Esc, or footer button.
 * Project-wide rule: data-entry (and read-only audit) modals do NOT close on
 * overlay click (feedback_modal_ux.md).
 */
const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(59, 44, 24, 0.2);
  width: 100%;
  max-width: 680px;
  padding: 28px 28px 24px;
  position: relative;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  flex-shrink: 0;
  padding-right: 40px; /* room for X button */
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px;
  line-height: 1.3;
`;

const ModalSubtitle = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 20px;
`;

const ModalCloseBtn = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 18px;
  cursor: pointer;
  transition: background 150ms ease;
  flex-shrink: 0;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const ModalBody = styled.div`
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`;

const ModalFooter = styled.div`
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const CloseButton = styled.button`
  padding: 9px 22px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[200]};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

// ─── State displays ────────────────────────────────────────────────────────────

const StateBox = styled.div`
  padding: 40px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  line-height: 1.6;
`;

const RetryButton = styled.button`
  margin-top: 12px;
  padding: 8px 18px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const Spinner = styled.div`
  width: 28px;
  height: 28px;
  border: 3px solid ${({ theme }) => theme.colors.neutral[200]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin: 0 auto 12px;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

// ─── Table ─────────────────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 10px;
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 520px;
`;

const THead = styled.thead`
  background: ${({ theme }) => theme.colors.neutral[100]};
`;

const Th = styled.th`
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const Tr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const Td = styled.td`
  padding: 11px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TdMuted = styled(Td)`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const TdReason = styled(Td)`
  max-width: 200px;
  white-space: pre-wrap;
  word-break: break-word;
`;

// ─── Action badge ─────────────────────────────────────────────────────────────

/**
 * Action badge colour convention:
 *   CLOSE   → amber (matches the CLOSED period status badge)
 *   REOPEN  → red (matches the "reopen" warning colour)
 *   Others  → neutral
 *
 * Uses the theme's warningBg/warning and errorBg/error tokens directly —
 * the full A20Core theme surface always defines these, so no hex fallback
 * is needed.
 */
interface ActionBadgeProps {
  $action: string;
}

const ActionBadge = styled.span<ActionBadgeProps>`
  display: inline-block;
  padding: 3px 9px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  ${({ $action, theme }) => {
    switch ($action.toUpperCase()) {
      case 'CLOSE':
        return `
          background: ${theme.colors.warningBg};
          color: ${theme.colors.warning};
        `;
      case 'REOPEN':
        return `
          background: ${theme.colors.errorBg};
          color: ${theme.colors.error};
        `;
      default:
        return `
          background: ${theme.colors.neutral[100]};
          color: ${theme.colors.textSecondary};
        `;
    }
  }}
`;

// ─── Component ────────────────────────────────────────────────────────────────

export interface AuditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Required for the audit-log API query. Must match the active org. */
  organizationId: string;
  /**
   * Entity type string — must be in the backend allow-list.
   * "FiscalPeriod" for period audit history.
   * "JournalEntry" for JE audit history (future use).
   */
  entityType: string;
  /** UUID of the entity whose audit events to display. */
  entityId: string;
  /**
   * Human-readable label for the modal header.
   * e.g. "2026 P1", "JE-00042".
   */
  entityLabel: string;
  /**
   * Role of the currently authenticated user.
   * Used to decide whether to attempt GET /v1/users for actor-name resolution.
   * Roles "admin" and "super_admin" can call that endpoint; others fall back
   * to truncated-UUID rendering without triggering a 403.
   * Optional — when omitted, actor-name resolution is disabled.
   */
  viewerRole?: string;
}

export function AuditHistoryModal({
  isOpen,
  onClose,
  organizationId,
  entityType,
  entityId,
  entityLabel,
  viewerRole,
}: AuditHistoryModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // ── Audit log data fetch ───────────────────────────────────────────────────

  const { data, isLoading, isError, error, refetch } = useAuditLog({
    organizationId,
    entityType,
    entityId,
    // No action filter — show all events for this entity.
    // No page/size override — use the service defaults (page=1, size=200).
  });

  // ── Actor-name resolution (T-064) ──────────────────────────────────────────

  // Only fetch the user list when the viewing user has a role that can call
  // GET /v1/users. For finance_admin / finance_reviewer the hook is disabled
  // and userMap remains an empty Map (actor column falls back to UUID).
  const canFetchUsers = viewerRole !== undefined && USER_FETCH_ROLES.has(viewerRole);

  const {
    userMap,
    isLoading: isResolvingActors,
  } = useAdminUsers({ enabled: canFetchUsers && isOpen });

  // Deduplicate actorUserIds from the current result set and build display names.
  // This is O(n) over the entry list — no memoisation needed for typical audit
  // logs (< 50 events per period). useMemo guards against recomputing on every
  // render when the data reference hasn't changed.
  const actorDisplayNames = useMemo<ReadonlyMap<string, string>>(() => {
    const entries = data?.items ?? [];
    const uniqueIds = [...new Set(entries.map((e) => e.actorUserId).filter(Boolean))];
    const result = new Map<string, string>();

    for (const id of uniqueIds) {
      const resolved = userMap.get(id);
      // Resolved name wins; otherwise keep undefined so we fall back to UUID.
      if (resolved) result.set(id, resolved);
    }

    return result;
  }, [data?.items, userMap]);

  // ── Esc key handler ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── Focus management ───────────────────────────────────────────────────────

  // Focus the X close button when the modal opens so keyboard users can
  // immediately dismiss it or tab to the table content.
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    }
  }, [isOpen]);

  // ── Error toast ────────────────────────────────────────────────────────────

  // Surface API errors via toast in addition to the inline retry state.
  useEffect(() => {
    if (!isError || !error) return;
    const e = error as { response?: { data?: { detail?: string }; status?: number }; message?: string };
    const msg =
      e?.response?.data?.detail ??
      e?.message ??
      'Failed to load audit history.';
    addToast('error', msg);
  }, [isError, error, addToast]);

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const entries = data?.items ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ModalBackdrop
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      /* Backdrop click intentionally does nothing — project-wide rule. */
    >
      <ModalBox>
        {/* X close button */}
        <ModalCloseBtn
          ref={closeBtnRef}
          onClick={onClose}
          aria-label={`Close audit history for ${entityLabel}`}
        >
          ×
        </ModalCloseBtn>

        <ModalHeader>
          <ModalTitle id="audit-modal-title">
            Audit History — {entityLabel}
          </ModalTitle>
          <ModalSubtitle>
            {entityType}
            {canFetchUsers
              ? ' · actor names resolved (hover for full ID)'
              : ' · actor IDs shown as truncated UUIDs (hover for full ID)'}
          </ModalSubtitle>
        </ModalHeader>

        <ModalBody>
          {/* Loading state — show while audit entries OR actor names are loading */}
          {(isLoading || (canFetchUsers && isResolvingActors)) && (
            <StateBox aria-live="polite">
              <Spinner aria-hidden="true" />
              {isLoading ? 'Loading audit history…' : 'Resolving actor names…'}
            </StateBox>
          )}

          {/* Error state — only for audit fetch failure (user-fetch failure is silent) */}
          {isError && !isLoading && (
            <StateBox role="alert">
              <p>Failed to load audit history.</p>
              <RetryButton
                type="button"
                onClick={() => void refetch()}
              >
                Retry
              </RetryButton>
            </StateBox>
          )}

          {/* Empty state */}
          {!isLoading && !isError && !(canFetchUsers && isResolvingActors) && entries.length === 0 && (
            <StateBox>
              No audit events recorded for this {entityType} yet.
            </StateBox>
          )}

          {/* Data table — shown once both audit data AND actor resolution are ready */}
          {!isLoading && !isError && !(canFetchUsers && isResolvingActors) && entries.length > 0 && (
            <TableWrapper>
              <Table
                role="table"
                aria-label={`Audit history for ${entityLabel}`}
              >
                <THead>
                  <tr>
                    <Th scope="col">Action</Th>
                    <Th scope="col">Actor</Th>
                    <Th scope="col">Reason</Th>
                    <Th scope="col">Timestamp</Th>
                  </tr>
                </THead>
                <tbody>
                  {entries.map((entry) => (
                    <Tr key={entry.auditLogId}>
                      <Td>
                        <ActionBadge
                          $action={entry.action}
                          aria-label={`Action: ${entry.action}`}
                        >
                          {entry.action}
                        </ActionBadge>
                      </Td>
                      <TdMuted>
                        {/*
                         * T-064: Render the resolved display name when available.
                         * Full UUID is always exposed via title tooltip for
                         * traceability. Falls back to truncated UUID when:
                         *   - viewer lacks admin role (canFetchUsers=false)
                         *   - user was deleted since the audit event was written
                         *   - user is from a different org (defensive)
                         */}
                        <span
                          title={entry.actorUserId}
                          aria-label={`Actor: ${actorDisplayNames.get(entry.actorUserId) ?? entry.actorUserId}`}
                          style={{ cursor: 'help' }}
                        >
                          {actorDisplayNames.get(entry.actorUserId) ?? truncateUserId(entry.actorUserId)}
                        </span>
                      </TdMuted>
                      <TdReason>
                        {extractReason(entry)}
                      </TdReason>
                      <TdMuted>
                        {formatAuditTimestamp(entry.timestamp)}
                      </TdMuted>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrapper>
          )}
        </ModalBody>

        <ModalFooter>
          <CloseButton
            type="button"
            onClick={onClose}
            aria-label="Close audit history modal"
          >
            Close
          </CloseButton>
        </ModalFooter>
      </ModalBox>
    </ModalBackdrop>
  );
}
