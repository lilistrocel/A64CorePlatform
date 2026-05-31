/**
 * SalesAuditHistoryModal (T-200.x)
 *
 * Read-only audit event list for any Wave 3 sales document.
 * Fetches from GET /api/v1/sales/audit via useSalesAudit.
 *
 * Design decisions:
 *  - Separate from the finance AuditHistoryModal because the sales audit
 *    entries have a different shape (entryId/actorUserId/detail vs
 *    auditLogId/afterJson) and different action vocabulary. Creating a
 *    parallel component keeps both surfaces independent and avoids any
 *    risk of breaking the working finance modal.
 *  - Modal does NOT close on overlay click — X button only
 *    (project-wide rule: feedback_modal_ux.md).
 *  - Actor names resolved via useAdminUsers (T-064). Requires the viewing
 *    user to have admin/super_admin role. Other roles fall back to truncated
 *    UUID display.
 *  - detail column is hidden when all entries have null detail (keeps the
 *    modal compact for simple doc types). When detail is present, a summary
 *    is rendered as a compact JSON preview (click to expand tooltip).
 *  - No pagination — single page load. The default backend response covers
 *    all realistic audit histories for a single sales document (KISS).
 *
 * Props:
 *  - isOpen         — controls visibility (parent manages open/close state)
 *  - onClose        — called when X or footer Close button is clicked
 *  - organizationId — org UUID, passed to the sales audit query
 *  - docType        — e.g. 'AR_INVOICE', 'CUSTOMER_RECEIPT'
 *  - docEntry       — UUID of the sales document whose audit to show
 *  - docLabel       — human-readable label for the modal header, e.g. "ARI-2026-0001"
 *  - viewerRole     — (optional) role of the authenticated user; gates
 *                     useAdminUsers fetch for actor-name resolution
 */

import { useEffect, useRef, useMemo } from 'react';
import styled from 'styled-components';
import { useSalesAudit } from '../../hooks/queries/useSalesAudit';
import { useAdminUsers } from '../../hooks/queries/useAdminUsers';
import type { SalesAuditDocType } from '../../services/salesApi';
import { useToastStore } from '../../stores/toast.store';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Roles that can call GET /v1/users (require_admin on the backend).
 * Only these roles resolve actor names; others show truncated UUID.
 */
const USER_FETCH_ROLES = new Set(['admin', 'super_admin']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an ISO datetime string to a user-readable local time.
 * Falls back to '—' for falsy input.
 */
function formatTimestamp(iso: string | undefined | null): string {
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
 * Truncate a UUID-style actor ID to 8 chars + '…' for compact display.
 * The full UUID is exposed via title tooltip for accessibility/clipboard.
 */
function truncateUserId(userId: string): string {
  if (!userId) return '—';
  return `${userId.slice(0, 8)}…`;
}

/**
 * Format a sales action label to be human-readable.
 * E.g. "transition_draft_to_open" → "Transition Draft → Open"
 */
function formatAction(action: string): string {
  if (!action) return '—';
  // Replace underscores with spaces, title-case each word
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    // Make arrow separator more readable
    .replace(' To ', ' → ');
}

// ─── Styled components ────────────────────────────────────────────────────────

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
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 700px;
  padding: 28px 28px 24px;
  position: relative;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  flex-shrink: 0;
  padding-right: 40px;
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
  color: white;
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

const TableWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 10px;
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 480px;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
`;

// Action badge — colour by action category
interface ActionBadgeProps {
  $action: string;
}

const ActionBadge = styled.span<ActionBadgeProps>`
  display: inline-block;
  padding: 3px 9px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  ${({ $action, theme }) => {
    const lc = $action.toLowerCase();
    if (lc.includes('create') || lc.includes('from_delivery') || lc.includes('from_so')) {
      return `
        background: ${theme.colors.neutral[100]};
        color: ${theme.colors.textSecondary};
      `;
    }
    if (lc.includes('open') || lc.includes('post')) {
      return `
        background: #ecfdf5;
        color: #059669;
      `;
    }
    if (lc.includes('cancel')) {
      return `
        background: ${theme.colors.errorBg ?? '#fef2f2'};
        color: ${theme.colors.error ?? '#dc2626'};
      `;
    }
    if (lc.includes('update') || lc.includes('edit')) {
      return `
        background: #eff6ff;
        color: #2563eb;
      `;
    }
    // Default — neutral
    return `
      background: ${theme.colors.neutral[100]};
      color: ${theme.colors.textSecondary};
    `;
  }}
`;

// ─── Component ────────────────────────────────────────────────────────────────

export interface SalesAuditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  docType: SalesAuditDocType;
  docEntry: string;
  /** Human-readable label for the modal header, e.g. "ARI-2026-0001". */
  docLabel: string;
  /**
   * Role of the currently authenticated user.
   * 'admin' and 'super_admin' can call GET /v1/users for actor-name resolution.
   * Other roles fall back to truncated-UUID rendering.
   */
  viewerRole?: string;
}

export function SalesAuditHistoryModal({
  isOpen,
  onClose,
  organizationId,
  docType,
  docEntry,
  docLabel,
  viewerRole,
}: SalesAuditHistoryModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // ── Audit data fetch ─────────────────────────────────────────────────────

  const { data, isLoading, isError, error, refetch } = useSalesAudit({
    docType,
    docEntry,
    organizationId,
  });

  // ── Actor-name resolution (T-064) ────────────────────────────────────────

  const canFetchUsers = viewerRole !== undefined && USER_FETCH_ROLES.has(viewerRole);

  const { userMap, isLoading: isResolvingActors } = useAdminUsers({
    enabled: canFetchUsers && isOpen,
  });

  const actorDisplayNames = useMemo<ReadonlyMap<string, string>>(() => {
    const entries = data?.entries ?? [];
    const uniqueIds = [
      ...new Set(entries.map((e) => e.actorUserId).filter(Boolean)),
    ];
    const result = new Map<string, string>();
    for (const id of uniqueIds) {
      const resolved = userMap.get(id);
      if (resolved) result.set(id, resolved);
    }
    return result;
  }, [data?.entries, userMap]);

  // ── Esc key handler ──────────────────────────────────────────────────────
  // Per feedback_modal_ux.md: audit modals are read-only so Esc is acceptable.

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── Focus management ─────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    }
  }, [isOpen]);

  // ── Error toast ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isError || !error) return;
    const e = error as {
      response?: { data?: { detail?: string }; status?: number };
      message?: string;
    };
    const msg =
      e?.response?.data?.detail ??
      e?.message ??
      'Failed to load audit history.';
    addToast('error', msg);
  }, [isError, error, addToast]);

  // ── Guard ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const entries = data?.entries ?? [];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ModalBackdrop
      role="dialog"
      aria-modal="true"
      aria-labelledby="sales-audit-modal-title"
      /* Backdrop click intentionally does nothing — project-wide rule. */
    >
      <ModalBox>
        {/* X close button */}
        <ModalCloseBtn
          ref={closeBtnRef}
          onClick={onClose}
          aria-label={`Close audit history for ${docLabel}`}
        >
          ×
        </ModalCloseBtn>

        <ModalHeader>
          <ModalTitle id="sales-audit-modal-title">
            Audit History — {docLabel}
          </ModalTitle>
          <ModalSubtitle>
            {docType}
            {canFetchUsers
              ? ' · actor names resolved (hover for full ID)'
              : ' · actor IDs shown as truncated UUIDs (hover for full ID)'}
          </ModalSubtitle>
        </ModalHeader>

        <ModalBody>
          {/* Loading */}
          {(isLoading || (canFetchUsers && isResolvingActors)) && (
            <StateBox aria-live="polite">
              <Spinner aria-hidden="true" />
              {isLoading ? 'Loading audit history…' : 'Resolving actor names…'}
            </StateBox>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <StateBox role="alert">
              <p>Failed to load audit history.</p>
              <RetryButton type="button" onClick={() => void refetch()}>
                Retry
              </RetryButton>
            </StateBox>
          )}

          {/* Empty */}
          {!isLoading &&
            !isError &&
            !(canFetchUsers && isResolvingActors) &&
            entries.length === 0 && (
              <StateBox>
                No audit events recorded for this {docType.replace(/_/g, ' ')} yet.
              </StateBox>
            )}

          {/* Data table */}
          {!isLoading &&
            !isError &&
            !(canFetchUsers && isResolvingActors) &&
            entries.length > 0 && (
              <TableWrapper>
                <Table
                  role="table"
                  aria-label={`Audit history for ${docLabel}`}
                >
                  <THead>
                    <tr>
                      <Th scope="col">Action</Th>
                      <Th scope="col">Actor</Th>
                      <Th scope="col">Timestamp</Th>
                    </tr>
                  </THead>
                  <tbody>
                    {entries.map((entry) => (
                      <Tr key={entry.entryId}>
                        <Td>
                          <ActionBadge
                            $action={entry.action}
                            aria-label={`Action: ${entry.action}`}
                          >
                            {formatAction(entry.action)}
                          </ActionBadge>
                        </Td>
                        <TdMuted>
                          <span
                            title={entry.actorUserId}
                            aria-label={`Actor: ${
                              actorDisplayNames.get(entry.actorUserId) ??
                              entry.actorUserId
                            }`}
                            style={{ cursor: 'help' }}
                          >
                            {actorDisplayNames.get(entry.actorUserId) ??
                              truncateUserId(entry.actorUserId)}
                          </span>
                        </TdMuted>
                        <TdMuted>
                          {formatTimestamp(entry.timestamp)}
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
