/**
 * ArCreditNotesPage — Wave 3 (T-200.8)
 *
 * Paginated list of AR Credit Notes with status filter chips, date range,
 * source-type chip (All / From RTN / From Invoice / Direct), and search.
 *
 * Source type is derived client-side:
 *   - From RTN:     baseReturnDocRef !== null
 *   - From Invoice: baseReturnDocRef === null (direct reversal / discount / correction)
 *
 * Table columns: DocNumber, DocDate, CustomerName, Source, Total Gross, Status badge.
 *
 * "+ New Credit Note" navigates to /sales/ar-credit-notes/new (blank form — rare).
 *
 * NO Audit History button — sales audit endpoint pending T-200.x.
 * Route: /sales/ar-credit-notes
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useArCreditNotes } from '../../hooks/queries/useArCreditNotes';
import { useAuthStore } from '../../stores/auth.store';
import type { ARCreditNoteStatus, ARCreditNoteListItem } from '../../services/salesApi';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1280px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
`;

const Title = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
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
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
`;

const FilterChip = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[50] : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[700] : theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
`;

const SearchInput = styled.input`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  min-width: 220px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[400]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[100]};
  }
`;

const DateInput = styled.input`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[400]};
  }
`;

const TableCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const ThRight = styled(Th)`
  text-align: right;
`;

const Tr = styled.tr`
  cursor: pointer;
  &:hover td {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
  background: ${({ theme }) => theme.colors.surface};
  transition: background 100ms ease;
`;

const TdRight = styled(Td)`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const StatusBadge = styled.span<{ $status: ARCreditNoteStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#f3f4f6';
      case 'open': return '#ecfdf5';
      case 'partly_closed': return '#eff6ff';
      case 'closed': return '#ede9fe';
      case 'cancelled': return '#fef2f2';
      default: return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#6b7280';
      case 'open': return '#059669';
      case 'partly_closed': return '#2563eb';
      case 'closed': return '#5b21b6';
      case 'cancelled': return '#dc2626';
      default: return '#6b7280';
    }
  }};
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 6px 12px;
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  border-radius: 6px;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? 'white' : theme.colors.textPrimary};
  font-size: 13px;
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const LoadingState = styled(EmptyState)``;

const ErrorState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: ${({ theme }) => theme.colors.error || '#dc2626'};
  font-size: 14px;
`;

const FilterLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-right: 4px;
`;

// ─── Types ────────────────────────────────────────────────────────────────────

type SourceTypeFilter = 'all' | 'from_rtn' | 'from_invoice';

const STATUS_OPTIONS: Array<{ value: ARCreditNoteStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'partly_closed', label: 'Partly Closed' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SOURCE_OPTIONS: Array<{ value: SourceTypeFilter; label: string }> = [
  { value: 'all', label: 'All Sources' },
  { value: 'from_rtn', label: 'From RTN' },
  { value: 'from_invoice', label: 'From Invoice' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-AE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getSourceLabel(item: ARCreditNoteListItem): string {
  if (item.baseReturnDocRef) {
    return `via ${item.baseReturnDocRef.docNumber}`;
  }
  return 'Direct';
}

function labelStatus(s: ARCreditNoteStatus): string {
  switch (s) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'partly_closed': return 'Partly Closed';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return s;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ArCreditNotesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  const [statusFilter, setStatusFilter] = useState<ARCreditNoteStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceTypeFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const queryParams = {
    organizationId: orgId,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    size: 20,
  };

  const { data, isLoading, isError, error } = useArCreditNotes(queryParams);

  // Client-side filter by source type and search term
  const filtered = useMemo(() => {
    if (!data?.data) return [];
    let items = data.data;

    // Source type filter (client-side from baseReturnDocRef presence)
    if (sourceFilter === 'from_rtn') {
      items = items.filter(i => i.baseReturnDocRef !== null);
    } else if (sourceFilter === 'from_invoice') {
      items = items.filter(i => i.baseReturnDocRef === null);
    }

    // Search filter (docNumber, customerName)
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        i =>
          i.docNumber.toLowerCase().includes(q) ||
          i.customerName.toLowerCase().includes(q),
      );
    }

    return items;
  }, [data, sourceFilter, search]);

  const totalPages = data?.meta.totalPages ?? 1;

  return (
    <Container>
      <PageHeader>
        <Title>AR Credit Notes</Title>
        <PrimaryButton
          onClick={() => navigate('/sales/ar-credit-notes/new')}
          aria-label="Create a new AR Credit Note"
        >
          + New Credit Note
        </PrimaryButton>
      </PageHeader>

      {/* Status filter chips */}
      <FilterRow>
        <FilterLabel>Status:</FilterLabel>
        {STATUS_OPTIONS.map(opt => (
          <FilterChip
            key={opt.value}
            $active={statusFilter === opt.value}
            onClick={() => {
              setStatusFilter(opt.value as ARCreditNoteStatus | 'all');
              setPage(1);
            }}
          >
            {opt.label}
          </FilterChip>
        ))}
      </FilterRow>

      {/* Source type filter + search + date range */}
      <FilterRow>
        <FilterLabel>Source:</FilterLabel>
        {SOURCE_OPTIONS.map(opt => (
          <FilterChip
            key={opt.value}
            $active={sourceFilter === opt.value}
            onClick={() => {
              setSourceFilter(opt.value);
              setPage(1);
            }}
          >
            {opt.label}
          </FilterChip>
        ))}
        <div style={{ flex: 1 }} />
        <SearchInput
          type="search"
          placeholder="Search doc number or customer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search AR Credit Notes"
        />
        <DateInput
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          aria-label="Date from"
          title="Filter from date"
        />
        <DateInput
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          aria-label="Date to"
          title="Filter to date"
        />
      </FilterRow>

      {/* Table */}
      <TableCard>
        {isLoading && (
          <LoadingState role="status" aria-label="Loading AR Credit Notes">
            Loading AR Credit Notes…
          </LoadingState>
        )}
        {isError && (
          <ErrorState role="alert">
            Failed to load AR Credit Notes.{' '}
            {error instanceof Error ? error.message : ''}
          </ErrorState>
        )}
        {!isLoading && !isError && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Doc Number</Th>
                  <Th>Date</Th>
                  <Th>Customer</Th>
                  <Th>Source</Th>
                  <ThRight>Gross Total</ThRight>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState>No AR Credit Notes found.</EmptyState>
                    </td>
                  </tr>
                ) : (
                  filtered.map(item => (
                    <Tr
                      key={item.docEntry}
                      onClick={() => navigate(`/sales/ar-credit-notes/${item.docEntry}`)}
                      aria-label={`Open AR Credit Note ${item.docNumber}`}
                    >
                      <Td style={{ fontWeight: 600 }}>{item.docNumber}</Td>
                      <Td>{formatDate(item.docDate)}</Td>
                      <Td>{item.customerName}</Td>
                      <Td style={{ color: item.baseReturnDocRef ? '#2563eb' : '#6b7280' }}>
                        {getSourceLabel(item)}
                      </Td>
                      <TdRight>
                        {formatAmount(item.totals.gross)}{' '}
                        <span style={{ color: '#9ca3af', fontSize: 11 }}>AED</span>
                      </TdRight>
                      <Td>
                        <StatusBadge $status={item.status}>
                          {labelStatus(item.status)}
                        </StatusBadge>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>

            {totalPages > 1 && (
              <Pagination>
                <span>
                  Page {page} of {totalPages} ({data?.meta.total ?? 0} total)
                </span>
                <PaginationButtons>
                  <PageButton
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Previous page"
                  >
                    Previous
                  </PageButton>
                  <PageButton
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                  >
                    Next
                  </PageButton>
                </PaginationButtons>
              </Pagination>
            )}
          </>
        )}
      </TableCard>
    </Container>
  );
}

export default ArCreditNotesPage;
