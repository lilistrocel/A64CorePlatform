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
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { FileText } from 'lucide-react';
import { useArInvoices } from '../../hooks/queries/useArInvoices';
import { useAuthStore } from '../../stores/auth.store';
import type { ARInvoiceStatus, ARInvoiceListItem } from '../../services/salesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = ARInvoiceStatus | 'ALL';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 220px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const DateInput = styled.input`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const FilterChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[50] || '#eff6ff' : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[700] || '#1d4ed8' : theme.colors.textSecondary};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  transition: all 150ms ease;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    background: ${({ theme }) => theme.colors.primary[50] || '#eff6ff'};
  }
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const GhostButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
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
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ThRight = styled(Th)`
  text-align: right;
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
`;

const TdRight = styled(Td)`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
  &:last-child td {
    border-bottom: none;
  }
`;

const StatusBadge = styled.span<{ $status: ARInvoiceStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status }) => {
    switch ($status) {
      case 'draft':
        return '#f3f4f6';
      case 'pending_approval':
        return '#fef3c7';
      case 'open':
        return '#ecfdf5';
      case 'partly_closed':
        return '#eff6ff';
      case 'closed':
        return '#ede9fe';
      case 'cancelled':
        return '#fef2f2';
      default:
        return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'draft':
        return '#6b7280';
      case 'pending_approval':
        return '#92400e';
      case 'open':
        return '#059669';
      case 'partly_closed':
        return '#2563eb';
      case 'closed':
        return '#5b21b6';
      case 'cancelled':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  }};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const EmptyIcon = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
  opacity: 0.4;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg || '#fef2f2'};
  color: ${({ theme }) => theme.colors.error || '#dc2626'};
  border: 1px solid #fecaca;
  border-radius: 8px;
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
      <Header>
        <Title>AR Invoices</Title>
        <PrimaryButton onClick={() => navigate('/sales/ar-invoices/new')}>
          + New AR Invoice
        </PrimaryButton>
      </Header>

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
              onClick={() => handleStatusFilter(value)}
              aria-pressed={statusFilter === value}
            >
              {label}
            </Chip>
          ))}
        </FilterChips>
      </FilterRow>

      {isLoading ? (
        <EmptyState>Loading AR Invoices…</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>
          <EmptyIcon>
            <FileText size={48} />
          </EmptyIcon>
          No AR Invoices found.{' '}
          {statusFilter !== 'ALL' || search
            ? 'Try adjusting your filters.'
            : 'Create one to get started.'}
        </EmptyState>
      ) : (
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
                <Td>
                  <strong>{inv.docNumber}</strong>
                  {inv.baseDocRef && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        color: '#6b7280',
                        marginTop: '2px',
                      }}
                    >
                      From {inv.baseDocRef.docNumber}
                    </span>
                  )}
                </Td>
                <Td>{formatDate(inv.docDate)}</Td>
                <Td>{inv.customerName}</Td>
                <Td>{formatDate(inv.dueDate)}</Td>
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
