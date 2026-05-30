/**
 * CustomerReceiptsPage — Wave 3 (T-200.1)
 *
 * Paginated list of Customer Receipts (IPAY) with status filter chips,
 * date range, search by doc number / customer name / reference, and
 * navigation to detail / new-form pages.
 *
 * Route: /sales/customer-receipts
 *
 * Status vocabulary: Draft | Open | Closed | Cancelled
 * (mirrors Customer Receipt lifecycle — no pending_approval on IPAY).
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * Rule 3: all status comparisons use lowercase string literals.
 * Rule 4: NO Audit History button.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Receipt } from 'lucide-react';
import { useCustomerReceipts } from '../../hooks/queries/useCustomerReceipts';
import { useAuthStore } from '../../stores/auth.store';
import type { CustomerReceiptStatus, CustomerReceiptListItem } from '../../services/salesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = CustomerReceiptStatus | 'ALL';

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

const StatusBadge = styled.span<{ $status: CustomerReceiptStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status }) => {
    // Rule 3: lowercase status literals only
    switch ($status) {
      case 'draft':
        return '#f3f4f6';
      case 'open':
        return '#ecfdf5';
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
      case 'open':
        return '#059669';
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
  return (
    new Intl.NumberFormat('en-AE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + ` ${currency}`
  );
}

function statusLabel(status: CustomerReceiptStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'open':
      return 'Open';
    case 'closed':
      return 'Closed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'cheque':
      return 'Cheque';
    case 'cash':
      return 'Cash';
    case 'card':
      return 'Card';
    default:
      return method;
  }
}

// ─── Status filter chip definitions ──────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'draft' },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const PAGE_SIZE = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerReceiptsPage() {
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

  const { data, isLoading, isError, error } = useCustomerReceipts(queryParams);

  const meta = data?.meta;

  // Client-side search filter (doc number, customer name)
  const filtered = useMemo(() => {
    const receipts = data?.data ?? [];
    if (!search.trim()) return receipts;
    const q = search.toLowerCase();
    return receipts.filter(
      (r: CustomerReceiptListItem) =>
        r.docNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleRowClick = (docEntry: string) => {
    navigate(`/sales/customer-receipts/${docEntry}`);
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
        <Title>Customer Receipts</Title>
        <PrimaryButton onClick={() => navigate('/sales/customer-receipts/new')}>
          + New Customer Receipt
        </PrimaryButton>
      </Header>

      {isError && (
        <ErrorBanner>
          Failed to load Customer Receipts.{' '}
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
          aria-label="Search Customer Receipts"
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
        <EmptyState>Loading Customer Receipts…</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>
          <EmptyIcon>
            <Receipt size={48} />
          </EmptyIcon>
          No Customer Receipts found.{' '}
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
              <Th>Payment Method</Th>
              <ThRight>Amount Received</ThRight>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((receipt: CustomerReceiptListItem) => (
              <Tr
                key={receipt.docEntry}
                onClick={() => handleRowClick(receipt.docEntry)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleRowClick(receipt.docEntry);
                  }
                }}
                aria-label={`Customer Receipt ${receipt.docNumber}`}
              >
                <Td>
                  <strong>{receipt.docNumber}</strong>
                </Td>
                <Td>{formatDate(receipt.docDate)}</Td>
                <Td>{receipt.customerName}</Td>
                <Td>{paymentMethodLabel(receipt.paymentMethod)}</Td>
                <TdRight>{formatAmount(Number(receipt.amountReceived))}</TdRight>
                <Td>
                  <StatusBadge $status={receipt.status}>
                    {statusLabel(receipt.status)}
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
            {total} receipt{total !== 1 ? 's' : ''} · Page {page} of {totalPages}
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

export default CustomerReceiptsPage;
