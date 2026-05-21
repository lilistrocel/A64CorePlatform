/**
 * PeriodsPage
 *
 * Finance — Fiscal Periods management.
 * Route: /finance/periods
 *
 * Open periods accept new journal entry postings.
 * Closed periods reject any new entries, including reversals.
 *
 * Features:
 *  - Company picker (useFinanceCompanies)
 *  - Fiscal year filter (derived from loaded data) + "All years"
 *  - Status pill-toggle: All / Open only / Closed only
 *  - Table sorted by (fiscalYear DESC, periodNumber ASC)
 *    with current-period accent row, status pills, close/reopen actions
 *  - Close confirmation modal (X button only — no backdrop close)
 *  - Reopen confirmation modal (X button only — no backdrop close)
 *  - "Create Periods for Year…" bulk-create wizard modal
 *
 * Role gating:
 *  - Read: accountant, finance_admin, auditor, admin, super_admin
 *  - Write (close/reopen/create): finance_admin, admin, super_admin
 *
 * Modals do NOT close on overlay click — X button only.
 * (Project-wide rule: data-entry modals close via X, never on backdrop click.)
 */

import { useState, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import {
  useFiscalPeriods,
  useClosePeriod,
  useReopenPeriod,
  useCreatePeriod,
} from '../../hooks/queries/useFiscalPeriods';
import type { FiscalPeriod } from '../../services/fiscalPeriodsService';
import { useToastStore } from '../../stores/toast.store';

// ─── Role gates ───────────────────────────────────────────────────────────────

const READ_ROLES = new Set([
  'accountant',
  'finance_admin',
  'auditor',
  'admin',
  'super_admin',
]);

const WRITE_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

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

/** True if today falls within [startDate, endDate] inclusive. */
function isCurrentPeriod(period: FiscalPeriod): boolean {
  const today = todayIso();
  return today >= period.startDate && today <= period.endDate;
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
    // First day of the month
    const start = new Date(actualYear, month - 1, 1);
    // Last day of the month
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
 * Periods are 4 weeks each (28 days), starting from Jan 1 of the fiscal year.
 * Period 13 catches the remaining days.
 */
function calc445Periods(
  year: number,
  startMonth: number
): Array<{ periodNumber: number; startDate: string; endDate: string }> {
  const result: Array<{ periodNumber: number; startDate: string; endDate: string }> = [];
  // Start from 1st of the specified start month
  const startOfYear = new Date(year, startMonth - 1, 1);
  const yearEnd = new Date(year + 1, startMonth - 1, 0); // last day before next fiscal year starts

  for (let i = 0; i < 13; i++) {
    const start = new Date(startOfYear);
    start.setDate(start.getDate() + i * 28);
    let end: Date;
    if (i === 12) {
      // Period 13 runs to end of fiscal year
      end = yearEnd;
    } else {
      end = new Date(start);
      end.setDate(end.getDate() + 27); // 28-day period
    }
    result.push({
      periodNumber: i + 1,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
  }
  return result;
}

/**
 * Calculate 4 quarterly periods.
 */
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
    const end = new Date(endActualYear, endMonth, 0); // last day of that month
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

// ─── Styled components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 4px;
`;

const PageSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 24px;
  line-height: 1.6;
  max-width: 820px;
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.surface.sunken};
  margin-bottom: 24px;
`;

// ─── Toolbar ──────────────────────────────────────────────────────────────────

const ToolbarCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
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
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const ToolbarSelect = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  min-width: 180px;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

// ─── Status pill toggle ────────────────────────────────────────────────────────

const PillToggleGroup = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
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
  border-right: 1px solid ${({ theme }) => theme.colors.border.subtle};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sage : theme.colors.surface.canvas};
  color: ${({ $active, theme }) =>
    $active ? 'white' : theme.colors.text.secondary};
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  white-space: nowrap;

  &:last-child {
    border-right: none;
  }

  &:hover:not([disabled]) {
    background: ${({ $active, theme }) =>
      $active ? theme.colors.accent.sageDeep : theme.colors.surface.raised};
  }
`;

// ─── Create button ─────────────────────────────────────────────────────────────

const CreateButton = styled.button`
  padding: 10px 18px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Table ─────────────────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  overflow-x: auto;
  background: ${({ theme }) => theme.colors.surface.raised};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
`;

const THead = styled.thead`
  background: ${({ theme }) => theme.colors.surface.raised};
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
  color: ${({ theme }) => theme.colors.text.secondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.surface.sunken};
  white-space: nowrap;
`;

interface TrProps {
  $muted: boolean;
  $current: boolean;
}

const Tr = styled.tr<TrProps>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  border-left: ${({ $current }) => ($current ? '3px solid #0F6E56' : '3px solid transparent')};
  opacity: ${({ $muted }) => ($muted ? 0.7 : 1)};
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const Td = styled.td`
  padding: 12px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
  white-space: nowrap;
`;

const TdMuted = styled(Td)`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 12px;
`;

// ─── Status badge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  $status: 'open' | 'closed';
}

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
  background: ${({ $status }) =>
    $status === 'open' ? '#dcfce7' : '#DCD8CF'};
  color: ${({ $status }) =>
    $status === 'open' ? '#15803d' : '#4B4844'};
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
  background: rgba(15,110,86,0.05);
  color: #0B5644;
  margin-left: 6px;
`;

// ─── Action buttons ────────────────────────────────────────────────────────────

const CloseActionButton = styled.button`
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  border: 1px solid ${({ theme }) => theme.colors.status.danger || '#9E2A2A'};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.status.danger || '#9E2A2A'};
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.status.danger || 'rgba(158,42,42,0.06)'};
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
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.primary};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

// ─── Empty & loading states ────────────────────────────────────────────────────

const EmptyState = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
  line-height: 1.6;
`;

const LoadingOverlay = styled.div`
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.status.danger || 'rgba(158,42,42,0.06)'};
  color: ${({ theme }) => theme.colors.status.danger || '#9E2A2A'};
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
`;

// ─── Modal primitives ─────────────────────────────────────────────────────────

/**
 * Backdrop is NOT clickable — modals close via X button only.
 * (Project-wide rule from feedback_modal_ux.md)
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
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 480px;
  padding: 28px 28px 24px;
  position: relative;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 12px;
  padding-right: 32px;
`;

const ModalBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  line-height: 1.65;
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
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 18px;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
`;

const CancelButton = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.surface.sunken};
  }
`;

const DangerConfirmButton = styled.button`
  padding: 9px 18px;
  background: #9E2A2A;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: #9E2A2A;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ConfirmButton = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModalReasonLabel = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const ModalReasonInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: 20px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
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
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 8px;
`;

const WizardInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const WizardSelect = styled.select`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
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
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  user-select: none;
`;

const WizardErrorText = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.status.danger || '#9E2A2A'};
  margin: 4px 0 0;
`;

const ProgressBar = styled.div`
  height: 4px;
  background: ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 16px;
`;

interface ProgressFillProps {
  $percent: number;
}

const ProgressFill = styled.div<ProgressFillProps>`
  height: 100%;
  background: ${({ theme }) => theme.colors.accent.sage};
  width: ${({ $percent }) => $percent}%;
  transition: width 200ms ease;
`;

// ─── Wizard form state ────────────────────────────────────────────────────────

type PeriodLength = 'monthly' | '445' | 'quarterly';
type InitialStatus = 'all_open' | 'current_closed';

interface WizardFormState {
  companyCode: string;
  fiscalYear: number;
  periodLength: PeriodLength;
  startMonth: number;
  initialStatus: InitialStatus;
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

  // ── Companies ──────────────────────────────────────────────────────────────

  const { data: companiesData, isLoading: companiesLoading } =
    useFinanceCompanies(organizationId || null);
  const companies = companiesData ?? [];

  const [selectedCompanyCode, setSelectedCompanyCode] = useState('');
  const effectiveCompanyCode = selectedCompanyCode || (companies[0]?.companyCode ?? '');

  // ── Filters ────────────────────────────────────────────────────────────────

  const [yearFilter, setYearFilter] = useState<number | null>(null);
  type StatusFilter = 'all' | 'open' | 'closed';
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

  const allPeriods: FiscalPeriod[] = periodsData?.items ?? [];

  // Derive unique fiscal years from loaded data for the year filter dropdown
  const uniqueYears = useMemo<number[]>(() => {
    const s = new Set(allPeriods.map((p) => p.fiscalYear));
    return Array.from(s).sort((a, b) => b - a); // DESC
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
    // Sort: fiscalYear DESC, periodNumber ASC
    return [...result].sort(
      (a, b) => b.fiscalYear - a.fiscalYear || a.periodNumber - b.periodNumber
    );
  }, [allPeriods, yearFilter, statusFilter]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const closeMutation = useClosePeriod();
  const reopenMutation = useReopenPeriod();
  const createMutation = useCreatePeriod();

  // ── Close modal state ──────────────────────────────────────────────────────

  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null);
  const [closeReason, setCloseReason] = useState('');

  const openCloseModal = useCallback((period: FiscalPeriod) => {
    setCloseTarget(period);
    setCloseReason('');
  }, []);

  const handleConfirmClose = async () => {
    if (!closeTarget) return;
    try {
      await closeMutation.mutateAsync({
        periodId: closeTarget.periodId,
        organizationId: closeTarget.organizationId,
      });
      addToast('success', `Period ${closeTarget.fiscalYear} P${closeTarget.periodNumber} closed.`);
      setCloseTarget(null);
    } catch (err) {
      const msg = extractErrorMessage(err, 'Failed to close period.');
      addToast('error', msg);
    }
  };

  // ── Reopen modal state ─────────────────────────────────────────────────────

  const [reopenTarget, setReopenTarget] = useState<FiscalPeriod | null>(null);

  const openReopenModal = useCallback((period: FiscalPeriod) => {
    setReopenTarget(period);
  }, []);

  const handleConfirmReopen = async () => {
    if (!reopenTarget) return;
    try {
      await reopenMutation.mutateAsync({
        periodId: reopenTarget.periodId,
        organizationId: reopenTarget.organizationId,
      });
      addToast('success', `Period ${reopenTarget.fiscalYear} P${reopenTarget.periodNumber} reopened.`);
      setReopenTarget(null);
    } catch (err) {
      const msg = extractErrorMessage(err, 'Failed to reopen period.');
      addToast('error', msg);
    }
  };

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

    // Calculate period dates locally
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

    // Fire all POSTs; collect errors per period
    await Promise.all(
      periodDefs.map(async (def, idx) => {
        const isCurrentCalendar =
          today >= def.startDate && today <= def.endDate;
        // "All Closed except current month" logic
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
      // Partial success — show errors inline and keep wizard open
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageTitle>Fiscal Periods</PageTitle>
      <PageSubtitle>
        Open periods accept new postings. Closed periods reject any new journal entries,
        including reversals. To correct a posting in a closed period, reopen it temporarily
        or post a reversal in the current open period.
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
                  {canWrite && <Th scope="col">Actions</Th>}
                </tr>
              </THead>
              <tbody>
                {filteredPeriods.map((period) => {
                  const isCurrent = isCurrentPeriod(period);
                  const isClosed = period.status === 'closed';
                  const isWorking =
                    (closeMutation.isPending &&
                      // @ts-ignore — variables access on useMutation
                      closeMutation.variables?.periodId === period.periodId) ||
                    (reopenMutation.isPending &&
                      // @ts-ignore
                      reopenMutation.variables?.periodId === period.periodId);
                  return (
                    <Tr
                      key={period.periodId}
                      $muted={isClosed}
                      $current={isCurrent}
                    >
                      <Td>{period.fiscalYear}</Td>
                      <Td>P{period.periodNumber}</Td>
                      <Td>{formatDate(period.startDate)}</Td>
                      <Td>{formatDate(period.endDate)}</Td>
                      <Td>
                        <StatusBadge $status={period.status}>
                          {period.status === 'open' ? '●' : '○'} {period.status}
                        </StatusBadge>
                        {isCurrent && <CurrentBadge>Current</CurrentBadge>}
                      </Td>
                      <TdMuted>{formatDateTime(period.updatedAt)}</TdMuted>
                      {canWrite && (
                        <Td>
                          {period.status === 'open' ? (
                            <CloseActionButton
                              type="button"
                              onClick={() => openCloseModal(period)}
                              disabled={isWorking}
                              aria-label={`Close period ${period.fiscalYear} P${period.periodNumber}`}
                            >
                              Close Period
                            </CloseActionButton>
                          ) : (
                            <ReopenActionButton
                              type="button"
                              onClick={() => openReopenModal(period)}
                              disabled={isWorking}
                              aria-label={`Reopen period ${period.fiscalYear} P${period.periodNumber}`}
                            >
                              Reopen Period
                            </ReopenActionButton>
                          )}
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

      {/* ── Close confirmation modal ── */}
      {closeTarget && (
        <ModalBackdrop
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-modal-title"
          /* Backdrop click intentionally does nothing — X button only (project rule) */
        >
          <ModalBox>
            <ModalCloseBtn
              onClick={() => setCloseTarget(null)}
              aria-label="Cancel close"
            >
              ×
            </ModalCloseBtn>
            <ModalTitle id="close-modal-title">
              Close Period {closeTarget.fiscalYear} P{closeTarget.periodNumber}?
            </ModalTitle>
            <ModalBody>
              After closing, no new journal entries can post against this period. Existing
              JEs are unaffected. Reopen the period if you need to back-post corrections.
              Are you sure?
            </ModalBody>
            <ModalReasonLabel htmlFor="close-reason">
              Reason (optional)
            </ModalReasonLabel>
            <ModalReasonInput
              id="close-reason"
              type="text"
              placeholder="e.g. Month-end complete"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              aria-describedby="close-reason-hint"
            />
            <ModalActions>
              <CancelButton type="button" onClick={() => setCloseTarget(null)}>
                Cancel
              </CancelButton>
              <DangerConfirmButton
                type="button"
                onClick={handleConfirmClose}
                disabled={closeMutation.isPending}
              >
                {closeMutation.isPending ? 'Closing…' : 'Close Period'}
              </DangerConfirmButton>
            </ModalActions>
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
              onClick={() => setReopenTarget(null)}
              aria-label="Cancel reopen"
            >
              ×
            </ModalCloseBtn>
            <ModalTitle id="reopen-modal-title">
              Reopen Period {reopenTarget.fiscalYear} P{reopenTarget.periodNumber}?
            </ModalTitle>
            <ModalBody>
              Reopening a closed period is unusual. Only do this if you have an approved
              correction to back-post. Once reopened, new journal entries can be posted
              against this period until it is closed again.
            </ModalBody>
            <ModalActions>
              <CancelButton type="button" onClick={() => setReopenTarget(null)}>
                Cancel
              </CancelButton>
              <ConfirmButton
                type="button"
                onClick={handleConfirmReopen}
                disabled={reopenMutation.isPending}
              >
                {reopenMutation.isPending ? 'Reopening…' : 'Reopen Period'}
              </ConfirmButton>
            </ModalActions>
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
              onClick={() => !wizardRunning && setWizardOpen(false)}
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
                onClick={() => !wizardRunning && setWizardOpen(false)}
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
