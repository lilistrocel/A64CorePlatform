/**
 * JournalEntriesPage
 *
 * List of Journal Entries with inline row-expansion to show lines.
 * JEs are produced by the finance consumer when operational docs are posted.
 * finance_admin / admin / super_admin can reverse a posted JE.
 *
 * Role gating: accountant, finance_admin, auditor, admin, super_admin.
 * Route: /finance/journal-entries
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useJournalEntries, useJournalEntry, useReverseJournalEntry } from '../../hooks/queries/useJournalEntries';
import { useFinanceAccounts } from '../../hooks/queries/useFinanceAccounts';
import { useAuthStore } from '../../stores/auth.store';
import { showSuccessToast } from '../../stores/toast.store';
import type { JournalEntry } from '../../services/journalEntriesService';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 24px;
`;

const ToolbarRow = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &::placeholder { color: ${({ theme }) => theme.colors.text.tertiary}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const FilterSelect = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const DateInput = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const DateLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
  display: flex;
  align-items: center;
`;

const RefreshButton = styled.button`
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: ${({ theme }) => theme.colors.surface.sunken}; }
`;

const GhostButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 12px;
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Th = styled.th`
  padding: 14px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  vertical-align: top;
`;

const JeRow = styled.tr<{ $expanded: boolean }>`
  cursor: pointer;
  transition: background 100ms ease;
  background: ${({ $expanded, theme }) =>
    $expanded ? theme.colors.surface.canvas : 'transparent'};
  &:hover { background: ${({ theme }) => theme.colors.surface.canvas}; }
`;

/** The inline expanded detail row */
const ExpandedRow = styled.tr`
  background: ${({ theme }) => theme.colors.surface.canvas};
`;

const ExpandedCell = styled.td`
  padding: 0;
  border-bottom: 2px solid ${({ theme }) => theme.colors.accent.sageSoft || '#bfdbfe'};
`;

const LinesContainer = styled.div`
  padding: 16px 20px;
`;

const LinesTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 10px;
`;

const LinesTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const LinesTh = styled.th`
  padding: 8px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.raised};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const LinesTd = styled.td`
  padding: 8px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const LinesTotalRow = styled.tr`
  background: ${({ theme }) => theme.colors.surface.raised};
  font-weight: 700;
`;

const ExpandIcon = styled.span<{ $expanded: boolean }>`
  display: inline-block;
  margin-right: 8px;
  transform: ${({ $expanded }) => ($expanded ? 'rotate(90deg)' : 'rotate(0)')};
  transition: transform 150ms ease;
  color: ${({ theme }) => theme.colors.accent.sage};
  font-size: 12px;
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $status }) =>
    $status === 'posted' ? '#d1fae5' :
    $status === 'void'   ? '#fee2e2' :
    '#f3f4f6'};
  color: ${({ $status }) =>
    $status === 'posted' ? '#065f46' :
    $status === 'void'   ? '#991b1b' :
    '#6b7280'};
`;

const DescriptionCell = styled.span`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Tooltip = styled.span`
  position: relative;
  cursor: default;
  &:hover > span {
    display: block;
  }
  > span {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1050;
    background: #1f2937;
    color: white;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    max-width: 320px;
    white-space: normal;
    pointer-events: none;
    line-height: 1.5;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 80px 32px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const EmptyTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const EmptyHint = styled.div`
  font-size: 14px;
  max-width: 440px;
  margin: 0 auto;
  line-height: 1.6;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const PageButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const LoadingOverlay = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
`;

// ─── Voided row visual treatment ─────────────────────────────────────────────

const VoidedJeRow = styled.tr<{ $expanded: boolean }>`
  cursor: pointer;
  opacity: 0.55;
  transition: background 100ms ease, opacity 100ms ease;
  background: ${({ $expanded, theme }) =>
    $expanded ? theme.colors.surface.canvas : 'transparent'};
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
    opacity: 0.75;
  }
`;

const VoidedText = styled.span`
  text-decoration: line-through;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const ReversalBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
  background: #f0f4ff;
  color: #3b4fd9;
  border: 1px solid #c7d2fe;
  margin-left: 6px;
  vertical-align: middle;
`;

const SourceDocLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.accent.sageDeep || theme.colors.accent.sage};
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  &:hover { opacity: 0.75; }
`;

// ─── Reverse Entry button (row-level action) ──────────────────────────────────

const ReverseButton = styled.button`
  padding: 4px 10px;
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover {
    background: #fee2e2;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

// ─── Reversal confirm modal ───────────────────────────────────────────────────

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ModalCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 14px;
  padding: 28px 32px;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.18);
  position: relative;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 6px;
`;

const ModalSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 20px;
  line-height: 1.55;
`;

const ModalLabel = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: 6px;
`;

const ModalTextarea = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  resize: vertical;
  min-height: 100px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const ModalCharCount = styled.div<{ $warn: boolean }>`
  font-size: 11px;
  text-align: right;
  margin-top: 4px;
  color: ${({ $warn }) => ($warn ? '#ef4444' : '#9ca3af')};
`;

const ModalErrorText = styled.div`
  font-size: 12px;
  color: #ef4444;
  margin-top: 6px;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
`;

const ModalCancelButton = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.sunken}; }
`;

const ModalConfirmButton = styled.button`
  padding: 9px 20px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: #b91c1c; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// ─── Role gate for reverse action ─────────────────────────────────────────────

const REVERSE_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

// ─── Human-friendly source event type labels ──────────────────────────────────

const SOURCE_EVENT_LABELS: Record<string, string> = {
  purchase_received:   'Goods Receipt',
  ap_invoice_posted:   'AP Invoice',
  vendor_payment:      'Vendor Payment',
  je_reversal:         'JE Reversal',
};

function formatSourceType(raw: string): string {
  return SOURCE_EVENT_LABELS[raw] ?? raw.replace(/_/g, ' ');
}

/** Format the "Source" column: "Goods Receipt — GR-2026-0001" */
function formatSource(je: JournalEntry): string {
  const label = formatSourceType(je.sourceEventType);
  if (je.sourceDocNumber) {
    return `${label} — ${je.sourceDocNumber}`;
  }
  return label;
}

// ─── Source event type filter options ─────────────────────────────────────────

const SOURCE_TYPES = [
  { label: 'All Sources', value: '' },
  { label: 'Goods Receipt', value: 'purchase_received' },
  { label: 'AP Invoice', value: 'ap_invoice_posted' },
  { label: 'Vendor Payment', value: 'vendor_payment' },
  { label: 'JE Reversal', value: 'je_reversal' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Expanded lines sub-component ─────────────────────────────────────────────

interface ExpandedLinesProps {
  jeId: string;
  organizationId: string;
  accountMap: Map<string, { number: string; name: string }>;
}

function ExpandedLines({ jeId, organizationId, accountMap }: ExpandedLinesProps) {
  const { data: detail, isLoading, isError } = useJournalEntry(jeId, organizationId);

  if (isLoading) {
    return (
      <LinesContainer>
        <div style={{ fontSize: 13, color: '#6b7280' }}>Loading lines...</div>
      </LinesContainer>
    );
  }

  if (isError || !detail?.lines) {
    return (
      <LinesContainer>
        <div style={{ fontSize: 13, color: '#ef4444' }}>Failed to load journal entry lines.</div>
      </LinesContainer>
    );
  }

  const lines = detail.lines;

  // Compute DR / CR totals from lines
  const totalDr = lines.reduce((s, l) => s + (parseFloat(l.debit ?? '0') || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (parseFloat(l.credit ?? '0') || 0), 0);

  return (
    <LinesContainer>
      <LinesTitle>Journal Entry Lines</LinesTitle>
      <LinesTable>
        <thead>
          <tr>
            <LinesTh>#</LinesTh>
            <LinesTh>Account</LinesTh>
            <LinesTh style={{ textAlign: 'right' }}>DR</LinesTh>
            <LinesTh style={{ textAlign: 'right' }}>CR</LinesTh>
            <LinesTh>Description</LinesTh>
            <LinesTh>Cost Centre</LinesTh>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const account = accountMap.get(line.accountId);
            const accountLabel = account
              ? `${account.number} — ${account.name}`
              : 'Loading...';
            return (
              <tr key={line.jeLineId}>
                <LinesTd>{line.lineNumber}</LinesTd>
                <LinesTd style={{ fontWeight: 500 }}>{accountLabel}</LinesTd>
                <LinesTd style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {line.debit ? formatCurrency(line.debit) : ''}
                </LinesTd>
                <LinesTd style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {line.credit ? formatCurrency(line.credit) : ''}
                </LinesTd>
                <LinesTd style={{ color: '#6b7280' }}>{line.description ?? '—'}</LinesTd>
                <LinesTd style={{ color: '#6b7280' }}>{line.costCenterId ?? '—'}</LinesTd>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <LinesTotalRow>
            <LinesTd colSpan={2} style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
              Totals
            </LinesTd>
            <LinesTd style={{ textAlign: 'right', fontFamily: 'monospace' }}>
              {formatCurrency(totalDr)}
            </LinesTd>
            <LinesTd style={{ textAlign: 'right', fontFamily: 'monospace' }}>
              {formatCurrency(totalCr)}
            </LinesTd>
            <LinesTd colSpan={2} />
          </LinesTotalRow>
        </tfoot>
      </LinesTable>
    </LinesContainer>
  );
}

// ─── Reversal confirm modal ───────────────────────────────────────────────────

interface ReversalModalState {
  jeId: string;
  jeNumber: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function JournalEntriesPage() {
  const { user } = useAuthStore();
  // Reason: showSuccessToast is a module-level helper, imported directly above.
  // The previous `const { showSuccessToast } = useToastStore()` returned
  // undefined and crashed the post-reverse handler — leaving the modal open.
  const [searchParams] = useSearchParams();
  const organizationId = user?.organizationId ?? '';

  const canReverse = REVERSE_ROLES.has(user?.role ?? '');

  // Filter state — initialise search from URL param (cross-page link from GR detail)
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [sourceEventType, setSourceEventType] = useState('');
  const [statusFilter, setStatusFilter] = useState<'posted' | 'void' | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Expanded row tracking (one row at a time)
  const [expandedJeId, setExpandedJeId] = useState<string | null>(null);

  // ── Reversal modal state ───────────────────────────────────────────────────
  const [reversalModal, setReversalModal] = useState<ReversalModalState | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);
  const reversalTextareaRef = useRef<HTMLTextAreaElement>(null);

  const reverseJEMutation = useReverseJournalEntry();

  // Focus the textarea when the modal opens
  useEffect(() => {
    if (reversalModal) {
      setReversalReason('');
      setReversalError(null);
      // Defer focus slightly so the modal DOM is mounted
      setTimeout(() => reversalTextareaRef.current?.focus(), 50);
    }
  }, [reversalModal]);

  const handleOpenReversalModal = (je: JournalEntry, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent row toggle-expand
    setReversalModal({ jeId: je.jeId, jeNumber: je.jeNumber });
  };

  const handleCloseReversalModal = () => {
    if (reverseJEMutation.isPending) return;
    setReversalModal(null);
    setReversalReason('');
    setReversalError(null);
  };

  const handleConfirmReversal = async () => {
    if (!reversalModal) return;
    const trimmed = reversalReason.trim();
    if (trimmed.length < 5) {
      setReversalError('Reason must be at least 5 characters.');
      return;
    }
    if (trimmed.length > 500) {
      setReversalError('Reason must be 500 characters or fewer.');
      return;
    }
    setReversalError(null);
    try {
      await reverseJEMutation.mutateAsync({
        jeId: reversalModal.jeId,
        orgId: organizationId,
        reason: trimmed,
      });
      showSuccessToast(`${reversalModal.jeNumber} reversed successfully.`);
      setReversalModal(null);
      setReversalReason('');
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { detail?: unknown }; status?: number };
        message?: string;
      };
      const detail = axiosErr?.response?.data?.detail;
      if (typeof detail === 'string') {
        setReversalError(detail);
      } else {
        setReversalError(
          (axiosErr?.message as string | undefined) ?? 'Reversal failed. Please try again.'
        );
      }
    }
  };

  const jeListParams = {
    organizationId,
    search: search || undefined,
    sourceEventType: sourceEventType || undefined,
    status: (statusFilter || undefined) as 'posted' | 'void' | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    size: 25,
  };

  const { data, isLoading, isError, refetch } = useJournalEntries(jeListParams);

  // Load all GL accounts for account name lookup
  const { data: accountsData } = useFinanceAccounts(organizationId);

  // Build accountId → { number, name } map for O(1) lookups in line rows
  const accountMap = useMemo(() => {
    const m = new Map<string, { number: string; name: string }>();
    for (const acc of (accountsData?.items ?? [])) {
      m.set(acc.accountId, { number: acc.accountNumber, name: acc.accountName });
    }
    return m;
  }, [accountsData]);

  const items = data?.items ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  const handleRefresh = () => {
    refetch();
  };

  const toggleExpand = (jeId: string) => {
    setExpandedJeId((prev) => (prev === jeId ? null : jeId));
  };

  return (
    <Container>
      <Title>Journal Entries</Title>

      <ToolbarRow>
        <SearchInput
          placeholder="Search by JE number or source doc..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search journal entries"
        />
        <FilterSelect
          value={sourceEventType}
          onChange={(e) => { setSourceEventType(e.target.value); setPage(1); }}
          aria-label="Filter by source event type"
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as 'posted' | 'void' | ''); setPage(1); }}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="posted">Posted</option>
          <option value="void">Void</option>
        </FilterSelect>
        <DateLabel>From</DateLabel>
        <DateInput
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          aria-label="Filter from date"
        />
        <DateLabel>To</DateLabel>
        <DateInput
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          aria-label="Filter to date"
        />
        <RefreshButton onClick={handleRefresh} aria-label="Refresh journal entries">
          Refresh
        </RefreshButton>
      </ToolbarRow>

      {isLoading && <LoadingOverlay>Loading journal entries...</LoadingOverlay>}
      {isError && (
        <EmptyState>
          <EmptyTitle>Failed to load journal entries</EmptyTitle>
          <EmptyHint>Please try refreshing. If the problem persists, check the finance service is running.</EmptyHint>
        </EmptyState>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState>
          <EmptyTitle>No journal entries yet</EmptyTitle>
          <EmptyHint>
            Entries appear here automatically when documents are posted on the operation side.
            Post a Goods Receipt to see the first journal entry.
          </EmptyHint>
        </EmptyState>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>JE Number</Th>
                <Th>JE Date</Th>
                <Th>Source</Th>
                <Th>Description</Th>
                <Th style={{ textAlign: 'right' }}>DR = CR (AED)</Th>
                <Th>Status</Th>
                <Th>Posted At</Th>
                {canReverse && <Th>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {items.map((je) => {
                const isExpanded = expandedJeId === je.jeId;
                const isVoided = je.status === 'void';
                const isReversal = je.sourceEventType === 'je_reversal';
                const isReversed = Boolean(je.reversedByJeNumber);
                const colSpan = canReverse ? 8 : 7;

                // Voided OR reversed JEs use a muted row to signal "no live
                // accounting impact"; both should look the same to the reader.
                const RowComponent = isVoided || isReversed ? VoidedJeRow : JeRow;

                return (
                  <>
                    <RowComponent
                      key={je.jeId}
                      $expanded={isExpanded}
                      onClick={() => toggleExpand(je.jeId)}
                      aria-expanded={isExpanded}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpand(je.jeId);
                        }
                      }}
                    >
                      {/* JE Number column — shows Reversal badge if applicable */}
                      <Td>
                        <ExpandIcon $expanded={isExpanded} aria-hidden="true">▶</ExpandIcon>
                        {isVoided ? (
                          <VoidedText>
                            <code style={{ fontSize: 13, fontWeight: 600 }}>{je.jeNumber}</code>
                          </VoidedText>
                        ) : (
                          <code style={{ fontSize: 13, fontWeight: 600 }}>{je.jeNumber}</code>
                        )}
                        {isReversal && (
                          <ReversalBadge aria-label="Reversal journal entry">
                            Reversal
                          </ReversalBadge>
                        )}
                      </Td>
                      <Td>{formatDate(je.jeDate)}</Td>
                      {/* Source column — for reversals, show "Reversal of JE-..." link */}
                      <Td style={{ fontSize: 13 }}>
                        {isReversal && je.sourceDocNumber ? (
                          <span>
                            <SourceDocLink
                              onClick={(e) => {
                                e.stopPropagation();
                                // Navigate by searching for the original JE number
                                window.history.pushState(
                                  {},
                                  '',
                                  `/finance/journal-entries?search=${encodeURIComponent(je.sourceDocNumber!)}`
                                );
                                window.location.reload();
                              }}
                              title={`View original entry ${je.sourceDocNumber}`}
                            >
                              Reversal of {je.sourceDocNumber}
                            </SourceDocLink>
                          </span>
                        ) : (
                          formatSource(je)
                        )}
                      </Td>
                      <Td>
                        {je.description ? (
                          <Tooltip>
                            <DescriptionCell>{je.description}</DescriptionCell>
                            <span>{je.description}</span>
                          </Tooltip>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 13 }}>—</span>
                        )}
                      </Td>
                      <Td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                        {formatCurrency(je.totalDebit)}
                      </Td>
                      <Td>
                        {isVoided ? (
                          <StatusBadge $status="void">Voided</StatusBadge>
                        ) : isReversed ? (
                          <StatusBadge
                            $status="void"
                            title={`Reversed by ${je.reversedByJeNumber}`}
                          >
                            Reversed
                          </StatusBadge>
                        ) : (
                          <StatusBadge $status={je.status}>
                            {je.status.charAt(0).toUpperCase() + je.status.slice(1)}
                          </StatusBadge>
                        )}
                      </Td>
                      <Td style={{ fontSize: 12, color: '#6b7280' }}>
                        {formatDateTime(je.postedAt)}
                      </Td>
                      {/* Actions column — Reverse Entry for posted, not-yet-reversed JEs */}
                      {canReverse && (
                        <Td>
                          {je.status === 'posted' && !isReversed && (
                            <ReverseButton
                              type="button"
                              onClick={(e) => handleOpenReversalModal(je, e)}
                              aria-label={`Reverse journal entry ${je.jeNumber}`}
                              disabled={reverseJEMutation.isPending}
                            >
                              Reverse Entry
                            </ReverseButton>
                          )}
                        </Td>
                      )}
                    </RowComponent>

                    {isExpanded && (
                      <ExpandedRow key={`${je.jeId}-expanded`}>
                        <ExpandedCell colSpan={colSpan}>
                          <ExpandedLines
                            jeId={je.jeId}
                            organizationId={organizationId}
                            accountMap={accountMap}
                          />
                        </ExpandedCell>
                      </ExpandedRow>
                    )}
                  </>
                );
              })}
            </tbody>
          </Table>

          <Pagination>
            <span>
              Showing {items.length} of {totalItems} journal entries
            </span>
            <PageButtons>
              <GhostButton
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </GhostButton>
              <span style={{ padding: '6px 12px', fontSize: 13 }}>
                Page {page} / {totalPages}
              </span>
              <GhostButton
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next
              </GhostButton>
            </PageButtons>
          </Pagination>
        </>
      )}
      {/* ── Reversal confirm modal ── */}
      {reversalModal && (
        <ModalBackdrop
          role="dialog"
          aria-modal="true"
          aria-labelledby="reversal-modal-title"
        >
          <ModalCard>
            <ModalTitle id="reversal-modal-title">Reverse Journal Entry</ModalTitle>
            <ModalSubtitle>
              You are about to reverse <strong>{reversalModal.jeNumber}</strong>. A new offsetting
              reversal JE will be posted; both entries remain on the books and net to zero. This
              action cannot be undone.
            </ModalSubtitle>

            <ModalLabel htmlFor="reversal-reason">
              Reason for reversal <span aria-hidden="true">*</span>
            </ModalLabel>
            <ModalTextarea
              id="reversal-reason"
              ref={reversalTextareaRef}
              value={reversalReason}
              onChange={(e) => {
                setReversalReason(e.target.value);
                setReversalError(null);
              }}
              placeholder="Describe why this journal entry is being reversed (5–500 characters)…"
              aria-describedby={reversalError ? 'reversal-error' : undefined}
              maxLength={500}
            />
            <ModalCharCount $warn={reversalReason.length > 480}>
              {reversalReason.length} / 500
            </ModalCharCount>
            {reversalError && (
              <ModalErrorText id="reversal-error" role="alert">
                {reversalError}
              </ModalErrorText>
            )}

            <ModalFooter>
              <ModalCancelButton
                type="button"
                onClick={handleCloseReversalModal}
                disabled={reverseJEMutation.isPending}
              >
                Cancel
              </ModalCancelButton>
              <ModalConfirmButton
                type="button"
                onClick={handleConfirmReversal}
                disabled={
                  reverseJEMutation.isPending ||
                  reversalReason.trim().length < 5
                }
                aria-busy={reverseJEMutation.isPending}
              >
                {reverseJEMutation.isPending ? 'Reversing…' : 'Confirm Reversal'}
              </ModalConfirmButton>
            </ModalFooter>
          </ModalCard>
        </ModalBackdrop>
      )}
    </Container>
  );
}
