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
 *
 * Night Observatory reskin (T-901): status filter chips and the status
 * column both route through the single canonical helper in
 * components/sales/statusPhase.ts — see StatusBadge / StatusChip below.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css, useTheme } from 'styled-components';
import { glassPanel, glassControl, monoLabel, phaseBadge, PageHeader as SharedPageHeader } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { useArCreditNotes } from '../../hooks/queries/useArCreditNotes';
import { useAuthStore } from '../../stores/auth.store';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { ARCreditNoteStatus, ARCreditNoteListItem } from '../../services/salesApi';

function chipPhase(value: ARCreditNoteStatus | 'all'): PhaseKey | null {
  return value === 'all' ? null : salesStatusToPhase(value);
}

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1280px;
  margin: 0 auto;
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
`;

// Status chips coloured by phase at ~16% tint (several are visible at once,
// so gold is never used here — spec §3). Source-type chips have no phase
// (they are categorical, not status) and use celeste emphasis instead.
const FilterChip = styled.button<{ $active: boolean; $phase?: PhaseKey | null }>`
  ${({ $active, $phase }) => ($active && $phase ? phaseBadge($phase) : glassControl)}
  padding: 6px 14px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;

  ${({ $active, $phase, theme }) =>
    !($active && $phase) &&
    css`
      color: ${$active ? theme.colors.celeste : theme.colors.muted};
    `}

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const SearchInput = styled.input`
  ${glassControl}
  padding: 8px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 220px;
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const DateInput = styled.input`
  ${glassControl}
  padding: 8px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  color-scheme: dark;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
  }
`;

// A dense results table lives inside one glass panel — no nested glass.
const TableCard = styled.div`
  ${glassPanel}
  padding: 8px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 12px 16px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const ThRight = styled(Th)`
  text-align: right;
`;

const Tr = styled.tr`
  cursor: pointer;
  &:hover td {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  transition: background 100ms ease;
`;

const TdMono = styled(Td)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const TdRight = styled(Td)`
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const StatusBadge = styled.span<{ $status: ARCreditNoteStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 8px 4px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  ${glassControl}
  padding: 6px 12px;
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.celeste)};
  font-size: 13px;
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
`;

const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
`;

const LoadingState = styled(EmptyState)`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

const ErrorState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
`;

const FilterLabel = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
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
  const theme = useTheme();
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
      <SharedPageHeader
        breadcrumb="SALES · LIVE"
        title="AR Credit Notes"
        stats={[{ value: data?.meta.total ?? 0, label: 'Total Credit Notes' }]}
      />

      <ActionRow>
        <PrimaryButton
          onClick={() => navigate('/sales/ar-credit-notes/new')}
          aria-label="Create a new AR Credit Note"
        >
          + New Credit Note
        </PrimaryButton>
      </ActionRow>

      {/* Status filter chips */}
      <FilterRow>
        <FilterLabel>Status:</FilterLabel>
        {STATUS_OPTIONS.map(opt => (
          <FilterChip
            key={opt.value}
            $active={statusFilter === opt.value}
            $phase={chipPhase(opt.value)}
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
      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState>
          <EmptyHeadline>No AR Credit Notes found</EmptyHeadline>
        </EmptyState>
      )}
      {!isLoading && !isError && filtered.length > 0 && (
        <>
          <TableCard>
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
                {filtered.map(item => (
                  <Tr
                    key={item.docEntry}
                    onClick={() => navigate(`/sales/ar-credit-notes/${item.docEntry}`)}
                    aria-label={`Open AR Credit Note ${item.docNumber}`}
                  >
                    <TdMono style={{ fontWeight: 600 }}>{item.docNumber}</TdMono>
                    <TdMono>{formatDate(item.docDate)}</TdMono>
                    <Td>{item.customerName}</Td>
                    <Td style={{ color: item.baseReturnDocRef ? theme.colors.bright.lapis : theme.colors.muted }}>
                      {getSourceLabel(item)}
                    </Td>
                    <TdRight>
                      {formatAmount(item.totals.gross)}{' '}
                      <span style={{ color: theme.colors.muted, fontSize: 11 }}>AED</span>
                    </TdRight>
                    <Td>
                      <StatusBadge $status={item.status}>
                        {labelStatus(item.status)}
                      </StatusBadge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableCard>

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
    </Container>
  );
}

export default ArCreditNotesPage;
