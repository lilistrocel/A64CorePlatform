/**
 * ManualJournalEntryPage
 *
 * Finance-admin–only form for posting a correcting / adjusting JE.
 * Roles: super_admin, finance_admin (enforced by FinanceGate + route guard).
 * Route: /finance/journal-entries/new
 *
 * On success: redirects to /finance/journal-entries/{newJeId}
 *
 * Features:
 *  - React Hook Form + Zod validation (balanced lines, min 2, each line one side)
 *  - AccountCombobox + CostCenterCombobox per line
 *  - Inactive-account confirmation modal (no overlay close — project rule)
 *  - Period-validation client-side check (warns when jeDate has no open period)
 *  - Unsaved-changes guard via UnsavedChangesContext
 *  - Tab-to-add-line shortcut (from last Credit field)
 *  - Live balance indicator
 *  - Success / warning toasts on submit
 *  - Error handling with backend 422 detail messages
 */

import {
  Fragment,
  useState,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  useForm,
  useFieldArray,
  useWatch,
  Controller,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { X, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader, glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { showSuccessToast, showWarningToast, showErrorToast } from '../../stores/toast.store';
import { UnsavedChangesContext } from '../../contexts/UnsavedChangesContext';
import { useFinanceAccounts } from '../../hooks/queries/useFinanceAccounts';
import { useCostCenters } from '../../hooks/queries/useCostCenters';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import { useFiscalPeriods } from '../../hooks/queries/useFiscalPeriods';
import { useCreateManualJournalEntry } from '../../hooks/queries/useJournalEntries';
import { AccountCombobox } from '../../components/finance/AccountCombobox';
import { CostCenterCombobox } from '../../components/finance/CostCenterCombobox';
import type { GLAccount } from '../../services/financeAccountsService';

// ─── Zod schema ────────────────────────────────────────────────────────────────

const lineSchema = z
  .object({
    accountId: z.string().uuid('Account is required'),
    costCenterId: z.string().uuid().nullable().optional(),
    debit: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount (e.g. 100.00)')
      .nullable()
      .optional(),
    credit: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount (e.g. 100.00)')
      .nullable()
      .optional(),
    description: z.string().max(500).nullable().optional(),
    // UI-only flag — tracks whether the per-line description row is visible
    _descExpanded: z.boolean().optional(),
  })
  .refine(
    (l) => {
      const hasDebit = !!l.debit && l.debit !== '';
      const hasCredit = !!l.credit && l.credit !== '';
      return (hasDebit && !hasCredit) || (!hasDebit && hasCredit);
    },
    { message: 'Each line must have exactly one of Debit or Credit', path: ['debit'] }
  )
  .refine(
    (l) => {
      const amount = parseFloat(l.debit ?? l.credit ?? '0');
      return amount > 0;
    },
    { message: 'Amount must be greater than zero', path: ['debit'] }
  );

const formSchema = z
  .object({
    organizationId: z.string().uuid(),
    companyCode: z.string().min(1, 'Company is required'),
    jeDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    description: z.string().min(1, 'Description is required').max(500, 'Max 500 characters'),
    reason: z
      .string()
      .trim()
      .min(1, 'Reason is required (audit memo)')
      .max(500, 'Max 500 characters'),
    lines: z.array(lineSchema).min(2, 'At least 2 lines are required'),
  })
  .refine(
    (f) => {
      const dr = f.lines.reduce((s, l) => s + parseFloat(l.debit ?? '0'), 0);
      const cr = f.lines.reduce((s, l) => s + parseFloat(l.credit ?? '0'), 0);
      return Math.abs(dr - cr) < 0.005; // half-cent tolerance for float
    },
    { message: 'JE is not balanced (SUM debit must equal SUM credit)', path: ['lines'] }
  );

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_LINE = {
  accountId: '',
  costCenterId: null,
  debit: null,
  credit: null,
  description: null,
  _descExpanded: false,
};

// ─── Styled components ─────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1280px;
  margin: 0 auto;
`;

// Access-denied fallback heading only — the real page identity is the
// shared PageHeader rendered in the main return below.
const DeniedTitle = styled.h1`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 28px;
`;

const FormCard = styled.div`
  ${glassPanel}
  padding: 28px 32px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px 24px;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FieldFull = styled.div`
  grid-column: 1 / -1;
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

// Space Mono uppercase micro-label, spec §4 Inputs.
const Label = styled.label`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const StyledInput = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.glass.border)};
  transition: border-color 150ms ease;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }
`;

const StyledTextarea = styled.textarea<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  min-height: 72px;
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.glass.border)};
  transition: border-color 150ms ease;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }
`;

const StyledSelect = styled.select<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 8px 10px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.glass.border)};

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }
`;

const CharCount = styled.div<{ $warn: boolean }>`
  font-size: 11px;
  text-align: right;
  color: ${({ $warn, theme }) => ($warn ? theme.colors.error : theme.colors.muted)};
  margin-top: 2px;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
  margin-top: 2px;
`;

const SectionDivider = styled.div`
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  margin: 24px 0 20px;
  padding-top: 20px;
`;

// Spec §3 allows a "short gold underline on section headers" — this is the
// one section header on this page, so it is a deliberate, budgeted gold spend.
const SectionTitle = styled.h2`
  ${monoLabel}
  position: relative;
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 18px;
  padding-bottom: 8px;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    width: 28px;
    height: 2px;
    border-radius: 2px;
    background: ${({ theme }) => theme.colors.secondary[500]};
  }
`;

// ─── Lines table ───────────────────────────────────────────────────────────────

const LinesTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
`;

const LinesColGroup = styled.colgroup``;

const LinesTh = styled.th`
  ${monoLabel}
  padding: 8px 6px;
  text-align: left;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  background: transparent;
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
`;

const LinesTd = styled.td`
  padding: 6px;
  vertical-align: top;
`;

const LineNumber = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(180, 200, 220, 0.12);
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 11px;
  font-weight: 700;
  margin-top: 6px;
`;

// Debit/credit amount cells are intentionally NEUTRAL — per standard
// double-entry-accounting convention, neither column is "good" or "bad";
// only the balance-check state below (BalanceStatus) carries polarity
// colour (spec judgment call: don't colour debit/credit columns as if one
// side were negative).
const AmountInput = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  width: 100%;
  box-sizing: border-box;
  padding: 8px 8px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: right;
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.glass.border)};
  transition: border-color 150ms ease;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border-radius: 6px;
  cursor: pointer;
  margin-top: 6px;
  transition: background 150ms ease, color 150ms ease;

  &:hover:not(:disabled) {
    background: rgba(240, 138, 112, 0.14);
    color: ${({ theme }) => theme.colors.bright.coral};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

const DescToggle = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  margin-top: 4px;
  text-decoration: underline dotted;
  display: block;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const DescInput = styled.input`
  ${glassControl}
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-top: 4px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// Ghost button — spec §4 Buttons: transparent, celeste text/border.
const AddLineButton = styled.button`
  margin-top: 12px;
  padding: 7px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px dashed ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 150ms ease;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

// ─── Balance bar ───────────────────────────────────────────────────────────────

// Balance-check indicator — the ONE place on this page where debit/credit
// polarity colour applies (spec judgment call): balanced -> bright.emerald,
// imbalanced -> bright.coral. The DR/CR amount columns themselves stay
// neutral (see AmountInput above) — standard double-entry convention.
const BalanceBar = styled.div<{ $balanced: boolean }>`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background: ${({ $balanced }) => ($balanced ? 'rgba(84, 211, 155, 0.12)' : 'rgba(240, 138, 112, 0.12)')};
  border: 1px solid ${({ $balanced }) => ($balanced ? 'rgba(84, 211, 155, 0.4)' : 'rgba(240, 138, 112, 0.4)')};
  font-size: 13px;
`;

const BalanceItem = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.celeste};
  span {
    font-weight: 700;
    font-family: ${({ theme }) => theme.typography.fontFamily.mono};
    color: ${({ theme }) => theme.colors.textPrimary};
    margin-left: 4px;
  }
`;

const BalanceStatus = styled.div<{ $balanced: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: ${({ $balanced, theme }) => ($balanced ? theme.colors.bright.emerald : theme.colors.bright.coral)};
`;

// ─── Period warning ────────────────────────────────────────────────────────────
// Uses the semantic `warning` token directly (bright.gold's warning/toast
// twin per mixins.ts — NOT `secondary[500]` "decorative" gold, and not
// counted against the page's CTA/section-underline gold budget since it
// only renders conditionally when a period problem exists).

const PeriodWarning = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.warning};
  margin-bottom: 20px;
`;

// ─── Footer buttons ────────────────────────────────────────────────────────────

const FormFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

// Secondary — spec §4 Buttons: glass + glass.border + cream text.
const CancelButton = styled.button`
  ${glassControl}
  padding: 10px 24px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

// The page's one primary CTA — spec §4 Buttons: gold gradient + onAccent
// (cosmos) text. Submitting the JE is the page's single primary action.
const SubmitButton = styled.button`
  padding: 10px 28px;
  background: linear-gradient(
    145deg,
    ${({ theme }) => theme.colors.secondary[500]},
    ${({ theme }) => theme.colors.secondary[600]}
  );
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

// ─── Inactive-account modal ────────────────────────────────────────────────────

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ModalCard = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 28px 32px;
  width: 100%;
  max-width: 520px;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px;
`;

const ModalBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 16px;
  line-height: 1.55;
`;

const ModalWarningList = styled.ul`
  margin: 0 0 20px;
  padding-left: 20px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.warning};
  background: ${({ theme }) => theme.colors.warningBg};
  border-radius: 8px;
  padding: 12px 12px 12px 28px;
  border: 1px solid ${({ theme }) => theme.colors.warning};
  line-height: 1.6;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

const ModalCancelBtn = styled.button`
  ${glassControl}
  padding: 9px 18px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
`;

const ModalContinueBtn = styled.button`
  padding: 9px 20px;
  background: linear-gradient(
    145deg,
    ${({ theme }) => theme.colors.secondary[500]},
    ${({ theme }) => theme.colors.secondary[600]}
  );
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
`;

// ─── Role guard ────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['finance_admin', 'super_admin']);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseMoney(val: string | null | undefined): number {
  if (!val || val === '') return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function extractBackendError(err: unknown): string {
  const axiosErr = err as {
    response?: { data?: { detail?: unknown }; status?: number };
    message?: string;
  };
  const detail = axiosErr?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // Pydantic validation_error array — join messages
    return detail.map((d: { msg?: string }) => d.msg ?? String(d)).join('; ');
  }
  return (axiosErr?.message as string | undefined) ?? 'Submission failed. Please try again.';
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ManualJournalEntryPage() {
  const theme = useTheme();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const unsavedChanges = useContext(UnsavedChangesContext);

  const organizationId = user?.organizationId ?? '';

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: accountsData } = useFinanceAccounts(organizationId);
  const { data: costCenters = [] } = useCostCenters(organizationId);
  const { data: companies = [] } = useFinanceCompanies(organizationId);

  // Derive the company code from the first (or only) company — pre-fill if single
  const defaultCompanyCode = companies.length === 1 ? companies[0].companyCode : '';

  // ── Form setup ──────────────────────────────────────────────────────────────
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      organizationId,
      companyCode: defaultCompanyCode,
      jeDate: new Date().toISOString().slice(0, 10),
      description: '',
      reason: '',
      lines: [{ ...DEFAULT_LINE }, { ...DEFAULT_LINE }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // When companies load and there's only one, pre-fill companyCode
  useEffect(() => {
    if (companies.length === 1) {
      setValue('companyCode', companies[0].companyCode);
    }
  }, [companies, setValue]);

  // Sync organizationId (derived from auth, should not change mid-session)
  useEffect(() => {
    if (organizationId) setValue('organizationId', organizationId);
  }, [organizationId, setValue]);

  // ── Unsaved-changes guard ────────────────────────────────────────────────────
  useEffect(() => {
    if (unsavedChanges) {
      unsavedChanges.setIsDirty(isDirty && !isSubmitting);
    }
    return () => {
      // Clear dirty flag on unmount (navigate away after submit, cancel, etc.)
      if (unsavedChanges) unsavedChanges.setIsDirty(false);
    };
  }, [isDirty, isSubmitting, unsavedChanges]);

  // ── Live watch for balance ───────────────────────────────────────────────────
  const watchedLines = useWatch({ control, name: 'lines' });
  const watchedCompanyCode = useWatch({ control, name: 'companyCode' });
  const watchedJeDate = useWatch({ control, name: 'jeDate' });
  const watchedDescription = watch('description');
  const watchedReason = watch('reason');

  const totalDr = useMemo(
    () => (watchedLines ?? []).reduce((s, l) => s + parseMoney(l.debit), 0),
    [watchedLines]
  );
  const totalCr = useMemo(
    () => (watchedLines ?? []).reduce((s, l) => s + parseMoney(l.credit), 0),
    [watchedLines]
  );
  const isBalanced = Math.abs(totalDr - totalCr) < 0.005;
  const balanceDelta = Math.abs(totalDr - totalCr);

  // ── Period validation (client-side) ─────────────────────────────────────────
  // Fetch open periods for the selected company; check whether jeDate is covered.
  const { data: periodsData } = useFiscalPeriods({
    organizationId,
    companyCode: watchedCompanyCode || undefined,
    status: 'open',
    page: 1,
    size: 50,
  });

  const periodError = useMemo(() => {
    if (!watchedJeDate || !watchedCompanyCode) return null;
    // periodsData is FiscalPeriodsListResponse — shape is { data: FiscalPeriod[] }
    const periods = periodsData?.data;
    if (!periods || periods.length === 0) {
      return `No open fiscal period covers ${watchedJeDate}. Open or create one before posting.`;
    }
    const jeDate = watchedJeDate;
    const covered = periods.some(
      (p) => p.startDate <= jeDate && p.endDate >= jeDate
    );
    return covered
      ? null
      : `No open fiscal period covers ${watchedJeDate}. Open or create one before posting.`;
  }, [watchedJeDate, watchedCompanyCode, periodsData]);

  // ── Inactive account detection ───────────────────────────────────────────────
  const postableAccounts: GLAccount[] = useMemo(
    () => (accountsData?.items ?? []).filter((a) => !a.isHeader),
    [accountsData]
  );

  const accountMap = useMemo(() => {
    const m = new Map<string, GLAccount>();
    for (const a of postableAccounts) m.set(a.accountId, a);
    return m;
  }, [postableAccounts]);

  // ── Inactive-account modal state ─────────────────────────────────────────────
  const [inactiveModalOpen, setInactiveModalOpen] = useState(false);
  const [inactiveWarnings, setInactiveWarnings] = useState<string[]>([]);
  const [pendingSubmitData, setPendingSubmitData] = useState<FormValues | null>(null);

  // ── Mutation ─────────────────────────────────────────────────────────────────
  const createMutation = useCreateManualJournalEntry();

  // ── Tab-to-add-line refs ─────────────────────────────────────────────────────
  // We detect Tab on the last credit input and add a new line.
  const lastCreditRef = useRef<HTMLInputElement | null>(null);

  // ── Submit flow ──────────────────────────────────────────────────────────────
  const executeSubmit = useCallback(
    async (data: FormValues) => {
      try {
        const requestLines = data.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit || null,
          credit: l.credit || null,
          costCenterId: l.costCenterId ?? null,
          description: l.description ?? null,
        }));

        const result = await createMutation.mutateAsync({
          organizationId: data.organizationId,
          companyCode: data.companyCode,
          jeDate: data.jeDate,
          description: data.description,
          reason: data.reason,
          lines: requestLines,
        });

        // Clear dirty flag so navigation guard doesn't fire
        if (unsavedChanges) unsavedChanges.setIsDirty(false);

        // Success toast
        showSuccessToast(
          `JE ${result.data.jeNumber} posted (${formatCurrency(
            parseFloat(result.data.totalDebit)
          )} AED)`
        );

        // Warning toast for inactive accounts
        if (result.meta.warnings.length > 0) {
          showWarningToast(result.meta.warnings.join(' | '));
        }

        // Navigate to the JE list, pre-filtered to show the new entry.
        // The detail route does not exist yet — the list page uses inline row-expansion.
        // Use the jeNumber (not jeId) as the search param because the list-page search
        // matches jeNumber and sourceDocNumber, and jeNumber is human-readable.
        navigate(
          `/finance/journal-entries?search=${encodeURIComponent(result.data.jeNumber)}`
        );
      } catch (err) {
        const msg = extractBackendError(err);
        showErrorToast(msg);
      }
    },
    [createMutation, navigate, unsavedChanges]
  );

  const onSubmit = useCallback(
    (data: FormValues) => {
      // Check for inactive accounts before submitting
      const inactiveLines: string[] = [];
      data.lines.forEach((l, idx) => {
        const acct = accountMap.get(l.accountId);
        if (acct && !acct.isActive) {
          inactiveLines.push(
            `Line ${idx + 1}: ${acct.accountNumber} — ${acct.accountName}`
          );
        }
      });

      if (inactiveLines.length > 0) {
        setInactiveWarnings(inactiveLines);
        setPendingSubmitData(data);
        setInactiveModalOpen(true);
        return;
      }

      void executeSubmit(data);
    },
    [accountMap, executeSubmit]
  );

  const handleInactiveContinue = useCallback(() => {
    setInactiveModalOpen(false);
    if (pendingSubmitData) {
      void executeSubmit(pendingSubmitData);
      setPendingSubmitData(null);
    }
  }, [pendingSubmitData, executeSubmit]);

  const handleInactiveCancel = useCallback(() => {
    setInactiveModalOpen(false);
    setPendingSubmitData(null);
    setInactiveWarnings([]);
  }, []);

  const handleCancel = useCallback(() => {
    if (isDirty && unsavedChanges) {
      unsavedChanges.checkNavigationAllowed('/finance/journal-entries', () => {
        navigate('/finance/journal-entries');
      });
    } else {
      navigate('/finance/journal-entries');
    }
  }, [isDirty, unsavedChanges, navigate]);

  // ── Submit button guard ──────────────────────────────────────────────────────
  const submitDisabled =
    !isBalanced ||
    !watchedCompanyCode ||
    !watchedJeDate ||
    !!periodError ||
    !watchedDescription?.trim() ||
    !watchedReason?.trim() ||
    isSubmitting ||
    createMutation.isPending;

  // ── Role guard ───────────────────────────────────────────────────────────────
  if (!ALLOWED_ROLES.has(user?.role ?? '')) {
    return (
      <Container>
        <DeniedTitle>Access Denied</DeniedTitle>
        <p>Only finance_admin and super_admin can create manual journal entries.</p>
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader
        breadcrumb="FINANCE · JOURNAL ENTRIES"
        title="New Manual Journal Entry"
        description="Post a correcting or adjusting journal entry — every line is recorded in the audit log."
      />

      {periodError && (
        <PeriodWarning role="alert">
          <AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>{periodError}</span>
        </PeriodWarning>
      )}

      <FormCard>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* ── Header fields ── */}
          <FieldGrid>
            {/* Company */}
            <FieldGroup>
              <Label htmlFor="companyCode">Company *</Label>
              <StyledSelect
                id="companyCode"
                $hasError={!!errors.companyCode}
                {...register('companyCode')}
                aria-invalid={!!errors.companyCode}
                aria-describedby={errors.companyCode ? 'companyCode-error' : undefined}
              >
                <option value="">Select company…</option>
                {companies.map((c) => (
                  <option key={c.companyCode} value={c.companyCode}>
                    {c.companyCode} — {c.legalName}
                  </option>
                ))}
              </StyledSelect>
              {errors.companyCode && (
                <ErrorText id="companyCode-error" role="alert">
                  {errors.companyCode.message}
                </ErrorText>
              )}
            </FieldGroup>

            {/* JE Date */}
            <FieldGroup>
              <Label htmlFor="jeDate">JE Date *</Label>
              <StyledInput
                id="jeDate"
                type="date"
                $hasError={!!errors.jeDate}
                {...register('jeDate')}
                aria-invalid={!!errors.jeDate}
                aria-describedby={errors.jeDate ? 'jeDate-error' : undefined}
              />
              {errors.jeDate && (
                <ErrorText id="jeDate-error" role="alert">
                  {errors.jeDate.message}
                </ErrorText>
              )}
            </FieldGroup>

            {/* Description */}
            <FieldFull>
              <FieldGroup>
                <Label htmlFor="description">Description *</Label>
                <StyledInput
                  id="description"
                  type="text"
                  $hasError={!!errors.description}
                  maxLength={500}
                  placeholder="Brief description of this journal entry"
                  {...register('description')}
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? 'description-error' : undefined}
                />
                <CharCount $warn={(watchedDescription?.length ?? 0) > 480}>
                  {watchedDescription?.length ?? 0} / 500
                </CharCount>
                {errors.description && (
                  <ErrorText id="description-error" role="alert">
                    {errors.description.message}
                  </ErrorText>
                )}
              </FieldGroup>
            </FieldFull>

            {/* Reason (audit memo) */}
            <FieldFull>
              <FieldGroup>
                <Label htmlFor="reason">
                  Reason <span style={{ fontSize: 11, fontWeight: 400, color: theme.colors.textSecondary }}>
                    (audit memo — required)
                  </span> *
                </Label>
                <StyledTextarea
                  id="reason"
                  $hasError={!!errors.reason}
                  maxLength={500}
                  placeholder="Explain why this journal entry is being posted (this is recorded in the audit log)"
                  {...register('reason')}
                  aria-invalid={!!errors.reason}
                  aria-describedby={errors.reason ? 'reason-error' : undefined}
                />
                <CharCount $warn={(watchedReason?.length ?? 0) > 480}>
                  {watchedReason?.length ?? 0} / 500
                </CharCount>
                {errors.reason && (
                  <ErrorText id="reason-error" role="alert">
                    {errors.reason.message}
                  </ErrorText>
                )}
              </FieldGroup>
            </FieldFull>
          </FieldGrid>

          {/* ── Lines section ── */}
          <SectionDivider>
            <SectionTitle>Journal Entry Lines</SectionTitle>

            <LinesTable aria-label="Journal entry lines">
              <LinesColGroup>
                <col style={{ width: '32px' }} />
                {/* # */}
                <col style={{ width: '35%' }} />
                {/* Account */}
                <col style={{ width: '20%' }} />
                {/* Cost Centre */}
                <col style={{ width: '12%' }} />
                {/* Debit */}
                <col style={{ width: '12%' }} />
                {/* Credit */}
                <col style={{ width: '32px' }} />
                {/* × */}
              </LinesColGroup>
              <thead>
                <tr>
                  <LinesTh>#</LinesTh>
                  <LinesTh>Account *</LinesTh>
                  <LinesTh>Cost Centre</LinesTh>
                  <LinesTh style={{ textAlign: 'right' }}>Debit</LinesTh>
                  <LinesTh style={{ textAlign: 'right' }}>Credit</LinesTh>
                  <LinesTh />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => {
                  const lineErrors = errors.lines?.[idx];
                  const isLast = idx === fields.length - 1;

                  return (
                    // Fragment with key so React correctly tracks the two-row pair per line
                    <Fragment key={field.id}>
                    <tr>
                        <LinesTd>
                          <LineNumber>{idx + 1}</LineNumber>
                        </LinesTd>

                        {/* Account combobox */}
                        <LinesTd>
                          <Controller
                            control={control}
                            name={`lines.${idx}.accountId`}
                            render={({ field: cf }) => (
                              <AccountCombobox
                                id={`line-${idx}-account`}
                                accounts={postableAccounts}
                                valueAccountId={cf.value || null}
                                onChange={(id) => cf.onChange(id ?? '')}
                                hasError={!!lineErrors?.accountId}
                                describedBy={
                                  lineErrors?.accountId
                                    ? `line-${idx}-account-error`
                                    : undefined
                                }
                              />
                            )}
                          />
                          {lineErrors?.accountId && (
                            <ErrorText id={`line-${idx}-account-error`} role="alert">
                              {lineErrors.accountId.message}
                            </ErrorText>
                          )}
                        </LinesTd>

                        {/* Cost centre combobox */}
                        <LinesTd>
                          <Controller
                            control={control}
                            name={`lines.${idx}.costCenterId`}
                            render={({ field: cf }) => (
                              <CostCenterCombobox
                                id={`line-${idx}-cc`}
                                costCenters={costCenters}
                                value={cf.value ?? null}
                                onChange={(id) => cf.onChange(id)}
                              />
                            )}
                          />
                        </LinesTd>

                        {/* Debit */}
                        <LinesTd>
                          <Controller
                            control={control}
                            name={`lines.${idx}.debit`}
                            render={({ field: cf }) => {
                              // Disable Debit if Credit has a value
                              const creditVal = watch(`lines.${idx}.credit`);
                              const hasCreditVal = !!creditVal && creditVal !== '';
                              return (
                                <AmountInput
                                  id={`line-${idx}-debit`}
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  $hasError={!!lineErrors?.debit}
                                  disabled={hasCreditVal}
                                  value={cf.value ?? ''}
                                  onChange={(e) => cf.onChange(e.target.value || null)}
                                  aria-label={`Line ${idx + 1} debit amount`}
                                />
                              );
                            }}
                          />
                        </LinesTd>

                        {/* Credit */}
                        <LinesTd>
                          <Controller
                            control={control}
                            name={`lines.${idx}.credit`}
                            render={({ field: cf }) => {
                              const debitVal = watch(`lines.${idx}.debit`);
                              const hasDebitVal = !!debitVal && debitVal !== '';
                              const isLastCreditField = isLast;

                              return (
                                <AmountInput
                                  id={`line-${idx}-credit`}
                                  ref={isLastCreditField ? lastCreditRef : undefined}
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  $hasError={!!lineErrors?.debit}
                                  disabled={hasDebitVal}
                                  value={cf.value ?? ''}
                                  onChange={(e) => cf.onChange(e.target.value || null)}
                                  aria-label={`Line ${idx + 1} credit amount`}
                                  onKeyDown={(e) => {
                                    // Tab from the last credit field → add new line
                                    if (e.key === 'Tab' && !e.shiftKey && isLastCreditField) {
                                      e.preventDefault();
                                      cf.onChange(cf.value); // commit current value
                                      append({ ...DEFAULT_LINE });
                                      // Focus the new row's account field after render
                                      requestAnimationFrame(() => {
                                        const newIdx = fields.length;
                                        document
                                          .getElementById(`line-${newIdx}-account`)
                                          ?.focus();
                                      });
                                    }
                                  }}
                                />
                              );
                            }}
                          />
                          {lineErrors?.debit && (
                            <ErrorText role="alert">{lineErrors.debit.message}</ErrorText>
                          )}
                        </LinesTd>

                        {/* Remove button */}
                        <LinesTd>
                          <RemoveButton
                            type="button"
                            onClick={() => remove(idx)}
                            disabled={fields.length <= 2}
                            aria-label={`Remove line ${idx + 1}`}
                            title={fields.length <= 2 ? 'At least 2 lines required' : 'Remove line'}
                          >
                            <X size={14} strokeWidth={1.8} aria-hidden="true" />
                          </RemoveButton>
                        </LinesTd>
                      </tr>

                      {/* Per-line description row (collapsed by default) */}
                      <tr>
                        <LinesTd />
                        <LinesTd colSpan={4}>
                          <Controller
                            control={control}
                            name={`lines.${idx}._descExpanded`}
                            render={({ field: cf }) => (
                              <>
                                {!cf.value && (
                                  <DescToggle
                                    type="button"
                                    onClick={() => cf.onChange(true)}
                                    aria-expanded={false}
                                    aria-label={`Add description for line ${idx + 1}`}
                                  >
                                    + note
                                  </DescToggle>
                                )}
                                {cf.value && (
                                  <Controller
                                    control={control}
                                    name={`lines.${idx}.description`}
                                    render={({ field: descField }) => (
                                      <DescInput
                                        type="text"
                                        placeholder={`Line ${idx + 1} description (optional, max 500 chars)`}
                                        maxLength={500}
                                        value={descField.value ?? ''}
                                        onChange={(e) =>
                                          descField.onChange(e.target.value || null)
                                        }
                                        aria-label={`Line ${idx + 1} description`}
                                      />
                                    )}
                                  />
                                )}
                              </>
                            )}
                          />
                        </LinesTd>
                        <LinesTd />
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </LinesTable>

            <AddLineButton
              type="button"
              onClick={() => append({ ...DEFAULT_LINE })}
              aria-label="Add a new journal entry line"
            >
              + Add Line
            </AddLineButton>

            {/* Balance / array-level error from the root refine (path: ['lines']) */}
            {errors.lines?.root?.message && (
              <ErrorText role="alert" style={{ marginTop: 12 }}>
                {errors.lines.root.message}
              </ErrorText>
            )}
            {/* The Zod root .refine on formSchema also fires when not balanced */}
            {!isBalanced && totalDr > 0 && (
              <ErrorText role="alert" style={{ marginTop: 12 }}>
                JE is not balanced — SUM(Debit) must equal SUM(Credit)
              </ErrorText>
            )}
          </SectionDivider>

          {/* ── Balance bar ── */}
          <BalanceBar $balanced={isBalanced} aria-live="polite" aria-atomic="true">
            <BalanceItem>
              Total DR: <span>{formatCurrency(totalDr)}</span>
            </BalanceItem>
            <BalanceItem>
              Total CR: <span>{formatCurrency(totalCr)}</span>
            </BalanceItem>
            <BalanceStatus $balanced={isBalanced}>
              {isBalanced ? (
                <>
                  <CheckCircle2 size={15} strokeWidth={1.8} aria-hidden="true" /> Balanced
                </>
              ) : (
                <>
                  <AlertCircle size={15} strokeWidth={1.8} aria-hidden="true" /> Imbalanced — Δ{' '}
                  {formatCurrency(balanceDelta)}
                </>
              )}
            </BalanceStatus>
          </BalanceBar>

          {/* ── Footer ── */}
          <FormFooter>
            <CancelButton type="button" onClick={handleCancel}>
              Cancel
            </CancelButton>
            <SubmitButton
              type="submit"
              disabled={submitDisabled}
              aria-busy={isSubmitting || createMutation.isPending}
            >
              {isSubmitting || createMutation.isPending
                ? 'Posting…'
                : 'Submit Manual JE'}
            </SubmitButton>
          </FormFooter>
        </form>
      </FormCard>

      {/* ── Inactive-account confirmation modal ── */}
      {inactiveModalOpen && (
        <ModalBackdrop
          role="dialog"
          aria-modal="true"
          aria-labelledby="inactive-acct-title"
          // No onClick on backdrop — project rule: modals must not close on overlay click
        >
          <ModalCard>
            <ModalTitle id="inactive-acct-title">
              Posting to Inactive Account(s)
            </ModalTitle>
            <ModalBody>
              The following lines target inactive accounts. This is allowed for
              cleanup / correcting entries but is unusual. Do you want to continue?
            </ModalBody>
            <ModalWarningList>
              {inactiveWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ModalWarningList>
            <ModalFooter>
              <ModalCancelBtn
                type="button"
                onClick={handleInactiveCancel}
                disabled={createMutation.isPending}
              >
                Cancel
              </ModalCancelBtn>
              <ModalContinueBtn
                type="button"
                onClick={handleInactiveContinue}
                disabled={createMutation.isPending}
                aria-busy={createMutation.isPending}
              >
                {createMutation.isPending ? 'Posting…' : 'Continue'}
              </ModalContinueBtn>
            </ModalFooter>
          </ModalCard>
        </ModalBackdrop>
      )}
    </Container>
  );
}
