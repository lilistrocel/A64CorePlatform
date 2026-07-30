/**
 * PeriodsPage
 *
 * Finance — Fiscal Periods management.
 * Route: /finance/periods
 *
 * Open periods accept new journal entry postings.
 * Closed periods reject any new entries, including reversals.
 * Locked periods are terminal — no UI affordance to unlock (super_admin tooling only).
 *
 * Features:
 *  - Company picker (useFinanceCompanies)
 *  - Fiscal year filter (derived from loaded data) + "All years"
 *  - Status pill-toggle: All / Open only / Closed only
 *  - Table sorted by (fiscalYear DESC, periodNumber ASC)
 *    with current-period accent row, status badges (OPEN/CLOSED/LOCKED), close/reopen actions
 *  - Close modal: two-stage flow
 *      Stage A — shows what will happen (year-end: closing JE preview note; mid-year: status flip note)
 *      Stage B — required textarea (close reason) + Confirm Close button
 *      Post-close: surfaces closing JE number in success toast for year-end periods
 *  - Reopen modal: required textarea (min 5 chars) + Confirm Reopen
 *  - "Create Periods for Year…" bulk-create wizard modal
 *
 * Role gating:
 *  - Read: accountant, finance_admin, auditor, admin, super_admin
 *  - Write (close/reopen/create): finance_admin, admin, super_admin
 *
 * Modals do NOT close on overlay click — X button only, or Esc key.
 * (Project-wide rule: data-entry modals close via X, never on backdrop click.)
 *
 * T-060.11 changes vs prior version:
 *  - StatusBadge now handles 'locked' (red / danger color) in addition to open/closed
 *  - FiscalPeriod type extended with audit trail fields (closedAt, closeReason, etc.)
 *  - Close modal upgraded: pre-close info panel + required textarea reason + post-close
 *    closingJe surfacing in success toast
 *  - Reopen modal upgraded: required textarea reason (min 5 chars = backend min)
 *  - Service calls now pass organizationId as query param (backend requirement)
 *  - Esc key closes both modals
 *  - Locked rows show no action buttons
 *
 * T-060.11-preview-fe changes (2026-05-29):
 *  The close modal Stage A is no longer a prose info panel. On "Close Period" click
 *  a dry-run call fires immediately (PATCH …/close?dry_run=true). While in flight,
 *  a spinner shows. On success, ClosingJePreviewPanel renders either:
 *    - A full closing JE preview table (year-end with lines > 0)
 *    - A prose note (mid-year status-flip, or year-end with no JE needed)
 *  On error, a red banner shows the backend error message + Cancel only.
 *  Stage B (reason textarea + Confirm) is unchanged. The Back button re-shows
 *  the already-fetched preview without re-fetching.
 *  New types: ClosingJePreviewLine, ClosingJeTargetAccount, ClosingJePreview,
 *  PreviewClosePeriodResponse in fiscalPeriodsService.ts.
 *  New hook: useClosePeriodPreview (useMutation) in useFiscalPeriods.ts.
 *
 * T-060.11-audit changes (2026-05-29):
 *  The backend audit-log endpoint now exists (T-060.11-audit). The "Audit History"
 *  button is rendered on every period row for roles: super_admin, finance_admin,
 *  finance_reviewer. Opens AuditHistoryModal with the period's UUID and label.
 *  The endpoint returns a PaginatedResponse envelope (items, total, page, size, pages).
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import styled, { css } from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import {
  useFiscalPeriods,
  useClosePeriod,
  useReopenPeriod,
  useCreatePeriod,
  useClosePeriodPreview,
} from '../../hooks/queries/useFiscalPeriods';
import type {
  FiscalPeriod,
  PeriodStatus,
  ClosingJePreview,
} from '../../services/fiscalPeriodsService';
import { useToastStore } from '../../stores/toast.store';
import { AuditHistoryModal } from '../../components/finance/AuditHistoryModal';

// ─── Role gates ───────────────────────────────────────────────────────────────

const READ_ROLES = new Set([
  'accountant',
  'finance_admin',
  'auditor',
  'admin',
  'super_admin',
]);

const WRITE_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

/**
 * Roles that can view the audit history for a period.
 * finance_reviewer is read-only — they can see audit events but cannot
 * close/reopen periods. Reviewers and auditors should see the audit trail.
 */
const AUDIT_ROLES = new Set(['super_admin', 'finance_admin', 'finance_reviewer']);

const PLATFORM_DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount: number, currency: string = 'AED'): string {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount)) + ` ${currency}`;
}

/** True if today falls within [startDate, endDate] inclusive. */
function isCurrentPeriod(period: FiscalPeriod): boolean {
  const today = todayIso();
  return today >= period.startDate && today <= period.endDate;
}

/**
 * Heuristic: is this likely the last period of its fiscal year?
 * We detect this client-side from the array of all periods — if the period's
 * endDate is the latest endDate for the same companyCode + fiscalYear, it is
 * the year-end period. The backend confirms this server-side on close, but
 * we use it in the UI to show the appropriate pre-close information note.
 */
function isLikelyYearEnd(period: FiscalPeriod, allPeriods: FiscalPeriod[]): boolean {
  const sameFiscalYear = allPeriods.filter(
    (p) => p.companyCode === period.companyCode && p.fiscalYear === period.fiscalYear
  );
  if (sameFiscalYear.length === 0) return false;
  const maxEnd = sameFiscalYear.reduce(
    (max, p) => (p.endDate > max ? p.endDate : max),
    ''
  );
  return period.endDate === maxEnd;
}

/**
 * Calculate the start and end dates for N monthly periods starting from a given
 * month (1-based) and year. Returns array of { periodNumber, startDate, endDate }.
 */
function calcMonthlyPeriods(
  year: number,
  startMonth: number,
  count: number
): Array<{ periodNumber: number; startDate: string; endDate: string }> {
  const result: Array<{ periodNumber: number; startDate: string; endDate: string }> = [];
  for (let i = 0; i < count; i++) {
    const month = ((startMonth - 1 + i) % 12) + 1;
    const yearOffset = Math.floor((startMonth - 1 + i) / 12);
    const actualYear = year + yearOffset;
    const start = new Date(actualYear, month - 1, 1);
    const end = new Date(actualYear, month, 0);
    result.push({
      periodNumber: i + 1,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
  }
  return result;
}

/**
 * Calculate periods for a 4-4-5 calendar (13 four-week periods).
 * Periods are 4 weeks each (28 days), starting from 1st of startMonth.
 * Period 13 catches the remaining days to year end.
 */
function calc445Periods(
  year: number,
  startMonth: number
): Array<{ periodNumber: number; startDate: string; endDate: string }> {
  const result: Array<{ periodNumber: number; startDate: string; endDate: string }> = [];
  const startOfYear = new Date(year, startMonth - 1, 1);
  const yearEnd = new Date(year + 1, startMonth - 1, 0);

  for (let i = 0; i < 13; i++) {
    const start = new Date(startOfYear);
    start.setDate(start.getDate() + i * 28);
    let end: Date;
    if (i === 12) {
      end = yearEnd;
    } else {
      end = new Date(start);
      end.setDate(end.getDate() + 27);
    }
    result.push({
      periodNumber: i + 1,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
  }
  return result;
}

/** Calculate 4 quarterly periods. */
function calcQuarterlyPeriods(
  year: number,
  startMonth: number
): Array<{ periodNumber: number; startDate: string; endDate: string }> {
  const result: Array<{ periodNumber: number; startDate: string; endDate: string }> = [];
  for (let i = 0; i < 4; i++) {
    const qStartMonth = ((startMonth - 1 + i * 3) % 12) + 1;
    const yearOffset = Math.floor((startMonth - 1 + i * 3) / 12);
    const actualYear = year + yearOffset;
    const start = new Date(actualYear, qStartMonth - 1, 1);
    const endMonth = ((startMonth - 1 + i * 3 + 2) % 12) + 1;
    const endYearOffset = Math.floor((startMonth - 1 + i * 3 + 2) / 12);
    const endActualYear = year + endYearOffset;
    const end = new Date(endActualYear, endMonth, 0);
    result.push({
      periodNumber: i + 1,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
  }
  return result;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const REOPEN_REASON_MIN_LENGTH = 5;

// ─── Preview table helper functions ──────────────────────────────────────────

/**
 * Format a decimal string (from backend) as a comma-thousands number.
 * e.g. "1234.56" → "1,234.56"
 */
function formatDecimalStr(value: string | null): string {
  if (value === null) return '—';
  const n = parseFloat(value);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Parse a decimal string from the backend to a JS number.
 * Returns 0 for null / unparseable values.
 */
function parseDecimalStr(value: string | null): number {
  if (value === null) return 0;
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}

// ─── Styled components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px;
`;

const PageSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 24px;
  line-height: 1.6;
  max-width: 820px;
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.neutral[200]};
  margin-bottom: 24px;
`;

// ─── Toolbar ──────────────────────────────────────────────────────────────────

const ToolbarCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 20px;
`;

const ToolbarRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
`;

const ToolbarLeft = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  flex: 1;
`;

const ToolbarField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const ToolbarLabel = styled.label`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ToolbarSelect = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 180px;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

// ─── Status pill toggle ────────────────────────────────────────────────────────

const PillToggleGroup = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  overflow: hidden;
`;

interface PillToggleButtonProps {
  $active: boolean;
}

const PillToggleButton = styled.button<PillToggleButtonProps>`
  padding: 8px 14px;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  font-family: inherit;
  border: none;
  border-right: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : theme.colors.background};
  color: ${({ $active, theme }) =>
    $active ? 'white' : theme.colors.textSecondary};
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  white-space: nowrap;

  &:last-child {
    border-right: none;
  }

  &:hover:not([disabled]) {
    background: ${({ $active, theme }) =>
      $active ? theme.colors.primary[700] : theme.colors.neutral[100]};
  }
`;

// ─── Create button ─────────────────────────────────────────────────────────────

const CreateButton = styled.button`
  padding: 10px 18px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Table ─────────────────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  overflow-x: auto;
  background: ${({ theme }) => theme.colors.surface};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
`;

const THead = styled.thead`
  background: ${({ theme }) => theme.colors.neutral[100]};
  position: sticky;
  top: 0;
  z-index: 1;
`;

const Th = styled.th`
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

interface TrProps {
  $muted: boolean;
  $current: boolean;
}

const Tr = styled.tr<TrProps>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  border-left: ${({ $current, theme }) =>
    $current ? `3px solid ${theme.colors.primary[500]}` : '3px solid transparent'};
  opacity: ${({ $muted }) => ($muted ? 0.7 : 1)};
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const Td = styled.td`
  padding: 12px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
`;

const TdMuted = styled(Td)`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

// ─── Status badge ─────────────────────────────────────────────────────────────

/**
 * Three-state status badge:
 *   open   → green (success)
 *   closed → amber (warning)
 *   locked → red (error / danger)
 *
 * Uses theme tokens so the badge adapts to light/dark mode.
 * Fallbacks ensure the badge is visible even when the theme doesn't define
 * all three semantic color sets.
 */
interface StatusBadgeProps {
  $status: PeriodStatus;
}

const statusBadgeStyles = css<StatusBadgeProps>`
  ${({ $status, theme }) => {
    switch ($status) {
      case 'open':
        return css`
          background: ${theme.colors.successBg};
          color: ${theme.colors.success};
        `;
      case 'closed':
        return css`
          background: ${theme.colors.warningBg};
          color: ${theme.colors.warning};
        `;
      case 'locked':
        return css`
          background: ${theme.colors.errorBg};
          color: ${theme.colors.error};
        `;
      default:
        return css`
          background: ${theme.colors.neutral[100]};
          color: ${theme.colors.textSecondary};
        `;
    }
  }}
`;

const StatusBadge = styled.span<StatusBadgeProps>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  ${statusBadgeStyles}
`;

const CurrentBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: ${({ theme }) => theme.colors.primary[50]};
  color: ${({ theme }) => theme.colors.primary[700]};
  margin-left: 6px;
`;

// ─── Status dot indicator ─────────────────────────────────────────────────────

const StatusDot = styled.span<{ $status: PeriodStatus }>`
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'open':   return theme.colors.success;
      case 'closed': return theme.colors.warning;
      case 'locked': return theme.colors.error;
      default:       return theme.colors.neutral[400];
    }
  }};
`;

// ─── Action buttons ────────────────────────────────────────────────────────────

const CloseActionButton = styled.button`
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.errorBg};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const ReopenActionButton = styled.button`
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const LockedLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
`;

/** Audit history button — neutral/secondary style, sits alongside close/reopen. */
const AuditActionButton = styled.button`
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.neutral[400]};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

/** Wrapper to lay out multiple action buttons horizontally with a gap. */
const ActionsCell = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

// ─── Empty & loading states ────────────────────────────────────────────────────

const EmptyState = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  line-height: 1.6;
`;

const LoadingOverlay = styled.div`
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
`;

// ─── Modal primitives ─────────────────────────────────────────────────────────

/**
 * Backdrop click handler is intentionally omitted — modals close via X button
 * or Esc key only. (Project-wide rule from feedback_modal_ux.md)
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
  max-width: 520px;
  padding: 28px 28px 24px;
  position: relative;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px;
  padding-right: 36px;
  line-height: 1.3;
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

const ModalActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
`;

const CancelButton = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[200]};
  }
`;

const DangerConfirmButton = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.terracotta[600]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.terracotta[700]};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ConfirmButton = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Pre-close info panel ─────────────────────────────────────────────────────

const InfoPanel = styled.div<{ $variant: 'info' | 'warning' }>`
  padding: 14px 16px;
  border-radius: 10px;
  margin-bottom: 20px;
  font-size: 13px;
  line-height: 1.65;
  background: ${({ $variant, theme }) =>
    $variant === 'warning' ? theme.colors.warningBg : theme.colors.infoBg};
  color: ${({ $variant, theme }) =>
    $variant === 'warning' ? theme.colors.warning : theme.colors.info};
  border-left: 3px solid ${({ $variant, theme }) =>
    $variant === 'warning' ? theme.colors.warning : theme.colors.info};
`;

const InfoPanelTitle = styled.p`
  font-weight: 700;
  margin: 0 0 6px;
`;

const InfoPanelText = styled.p`
  margin: 0;
`;

// ─── Preview table styled components (T-060.11-preview-fe) ───────────────────

/**
 * Scrollable container: keeps the table compact when there are many lines.
 * max-height of ~260px (about 12 rows) before scroll kicks in.
 */
const PreviewTableContainer = styled.div`
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 8px;
  margin-bottom: 12px;
`;

const PreviewTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`;

const PreviewThead = styled.thead`
  background: ${({ theme }) => theme.colors.neutral[100]};
  position: sticky;
  top: 0;
  z-index: 1;
`;

const PreviewTfoot = styled.tfoot`
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const PreviewTh = styled.th`
  padding: 7px 10px;
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};

  &:nth-child(4),
  &:nth-child(5) {
    text-align: right;
  }
`;

const PreviewTd = styled.td`
  padding: 6px 10px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  white-space: nowrap;

  &:nth-child(4),
  &:nth-child(5) {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  }
`;

/** Totals row cells — bolder weight for emphasis */
const PreviewTotalTd = styled(PreviewTd)`
  font-weight: 700;
  border-bottom: none;
`;

/** Red imbalance warning row — shouldn't ever appear (backend guarantees balance) */
const ImbalanceWarningTd = styled.td.attrs({ colSpan: 5 })`
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  text-align: center;
`;

/** Net income summary line below the table */
const NetIncomeSummary = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 16px;

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

/** Spinner / loading state inside the modal */
const ModalLoadingState = styled.div`
  padding: 32px 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
`;

/** Inline error state inside the modal (dry-run failed) */
const ModalErrorBanner = styled.div`
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 8px;
  border-left: 3px solid ${({ theme }) => theme.colors.error};
`;

const PreviewSectionTitle = styled.p`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 8px;
`;

// ─── Form fields ──────────────────────────────────────────────────────────────

const FieldLabel = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const RequiredMark = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
`;

const Textarea = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary[100]};
  }
  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
    opacity: 0.7;
  }
`;

const CharCount = styled.p<{ $warn: boolean }>`
  font-size: 11px;
  text-align: right;
  margin: 4px 0 0;
  color: ${({ $warn, theme }) => ($warn ? theme.colors.error : theme.colors.textSecondary)};
`;

// ─── Reopen warning box ────────────────────────────────────────────────────────

const WarningBox = styled.div`
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.warningBg};
  border-radius: 10px;
  margin-bottom: 20px;
  font-size: 13px;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.warning};
  border-left: 3px solid ${({ theme }) => theme.colors.warning};
`;

// ─── Wizard-specific styled components ────────────────────────────────────────

const WizardBox = styled(ModalBox)`
  max-width: 540px;
`;

const WizardSection = styled.div`
  margin-bottom: 18px;
`;

const WizardSectionLabel = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 8px;
`;

const WizardInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const WizardSelect = styled.select`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const RadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  user-select: none;
`;

const WizardErrorText = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
  margin: 4px 0 0;
`;

const ProgressBar = styled.div`
  height: 4px;
  background: ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 16px;
`;

interface ProgressFillProps {
  $percent: number;
}

const ProgressFill = styled.div<ProgressFillProps>`
  height: 100%;
  background: ${({ theme }) => theme.colors.primary[500]};
  width: ${({ $percent }) => $percent}%;
  transition: width 200ms ease;
`;

// ─── Wizard form state ────────────────────────────────────────────────────────

type PeriodLength = 'monthly' | '445' | 'quarterly';
type StatusFilter = 'all' | 'open' | 'closed';
type InitialStatus = 'all_open' | 'current_closed';

interface WizardFormState {
  companyCode: string;
  fiscalYear: number;
  periodLength: PeriodLength;
  startMonth: number;
  initialStatus: InitialStatus;
}

// ─── Close modal state ────────────────────────────────────────────────────────

/**
 * Modal stages for the close flow:
 *   'preview' — show pre-close information (what will happen), year-end note
 *   'confirm' — show reason textarea + Confirm Close button
 */
type CloseModalStage = 'preview' | 'confirm';

// ─── Utility hook for Esc key ─────────────────────────────────────────────────

/** Calls the provided callback when Escape is pressed. */
function useEscKey(isOpen: boolean, onEsc: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEsc();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onEsc]);
}

// ─── ClosingJePreviewPanel sub-component ─────────────────────────────────────

interface ClosingJePreviewPanelProps {
  preview: ClosingJePreview;
  onCancel: () => void;
  onContinue: () => void;
}

/**
 * Renders Stage A of the close modal: the computed closing JE preview.
 *
 * Handles two cases:
 *   1. note != null OR (!isYearEnd AND lines.length === 0):
 *      — Prose-only panel with the note / mid-year message.
 *        Close is still valid; Confirm button advances to Stage B.
 *
 *   2. isYearEnd AND lines.length > 0:
 *      — Full scrollable JE preview table with totals row and net income summary.
 *        Includes a defensive imbalance guard that disables Confirm if backend
 *        totalDebit != totalCredit (shouldn't happen, but we guard it anyway).
 *
 * The "Continue to Close…" button always advances to Stage B unless an
 * imbalance is detected.
 */
function ClosingJePreviewPanel({ preview, onCancel, onContinue }: ClosingJePreviewPanelProps) {
  const { isYearEnd, lines, totalDebit, totalCredit, netIncome, targetAccount, note } = preview;

  const totalDebitNum = parseDecimalStr(totalDebit);
  const totalCreditNum = parseDecimalStr(totalCredit);
  const netIncomeNum = parseDecimalStr(netIncome);

  /**
   * Defensive imbalance guard.
   * Backend guarantees DR == CR, but we check client-side with a 0.01 AED tolerance
   * and disable Confirm if somehow the sums diverge. This mirrors the spec requirement.
   */
  const isImbalanced =
    lines.length > 0 && Math.abs(totalDebitNum - totalCreditNum) > 0.01;

  /**
   * Prose-only path:
   *   - note is non-null (backend explicitly says "no JE"), OR
   *   - non-year-end period with no lines (mid-year status-flip only)
   */
  const showProseOnly = note !== null || (!isYearEnd && lines.length === 0);

  if (showProseOnly) {
    const isYearEndNoJe = isYearEnd && note !== null;
    return (
      <>
        <InfoPanel $variant={isYearEndNoJe ? 'warning' : 'info'}>
          <InfoPanelTitle>
            {isYearEndNoJe ? 'Year-End Close — No Closing JE Required' : 'Mid-Year Close — Status Flip Only'}
          </InfoPanelTitle>
          <InfoPanelText>{note ?? 'Closing this period will mark it as CLOSED. No journal entries will be auto-posted.'}</InfoPanelText>
        </InfoPanel>

        <ModalActions>
          <CancelButton type="button" onClick={onCancel}>
            Cancel
          </CancelButton>
          <DangerConfirmButton type="button" onClick={onContinue}>
            Continue to Close…
          </DangerConfirmButton>
        </ModalActions>
      </>
    );
  }

  // Full preview table path (isYearEnd === true AND lines.length > 0)
  const netIncomeLabel = netIncomeNum >= 0 ? 'profit' : 'loss';
  const netIncomeDisplay = formatDecimalStr(
    netIncomeNum < 0 ? String(Math.abs(netIncomeNum)) : netIncome
  );

  return (
    <>
      <PreviewSectionTitle>Closing JE Preview — would post on confirm</PreviewSectionTitle>

      <PreviewTableContainer>
        <PreviewTable aria-label="Closing journal entry preview">
          <PreviewThead>
            <tr>
              <PreviewTh scope="col">#</PreviewTh>
              <PreviewTh scope="col">Account No.</PreviewTh>
              <PreviewTh scope="col">Account Name</PreviewTh>
              <PreviewTh scope="col">Debit</PreviewTh>
              <PreviewTh scope="col">Credit</PreviewTh>
            </tr>
          </PreviewThead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.lineNumber}>
                <PreviewTd>{line.lineNumber}</PreviewTd>
                <PreviewTd>{line.accountNumber}</PreviewTd>
                <PreviewTd style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {line.accountName}
                </PreviewTd>
                <PreviewTd>{formatDecimalStr(line.debit)}</PreviewTd>
                <PreviewTd>{formatDecimalStr(line.credit)}</PreviewTd>
              </tr>
            ))}
          </tbody>
          <PreviewTfoot>
            <tr>
              <PreviewTotalTd colSpan={3}>TOTALS</PreviewTotalTd>
              <PreviewTotalTd>{formatDecimalStr(totalDebit)}</PreviewTotalTd>
              <PreviewTotalTd>{formatDecimalStr(totalCredit)}</PreviewTotalTd>
            </tr>
            {isImbalanced && (
              <tr>
                <ImbalanceWarningTd>
                  Imbalanced — DO NOT COMMIT (DR {formatDecimalStr(totalDebit)} ≠ CR {formatDecimalStr(totalCredit)})
                </ImbalanceWarningTd>
              </tr>
            )}
          </PreviewTfoot>
        </PreviewTable>
      </PreviewTableContainer>

      <NetIncomeSummary>
        <strong>Net {netIncomeLabel} for period: {netIncomeDisplay} AED</strong>
        {targetAccount !== null && (
          <> — rolled into {targetAccount.accountNumber} {targetAccount.accountName}</>
        )}
      </NetIncomeSummary>

      <ModalActions>
        <CancelButton type="button" onClick={onCancel}>
          Cancel
        </CancelButton>
        <DangerConfirmButton
          type="button"
          onClick={onContinue}
          disabled={isImbalanced}
          title={isImbalanced ? 'Cannot confirm: closing entry is imbalanced' : undefined}
        >
          Continue to Close…
        </DangerConfirmButton>
      </ModalActions>
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PeriodsPage() {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const organizationId = useMemo<string>(() => {
    if (user?.organizationId) return user.organizationId;
    if (user?.role === 'super_admin') return PLATFORM_DEFAULT_ORG;
    return '';
  }, [user]);

  const canRead = READ_ROLES.has(user?.role ?? '');
  const canWrite = WRITE_ROLES.has(user?.role ?? '');
  const canAudit = AUDIT_ROLES.has(user?.role ?? '');

  // ── Companies ──────────────────────────────────────────────────────────────

  const { data: companiesData, isLoading: companiesLoading } =
    useFinanceCompanies(organizationId || null);
  const companies = companiesData ?? [];

  const [selectedCompanyCode, setSelectedCompanyCode] = useState('');
  const effectiveCompanyCode = selectedCompanyCode || (companies[0]?.companyCode ?? '');

  // ── Filters ────────────────────────────────────────────────────────────────

  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // ── Periods query ──────────────────────────────────────────────────────────

  const periodsParams = useMemo(
    () => ({
      organizationId,
      companyCode: effectiveCompanyCode || undefined,
    }),
    [organizationId, effectiveCompanyCode]
  );

  const {
    data: periodsData,
    isLoading: periodsLoading,
    isError: periodsError,
    error: periodsErrorObj,
  } = useFiscalPeriods(periodsParams);

  const allPeriods: FiscalPeriod[] = periodsData?.data ?? [];

  // Derive unique fiscal years from loaded data for the year filter dropdown
  const uniqueYears = useMemo<number[]>(() => {
    const s = new Set(allPeriods.map((p) => p.fiscalYear));
    return Array.from(s).sort((a, b) => b - a);
  }, [allPeriods]);

  // Apply client-side filters (year + status)
  const filteredPeriods = useMemo<FiscalPeriod[]>(() => {
    let result = allPeriods;
    if (yearFilter !== null) {
      result = result.filter((p) => p.fiscalYear === yearFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }
    return [...result].sort(
      (a, b) => b.fiscalYear - a.fiscalYear || a.periodNumber - b.periodNumber
    );
  }, [allPeriods, yearFilter, statusFilter]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const closeMutation = useClosePeriod();
  const reopenMutation = useReopenPeriod();
  const createMutation = useCreatePeriod();
  const previewMutation = useClosePeriodPreview();

  // ── Close modal state ──────────────────────────────────────────────────────

  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null);
  const [closeStage, setCloseStage] = useState<CloseModalStage>('preview');
  const [closeReason, setCloseReason] = useState('');
  const closeReasonRef = useRef<HTMLTextAreaElement>(null);
  /**
   * Stores the preview data fetched on modal open (dry-run result).
   * null until the dry-run resolves; cleared on modal dismiss.
   */
  const [closePreviewData, setClosePreviewData] = useState<ClosingJePreview | null>(null);
  /**
   * Error message from the dry-run call, if any.
   * When set, Stage A shows the error banner + Cancel only.
   */
  const [closePreviewError, setClosePreviewError] = useState<string | null>(null);

  const closeModalOpen = closeTarget !== null;

  const openCloseModal = useCallback(
    async (period: FiscalPeriod) => {
      // Reset state before opening so the previous run's data doesn't flash
      setCloseTarget(period);
      setCloseStage('preview');
      setCloseReason('');
      setClosePreviewData(null);
      setClosePreviewError(null);

      // Fire dry-run immediately on open — result drives Stage A content
      try {
        const result = await previewMutation.mutateAsync({
          periodId: period.periodId,
          organizationId,
        });
        setClosePreviewData(result.closingJePreview);
      } catch (err) {
        setClosePreviewError(extractErrorMessage(err, 'Preview failed — unable to load closing entry.'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId]
  );

  const dismissCloseModal = useCallback(() => {
    setCloseTarget(null);
    setCloseStage('preview');
    setCloseReason('');
    setClosePreviewData(null);
    setClosePreviewError(null);
  }, []);

  // Advance to Stage B (confirm) from Stage A (preview)
  const advanceToConfirm = useCallback(() => {
    setCloseStage('confirm');
    // Auto-focus the reason textarea when advancing
    requestAnimationFrame(() => closeReasonRef.current?.focus());
  }, []);

  useEscKey(closeModalOpen, dismissCloseModal);

  const handleConfirmClose = async () => {
    if (!closeTarget) return;
    try {
      const result = await closeMutation.mutateAsync({
        periodId: closeTarget.periodId,
        organizationId,
        reason: closeReason.trim() || undefined,
      });

      // Surface closing JE info in toast for year-end periods
      if (result.closingJe) {
        const { jeNumber, netIncome, currencyCode } = result.closingJe;
        const amtStr = formatAmount(netIncome, currencyCode);
        addToast(
          'success',
          `Period ${closeTarget.fiscalYear} P${closeTarget.periodNumber} closed. ` +
          `Closing JE ${jeNumber} auto-posted (${amtStr}).`
        );
      } else {
        addToast(
          'success',
          `Period ${closeTarget.fiscalYear} P${closeTarget.periodNumber} closed.`
        );
      }
      setCloseTarget(null);
    } catch (err) {
      const msg = extractErrorMessage(err, 'Failed to close period.');
      addToast('error', msg);
    }
  };

  // ── Reopen modal state ─────────────────────────────────────────────────────

  const [reopenTarget, setReopenTarget] = useState<FiscalPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const reopenReasonRef = useRef<HTMLTextAreaElement>(null);

  const reopenModalOpen = reopenTarget !== null;

  const openReopenModal = useCallback((period: FiscalPeriod) => {
    setReopenTarget(period);
    setReopenReason('');
    // Auto-focus the reason textarea after modal renders
    requestAnimationFrame(() => reopenReasonRef.current?.focus());
  }, []);

  const dismissReopenModal = useCallback(() => {
    setReopenTarget(null);
    setReopenReason('');
  }, []);

  useEscKey(reopenModalOpen, dismissReopenModal);

  const reopenReasonValid = reopenReason.trim().length >= REOPEN_REASON_MIN_LENGTH;

  const handleConfirmReopen = async () => {
    if (!reopenTarget) return;
    try {
      const result = await reopenMutation.mutateAsync({
        periodId: reopenTarget.periodId,
        organizationId,
        reason: reopenReason.trim(),
      });

      // Surface reversal JE info in toast for year-end periods
      if (result.closingJeReversal) {
        const { jeNumber } = result.closingJeReversal;
        addToast(
          'success',
          `Period ${reopenTarget.fiscalYear} P${reopenTarget.periodNumber} reopened. ` +
          `Closing JE reversed (${jeNumber}).`
        );
      } else {
        addToast(
          'success',
          `Period ${reopenTarget.fiscalYear} P${reopenTarget.periodNumber} reopened.`
        );
      }
      setReopenTarget(null);
    } catch (err) {
      const msg = extractErrorMessage(err, 'Failed to reopen period.');
      addToast('error', msg);
    }
  };

  // ── Audit history modal state ──────────────────────────────────────────────

  /**
   * auditTarget: the period whose audit history is being viewed.
   * null means the modal is closed.
   */
  const [auditTarget, setAuditTarget] = useState<FiscalPeriod | null>(null);

  const auditModalOpen = auditTarget !== null;

  const openAuditModal = useCallback((period: FiscalPeriod) => {
    setAuditTarget(period);
  }, []);

  const dismissAuditModal = useCallback(() => {
    setAuditTarget(null);
  }, []);

  // Esc key is handled inside AuditHistoryModal itself via its own useEscKey
  // equivalent — no additional handler needed here.

  // ── Create wizard state ────────────────────────────────────────────────────

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardForm, setWizardForm] = useState<WizardFormState>(() => ({
    companyCode: '',
    fiscalYear: new Date().getFullYear() + 1,
    periodLength: 'monthly',
    startMonth: 1,
    initialStatus: 'all_open',
  }));
  const [wizardProgress, setWizardProgress] = useState(0);
  const [wizardRunning, setWizardRunning] = useState(false);
  const [wizardErrors, setWizardErrors] = useState<string[]>([]);

  const dismissWizard = useCallback(() => {
    if (!wizardRunning) setWizardOpen(false);
  }, [wizardRunning]);

  useEscKey(wizardOpen, dismissWizard);

  const openWizard = () => {
    setWizardForm({
      companyCode: effectiveCompanyCode,
      fiscalYear: new Date().getFullYear() + 1,
      periodLength: 'monthly',
      startMonth: 1,
      initialStatus: 'all_open',
    });
    setWizardProgress(0);
    setWizardErrors([]);
    setWizardOpen(true);
  };

  const handleWizardConfirm = async () => {
    setWizardErrors([]);

    const { companyCode, fiscalYear, periodLength, startMonth, initialStatus } = wizardForm;

    if (!companyCode) {
      setWizardErrors(['Company Code is required.']);
      return;
    }
    if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) {
      setWizardErrors(['Fiscal Year must be between 2000 and 2100.']);
      return;
    }

    let periodDefs: Array<{ periodNumber: number; startDate: string; endDate: string }>;
    if (periodLength === 'monthly') {
      periodDefs = calcMonthlyPeriods(fiscalYear, startMonth, 12);
    } else if (periodLength === '445') {
      periodDefs = calc445Periods(fiscalYear, startMonth);
    } else {
      periodDefs = calcQuarterlyPeriods(fiscalYear, startMonth);
    }

    const today = todayIso();

    setWizardRunning(true);
    setWizardProgress(0);

    const errors: string[] = [];
    let successCount = 0;

    await Promise.all(
      periodDefs.map(async (def, idx) => {
        const isCurrentCalendar =
          today >= def.startDate && today <= def.endDate;
        const status: 'open' | 'closed' =
          initialStatus === 'all_open'
            ? 'open'
            : isCurrentCalendar
            ? 'open'
            : 'closed';

        try {
          await createMutation.mutateAsync({
            organizationId,
            companyCode,
            fiscalYear,
            periodNumber: def.periodNumber,
            startDate: def.startDate,
            endDate: def.endDate,
            status,
          });
          successCount++;
        } catch (err) {
          const msg = extractErrorMessage(
            err,
            `P${def.periodNumber}: creation failed`
          );
          errors.push(msg);
        } finally {
          setWizardProgress(Math.round(((idx + 1) / periodDefs.length) * 100));
        }
      })
    );

    setWizardRunning(false);

    if (errors.length === 0) {
      addToast(
        'success',
        `Created ${successCount} period${successCount !== 1 ? 's' : ''} for fiscal year ${fiscalYear}.`
      );
      setWizardOpen(false);
    } else {
      setWizardErrors(errors);
      if (successCount > 0) {
        addToast(
          'warning',
          `Created ${successCount} of ${periodDefs.length} periods. See errors below.`
        );
      }
    }
  };

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <PageContainer>
        <EmptyState>You don't have permission to view Fiscal Periods.</EmptyState>
      </PageContainer>
    );
  }

  if (!organizationId || companiesLoading) {
    return (
      <PageContainer>
        <EmptyState>Loading…</EmptyState>
      </PageContainer>
    );
  }

  const periodsErrorMessage = periodsError
    ? extractErrorMessage(periodsErrorObj, 'Failed to load fiscal periods.')
    : null;

  // ── Mutation pending checks (typed — no @ts-ignore needed) ─────────────────

  const isClosePending = (period: FiscalPeriod): boolean =>
    closeMutation.isPending &&
    (closeMutation.variables as { periodId: string } | undefined)?.periodId === period.periodId;

  const isReopenPending = (period: FiscalPeriod): boolean =>
    reopenMutation.isPending &&
    (reopenMutation.variables as { periodId: string } | undefined)?.periodId === period.periodId;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageTitle>Fiscal Periods</PageTitle>
      <PageSubtitle>
        Open periods accept new postings. Closed periods reject any new journal entries,
        including reversals. Locked periods are permanently closed and cannot be reopened
        from this page. To correct a posting in a closed period, reopen it temporarily or
        post a reversal in the current open period.
      </PageSubtitle>
      <Divider />

      {/* ── Toolbar ── */}
      <ToolbarCard>
        <ToolbarRow>
          <ToolbarLeft>
            {/* Company picker */}
            <ToolbarField>
              <ToolbarLabel htmlFor="periods-company">Company</ToolbarLabel>
              <ToolbarSelect
                id="periods-company"
                value={effectiveCompanyCode}
                onChange={(e) => setSelectedCompanyCode(e.target.value)}
                aria-label="Select company"
              >
                {companies.map((c) => (
                  <option key={c.companyCode} value={c.companyCode}>
                    {c.companyCode} — {c.legalName}
                  </option>
                ))}
                {companies.length === 0 && <option value="">No companies</option>}
              </ToolbarSelect>
            </ToolbarField>

            {/* Year filter */}
            <ToolbarField>
              <ToolbarLabel htmlFor="periods-year">Fiscal Year</ToolbarLabel>
              <ToolbarSelect
                id="periods-year"
                value={yearFilter === null ? '' : String(yearFilter)}
                onChange={(e) =>
                  setYearFilter(e.target.value === '' ? null : parseInt(e.target.value, 10))
                }
                aria-label="Filter by fiscal year"
              >
                <option value="">All years</option>
                {uniqueYears.map((yr) => (
                  <option key={yr} value={String(yr)}>
                    {yr}
                  </option>
                ))}
              </ToolbarSelect>
            </ToolbarField>

            {/* Status pill toggle */}
            <ToolbarField>
              <ToolbarLabel as="span">Status</ToolbarLabel>
              <PillToggleGroup role="group" aria-label="Filter by status">
                {(['all', 'open', 'closed'] as const).map((s) => (
                  <PillToggleButton
                    key={s}
                    $active={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                    aria-pressed={statusFilter === s}
                  >
                    {s === 'all' ? 'All' : s === 'open' ? 'Open only' : 'Closed only'}
                  </PillToggleButton>
                ))}
              </PillToggleGroup>
            </ToolbarField>
          </ToolbarLeft>

          {/* Create button — write-gated */}
          {canWrite && (
            <CreateButton
              type="button"
              onClick={openWizard}
              disabled={!effectiveCompanyCode}
            >
              Create Periods for Year…
            </CreateButton>
          )}
        </ToolbarRow>
      </ToolbarCard>

      {/* ── Error banner ── */}
      {periodsErrorMessage && (
        <ErrorBanner role="alert">{periodsErrorMessage}</ErrorBanner>
      )}

      {/* ── Loading ── */}
      {periodsLoading && (
        <LoadingOverlay aria-live="polite">Loading fiscal periods…</LoadingOverlay>
      )}

      {/* ── Table ── */}
      {!periodsLoading && (
        <TableWrapper>
          {filteredPeriods.length === 0 ? (
            <EmptyState>
              {allPeriods.length === 0 ? (
                <>
                  No fiscal periods have been set up yet.
                  {canWrite && (
                    <>
                      {' '}Click <strong>Create Periods for Year…</strong> to set up your fiscal
                      calendar.
                    </>
                  )}
                </>
              ) : (
                'No periods match the current filters.'
              )}
            </EmptyState>
          ) : (
            <Table role="table" aria-label="Fiscal Periods">
              <THead>
                <tr>
                  <Th scope="col">Fiscal Year</Th>
                  <Th scope="col">Period #</Th>
                  <Th scope="col">Start Date</Th>
                  <Th scope="col">End Date</Th>
                  <Th scope="col">Status</Th>
                  <Th scope="col">Last Updated</Th>
                  {(canWrite || canAudit) && <Th scope="col">Actions</Th>}
                </tr>
              </THead>
              <tbody>
                {filteredPeriods.map((period) => {
                  const isCurrent = isCurrentPeriod(period);
                  const isMuted = period.status === 'closed' || period.status === 'locked';
                  const isWorking = isClosePending(period) || isReopenPending(period);

                  return (
                    <Tr
                      key={period.periodId}
                      $muted={isMuted}
                      $current={isCurrent}
                    >
                      <Td>{period.fiscalYear}</Td>
                      <Td>P{period.periodNumber}</Td>
                      <Td>{formatDate(period.startDate)}</Td>
                      <Td>{formatDate(period.endDate)}</Td>
                      <Td>
                        <StatusBadge $status={period.status}>
                          <StatusDot $status={period.status} />
                          {period.status === 'open'
                            ? 'OPEN'
                            : period.status === 'closed'
                            ? 'CLOSED'
                            : 'LOCKED'}
                        </StatusBadge>
                        {isCurrent && <CurrentBadge>Current</CurrentBadge>}
                      </Td>
                      <TdMuted>{formatDateTime(period.updatedAt)}</TdMuted>
                      {(canWrite || canAudit) && (
                        <Td>
                          <ActionsCell>
                            {/* Close / Reopen / Locked — write-gated */}
                            {canWrite && (
                              <>
                                {period.status === 'open' ? (
                                  <CloseActionButton
                                    type="button"
                                    onClick={() => openCloseModal(period)}
                                    disabled={isWorking}
                                    aria-label={`Close period ${period.fiscalYear} P${period.periodNumber}`}
                                  >
                                    {isClosePending(period) ? 'Closing…' : 'Close Period'}
                                  </CloseActionButton>
                                ) : period.status === 'closed' ? (
                                  <ReopenActionButton
                                    type="button"
                                    onClick={() => openReopenModal(period)}
                                    disabled={isWorking}
                                    aria-label={`Reopen period ${period.fiscalYear} P${period.periodNumber}`}
                                  >
                                    {isReopenPending(period) ? 'Reopening…' : 'Reopen Period'}
                                  </ReopenActionButton>
                                ) : (
                                  /* locked — no affordance */
                                  <LockedLabel aria-label="Period is locked — cannot be changed here">
                                    Locked
                                  </LockedLabel>
                                )}
                              </>
                            )}

                            {/* Audit History — visible to super_admin, finance_admin, finance_reviewer */}
                            {canAudit && (
                              <AuditActionButton
                                type="button"
                                onClick={() => openAuditModal(period)}
                                aria-label={`View audit history for period ${period.fiscalYear} P${period.periodNumber}`}
                              >
                                Audit
                              </AuditActionButton>
                            )}
                          </ActionsCell>
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </TableWrapper>
      )}

      {/* ── Close modal (two-stage) ── */}
      {closeTarget && (
        <ModalBackdrop
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-modal-title"
          /* Backdrop click intentionally does nothing — Esc or X to close (project rule) */
        >
          {/* Use a wider box during Stage A to accommodate the preview table */}
          <ModalBox style={{ maxWidth: closeStage === 'preview' ? '680px' : '520px' }}>
            <ModalCloseBtn
              onClick={dismissCloseModal}
              aria-label="Cancel — do not close this period"
            >
              ×
            </ModalCloseBtn>

            <ModalTitle id="close-modal-title">
              Close Period — {closeTarget.fiscalYear} P{closeTarget.periodNumber}
              {' '}
              <span style={{ fontWeight: 400, fontSize: 14, color: 'inherit', opacity: 0.7 }}>
                ({formatDate(closeTarget.startDate)} – {formatDate(closeTarget.endDate)})
              </span>
            </ModalTitle>

            {/* Stage A: Closing JE preview (fetched on modal open) */}
            {closeStage === 'preview' && (
              <>
                {/* Loading state — dry-run in flight */}
                {previewMutation.isPending && (
                  <ModalLoadingState aria-live="polite">
                    Computing closing entry preview…
                  </ModalLoadingState>
                )}

                {/* Error state — dry-run call failed (validation error, 400, etc.) */}
                {!previewMutation.isPending && closePreviewError !== null && (
                  <>
                    <ModalErrorBanner role="alert">
                      <strong>Cannot preview close:</strong> {closePreviewError}
                    </ModalErrorBanner>
                    <ModalActions>
                      <CancelButton type="button" onClick={dismissCloseModal}>
                        Cancel
                      </CancelButton>
                    </ModalActions>
                  </>
                )}

                {/* Success state — render preview content */}
                {!previewMutation.isPending && closePreviewError === null && closePreviewData !== null && (
                  <ClosingJePreviewPanel
                    preview={closePreviewData}
                    onCancel={dismissCloseModal}
                    onContinue={advanceToConfirm}
                  />
                )}
              </>
            )}

            {/* Stage B: Confirm with reason */}
            {closeStage === 'confirm' && (
              <>
                <FieldLabel htmlFor="close-reason">
                  Close Reason
                  {/* Reason is optional per backend (ClosePeriodRequest) */}
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, textTransform: 'none' }}>
                    (optional — recorded in audit log)
                  </span>
                </FieldLabel>
                <Textarea
                  ref={closeReasonRef}
                  id="close-reason"
                  placeholder="e.g. Month-end complete, all reconciliations signed off"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  maxLength={500}
                  aria-describedby="close-reason-count"
                />
                <CharCount
                  id="close-reason-count"
                  $warn={closeReason.length > 480}
                  aria-live="polite"
                >
                  {closeReason.length}/500
                </CharCount>

                <ModalActions>
                  <CancelButton
                    type="button"
                    onClick={() => setCloseStage('preview')}
                  >
                    Back
                  </CancelButton>
                  <CancelButton type="button" onClick={dismissCloseModal}>
                    Cancel
                  </CancelButton>
                  <DangerConfirmButton
                    type="button"
                    onClick={handleConfirmClose}
                    disabled={closeMutation.isPending}
                  >
                    {closeMutation.isPending ? 'Closing…' : 'Confirm Close'}
                  </DangerConfirmButton>
                </ModalActions>
              </>
            )}
          </ModalBox>
        </ModalBackdrop>
      )}

      {/* ── Reopen confirmation modal ── */}
      {reopenTarget && (
        <ModalBackdrop
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-modal-title"
        >
          <ModalBox>
            <ModalCloseBtn
              onClick={dismissReopenModal}
              aria-label="Cancel — do not reopen this period"
            >
              ×
            </ModalCloseBtn>
            <ModalTitle id="reopen-modal-title">
              Reopen Period — {reopenTarget.fiscalYear} P{reopenTarget.periodNumber}
            </ModalTitle>

            <WarningBox>
              Reopening a closed period allows new postings to be made against it.
              {isLikelyYearEnd(reopenTarget, allPeriods) && (
                <> Any closing JE that was auto-posted on close will be
                automatically reversed.</>
              )}
              {' '}This action is logged for audit purposes. Only reopen if you have
              an approved correction to back-post.
            </WarningBox>

            <FieldLabel htmlFor="reopen-reason">
              Reopen Reason <RequiredMark aria-hidden="true">*</RequiredMark>
              <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, textTransform: 'none' }}>
                (required — min {REOPEN_REASON_MIN_LENGTH} characters)
              </span>
            </FieldLabel>
            <Textarea
              ref={reopenReasonRef}
              id="reopen-reason"
              placeholder="e.g. Approved correction for invoice allocation error — ref. approval #123"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              maxLength={500}
              aria-required="true"
              aria-describedby="reopen-reason-count reopen-reason-hint"
            />
            <CharCount
              id="reopen-reason-count"
              $warn={reopenReason.length > 480}
              aria-live="polite"
            >
              {reopenReason.trim().length < REOPEN_REASON_MIN_LENGTH
                ? `${REOPEN_REASON_MIN_LENGTH - reopenReason.trim().length} more character${
                    REOPEN_REASON_MIN_LENGTH - reopenReason.trim().length === 1 ? '' : 's'
                  } required`
                : `${reopenReason.length}/500`}
            </CharCount>

            <ModalActions>
              <CancelButton type="button" onClick={dismissReopenModal}>
                Cancel
              </CancelButton>
              <ConfirmButton
                type="button"
                onClick={handleConfirmReopen}
                disabled={reopenMutation.isPending || !reopenReasonValid}
                aria-describedby={!reopenReasonValid ? 'reopen-reason-hint' : undefined}
              >
                {reopenMutation.isPending ? 'Reopening…' : 'Confirm Reopen'}
              </ConfirmButton>
            </ModalActions>
            {!reopenReasonValid && (
              <p
                id="reopen-reason-hint"
                style={{ fontSize: 12, color: 'inherit', opacity: 0.7, margin: '8px 0 0', textAlign: 'right' }}
              >
                A reason of at least {REOPEN_REASON_MIN_LENGTH} characters is required.
              </p>
            )}
          </ModalBox>
        </ModalBackdrop>
      )}

      {/* ── Create Periods wizard modal ── */}
      {wizardOpen && (
        <ModalBackdrop
          role="dialog"
          aria-modal="true"
          aria-labelledby="wizard-modal-title"
        >
          <WizardBox>
            <ModalCloseBtn
              onClick={dismissWizard}
              aria-label="Close wizard"
              disabled={wizardRunning}
            >
              ×
            </ModalCloseBtn>
            <ModalTitle id="wizard-modal-title">
              Create Periods for Year
            </ModalTitle>

            {wizardRunning && (
              <ProgressBar>
                <ProgressFill $percent={wizardProgress} />
              </ProgressBar>
            )}

            {/* Company code */}
            <WizardSection>
              <WizardSectionLabel htmlFor="wizard-company">Company Code</WizardSectionLabel>
              <WizardSelect
                id="wizard-company"
                value={wizardForm.companyCode}
                onChange={(e) =>
                  setWizardForm((f) => ({ ...f, companyCode: e.target.value }))
                }
                disabled={wizardRunning}
              >
                <option value="">— Select company —</option>
                {companies.map((c) => (
                  <option key={c.companyCode} value={c.companyCode}>
                    {c.companyCode} — {c.legalName}
                  </option>
                ))}
              </WizardSelect>
            </WizardSection>

            {/* Fiscal year */}
            <WizardSection>
              <WizardSectionLabel htmlFor="wizard-year">Fiscal Year</WizardSectionLabel>
              <WizardInput
                id="wizard-year"
                type="number"
                min={2000}
                max={2100}
                value={wizardForm.fiscalYear}
                onChange={(e) =>
                  setWizardForm((f) => ({
                    ...f,
                    fiscalYear: parseInt(e.target.value, 10) || f.fiscalYear,
                  }))
                }
                disabled={wizardRunning}
              />
            </WizardSection>

            {/* Period length */}
            <WizardSection>
              <WizardSectionLabel as="span">Period Length</WizardSectionLabel>
              <RadioGroup role="radiogroup" aria-label="Period length">
                {(
                  [
                    { value: 'monthly', label: 'Monthly (12 periods)' },
                    { value: '445', label: '4-4-5 calendar (13 periods)' },
                    { value: 'quarterly', label: 'Quarterly (4 periods)' },
                  ] as const
                ).map(({ value, label }) => (
                  <RadioLabel key={value}>
                    <input
                      type="radio"
                      name="period-length"
                      value={value}
                      checked={wizardForm.periodLength === value}
                      onChange={() =>
                        setWizardForm((f) => ({ ...f, periodLength: value }))
                      }
                      disabled={wizardRunning}
                    />
                    {label}
                  </RadioLabel>
                ))}
              </RadioGroup>
            </WizardSection>

            {/* Year start month */}
            <WizardSection>
              <WizardSectionLabel htmlFor="wizard-start-month">
                Year Start Month
              </WizardSectionLabel>
              <WizardSelect
                id="wizard-start-month"
                value={wizardForm.startMonth}
                onChange={(e) =>
                  setWizardForm((f) => ({
                    ...f,
                    startMonth: parseInt(e.target.value, 10),
                  }))
                }
                disabled={wizardRunning}
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </WizardSelect>
            </WizardSection>

            {/* Initial status */}
            <WizardSection>
              <WizardSectionLabel as="span">Initial Status</WizardSectionLabel>
              <RadioGroup role="radiogroup" aria-label="Initial period status">
                <RadioLabel>
                  <input
                    type="radio"
                    name="initial-status"
                    value="all_open"
                    checked={wizardForm.initialStatus === 'all_open'}
                    onChange={() =>
                      setWizardForm((f) => ({ ...f, initialStatus: 'all_open' }))
                    }
                    disabled={wizardRunning}
                  />
                  All Open
                </RadioLabel>
                <RadioLabel>
                  <input
                    type="radio"
                    name="initial-status"
                    value="current_closed"
                    checked={wizardForm.initialStatus === 'current_closed'}
                    onChange={() =>
                      setWizardForm((f) => ({
                        ...f,
                        initialStatus: 'current_closed',
                      }))
                    }
                    disabled={wizardRunning}
                  />
                  All Closed except current month
                </RadioLabel>
              </RadioGroup>
            </WizardSection>

            {/* Inline errors */}
            {wizardErrors.length > 0 && (
              <div role="alert">
                {wizardErrors.map((e, i) => (
                  <WizardErrorText key={i}>{e}</WizardErrorText>
                ))}
              </div>
            )}

            <ModalActions>
              <CancelButton
                type="button"
                onClick={dismissWizard}
                disabled={wizardRunning}
              >
                Cancel
              </CancelButton>
              <ConfirmButton
                type="button"
                onClick={handleWizardConfirm}
                disabled={wizardRunning || !wizardForm.companyCode}
              >
                {wizardRunning
                  ? `Creating… ${wizardProgress}%`
                  : 'Create Periods'}
              </ConfirmButton>
            </ModalActions>
          </WizardBox>
        </ModalBackdrop>
      )}
      {/* ── Audit History modal ── */}
      {auditTarget && (
        <AuditHistoryModal
          isOpen={auditModalOpen}
          onClose={dismissAuditModal}
          organizationId={organizationId}
          entityType="FiscalPeriod"
          entityId={auditTarget.periodId}
          entityLabel={`${auditTarget.fiscalYear} P${auditTarget.periodNumber}`}
          viewerRole={user?.role}
        />
      )}
    </PageContainer>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;
  const e = err as {
    response?: { data?: { detail?: unknown; message?: string }; status?: number };
    message?: string;
  };
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (typeof e?.response?.data?.message === 'string')
    return e.response!.data!.message!;
  return e?.message ?? fallback;
}

