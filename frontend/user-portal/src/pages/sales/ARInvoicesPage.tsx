/**
 * ARInvoicesPage — Wave 3 (T-200.0)
 *
 * Paginated list of AR Invoices with status filter chips, date range,
 * search by doc number / customer name / BP ref, and navigation to
 * detail / new-form pages.
 *
 * Route: /sales/ar-invoices
 *
 * Status vocabulary: Draft | Open | Partly Closed | Closed | Cancelled
 * (mirrors SAP B1 AR Invoice lifecycle).
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 *
 * Night Observatory reskin (T-901): status filter chips and the status
 * column both route through the single canonical helper in
 * components/sales/statusPhase.ts — see StatusBadge / Chip below.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css, useTheme } from 'styled-components';
import { FileText } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge, PageHeader } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { useArInvoices } from '../../hooks/queries/useArInvoices';
import { useAuthStore } from '../../stores/auth.store';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { ARInvoiceStatus, ARInvoiceListItem } from '../../services/salesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = ARInvoiceStatus | 'ALL';

function chipPhase(value: StatusFilter): PhaseKey | null {
  return value === 'ALL' ? null : salesStatusToPhase(value);
}

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  ${glassControl}
  flex: 1;
  min-width: 220px;
  padding: 10px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const DateInput = styled.input`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  color-scheme: dark;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FilterChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

// Status filter chips — coloured by phase at ~16% tint (spec §3: several
// chips can be visible at once, so gold is not used here). ALL has no
// phase — celeste emphasis instead.
const Chip = styled.button<{ $active: boolean; $phase: PhaseKey | null }>`
  ${({ $active, $phase }) => ($active && $phase ? phaseBadge($phase) : glassControl)}
  padding: 6px 14px;
  border-radius: 99px;
  cursor: pointer;
  transition: all 150ms ease;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;

  ${({ $active, $phase, theme }) =>
    !($active && $phase) &&
    css`
      color: ${$active ? theme.colors.celeste : theme.colors.muted};
    `}

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// Primary CTA — the ONE gold budget item on this page's own additions.
const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

const GhostButton = styled.button`
  ${glassControl}
  padding: 6px 14px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// A dense results table lives inside one glass panel — no nested glass.
const TableWrapper = styled.div`
  ${glassPanel}
  padding: 8px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 14px 16px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const ThRight = styled(Th)`
  text-align: right;
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const TdMono = styled(Td)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const TdRight = styled(Td)`
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover td {
    background: rgba(180, 200, 220, 0.05);
  }
  &:last-child td {
    border-bottom: none;
  }
`;

const StatusBadge = styled.span<{ $status: ARInvoiceStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
`;

const EmptyIcon = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
  color: ${({ theme }) => theme.colors.muted};
`;

const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 20px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px;
`;

const EmptyText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatAmount(value: number, currency = 'AED'): string {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ` ${currency}`;
}

function statusLabel(status: ARInvoiceStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending_approval':
      return 'Pending Approval';
    case 'open':
      return 'Open';
    case 'partly_closed':
      return 'Partly Closed';
    case 'closed':
      return 'Closed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

// ─── Status filter chip definitions ──────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'draft' },
  { label: 'Open', value: 'open' },
  { label: 'Partly Closed', value: 'partly_closed' },
  { label: 'Closed', value: 'closed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const PAGE_SIZE = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export function ARInvoicesPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const queryParams = useMemo(
    () => ({
      organizationId: orgId,
      status: statusFilter !== 'ALL' ? statusFilter : null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      page,
      size: PAGE_SIZE,
    }),
    [orgId, statusFilter, dateFrom, dateTo, page],
  );

  const { data, isLoading, isError, error } = useArInvoices(queryParams);

  const meta = data?.meta;

  // Client-side search filter (doc number, customer name, bp ref no)
  const filtered = useMemo(() => {
    const invoices = data?.data ?? [];
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(
      (inv: ARInvoiceListItem) =>
        inv.docNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleRowClick = (docEntry: string) => {
    navigate(`/sales/ar-invoices/${docEntry}`);
  };

  const handleStatusFilter = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  return (
    <Container>
      <PageHeader
        breadcrumb="SALES · LIVE"
        title="AR Invoices"
        stats={[{ value: total, label: 'Total Invoices' }]}
      />

      <ActionRow>
        <PrimaryButton onClick={() => navigate('/sales/ar-invoices/new')}>
          + New AR Invoice
        </PrimaryButton>
      </ActionRow>

      {isError && (
        <ErrorBanner>
          Failed to load AR Invoices.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
        </ErrorBanner>
      )}

      <FilterRow>
        <SearchInput
          type="text"
          placeholder="Search by doc number or customer name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search AR Invoices"
        />
        <DateInput
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          aria-label="Date from"
          title="Date from"
        />
        <DateInput
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          aria-label="Date to"
          title="Date to"
        />
      </FilterRow>

      <FilterRow>
        <FilterChips role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map(({ label, value }) => (
            <Chip
              key={value}
              $active={statusFilter === value}
              $phase={chipPhase(value)}
              onClick={() => handleStatusFilter(value)}
              aria-pressed={statusFilter === value}
            >
              {label}
            </Chip>
          ))}
        </FilterChips>
      </FilterRow>

      {isLoading ? (
        <EmptyState>
          <EmptyText>Loading AR Invoices…</EmptyText>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>
          <EmptyIcon>
            <FileText size={40} strokeWidth={1.6} />
          </EmptyIcon>
          <EmptyHeadline>No AR Invoices found</EmptyHeadline>
          <EmptyText>
            {statusFilter !== 'ALL' || search
              ? 'Try adjusting your filters.'
              : 'Create one to get started.'}
          </EmptyText>
        </EmptyState>
      ) : (
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>Doc Number</Th>
                <Th>Doc Date</Th>
                <Th>Customer</Th>
                <Th>Due Date</Th>
                <ThRight>Total Amount</ThRight>
                <ThRight>Open Amount</ThRight>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv: ARInvoiceListItem) => (
                <Tr
                  key={inv.docEntry}
                  onClick={() => handleRowClick(inv.docEntry)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleRowClick(inv.docEntry);
                    }
                  }}
                  aria-label={`AR Invoice ${inv.docNumber}`}
                >
                  <TdMono>
                    <strong>{inv.docNumber}</strong>
                    {inv.baseDocRef && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          color: theme.colors.muted,
                          marginTop: '2px',
                        }}
                      >
                        From {inv.baseDocRef.docNumber}
                      </span>
                    )}
                  </TdMono>
                  <TdMono>{formatDate(inv.docDate)}</TdMono>
                  <Td>{inv.customerName}</Td>
                  <TdMono>{formatDate(inv.dueDate)}</TdMono>
                  <TdRight>{formatAmount(inv.totals.gross)}</TdRight>
                  <TdRight>{formatAmount(inv.totals.openAmount)}</TdRight>
                  <Td>
                    <StatusBadge $status={inv.status}>
                      {statusLabel(inv.status)}
                    </StatusBadge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>
      )}

      {!isLoading && total > 0 && (
        <Pagination>
          <span>
            {total} invoice{total !== 1 ? 's' : ''} · Page {page} of {totalPages}
          </span>
          <PaginationButtons>
            <GhostButton
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              Previous
            </GhostButton>
            <GhostButton
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              Next
            </GhostButton>
          </PaginationButtons>
        </Pagination>
      )}
    </Container>
  );
}

export default ARInvoicesPage;
