/**
 * ReturnsV2Page — Wave 3 (T-200.7)
 *
 * Paginated list of Return Notes (RTNs) with:
 *   - Status filter chips: All / Draft / Open / Cancelled
 *   - Source-type chip: All / From RR / From DN (client-side, derived from baseDocRef.docType)
 *   - Search: docNumber, customerName, source RR or DN docNumber (via baseDocRef)
 *   - Table: DocNumber, DocDate, ActualReturnDate, Customer, Source, Total Qty, Status
 *   - "+ New Return Note" button
 *
 * Route: /sales/returns-v2
 * NO Audit History button — sales audit endpoint pending T-200.x.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Plus } from 'lucide-react';
import { useReturns } from '../../hooks/queries/useReturns';
import { useAuthStore } from '../../stores/auth.store';
import type { ReturnNoteStatus, ReturnNoteListItem } from '../../services/salesApi';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 16px;
`;

const TitleGroup = styled.div``;

const Title = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const NewButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: ${({ theme }) => theme.colors.primary[600]}; }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
`;

const SearchInput = styled.input`
  padding: 9px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  width: 280px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.textSecondary}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[400]}; }
`;

const ChipGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 5px 12px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[50] : theme.colors.surface};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[700] : theme.colors.textSecondary};
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[400]};
    color: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 11px 14px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const Tr = styled.tr`
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[50]}; }
`;

const Td = styled.td`
  padding: 13px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

// Status badge colours — A20Core document-status canon, shared across all
// Wave 3 sales list/detail pages (see a20core-rebrand-spec.md):
//   draft     → neutral   (neutral[100] / textSecondary)
//   open      → emerald   (successBg / emerald[700])
//   cancelled → terracotta (errorBg / terracotta[700])
interface StatusBadgeProps { $status: ReturnNoteStatus }
const StatusBadge = styled.span<StatusBadgeProps>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'draft': return theme.colors.neutral[100];
      case 'open': return theme.colors.successBg;
      case 'cancelled': return theme.colors.errorBg;
      default: return theme.colors.neutral[100];
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'draft': return theme.colors.textSecondary;
      case 'open': return theme.colors.emerald[700];
      case 'cancelled': return theme.colors.terracotta[700];
      default: return theme.colors.textSecondary;
    }
  }};
`;

// Source-type tag — categorical (which doc this Return Note was raised from),
// not a status. rr → lapis, dn → gold, other → neutral.
const SourceTag = styled.span<{ $type: 'rr' | 'dn' | 'other' }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $type, theme }) =>
    $type === 'rr' ? theme.colors.primary[100] : $type === 'dn' ? theme.colors.gold[50] : theme.colors.neutral[100]};
  color: ${({ $type, theme }) =>
    $type === 'rr' ? theme.colors.primary[800] : $type === 'dn' ? theme.colors.gold[800] : theme.colors.neutral[800]};
  margin-right: 6px;
`;

const EmptyState = styled.div`
  padding: 56px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $disabled?: boolean }>`
  padding: 6px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ $disabled, theme }) => $disabled ? theme.colors.neutral[400] : theme.colors.textPrimary};
  font-size: 13px;
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'pointer'};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const ErrorBanner = styled.div`
  padding: 14px 20px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  border-radius: 8px;
  margin-bottom: 16px;
  color: ${({ theme }) => theme.colors.terracotta[700]};
  font-size: 14px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SourceTypeFilter = '' | 'rr' | 'dn';

const STATUS_OPTIONS: Array<{ value: ReturnNoteStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SOURCE_OPTIONS: Array<{ value: SourceTypeFilter; label: string }> = [
  { value: '', label: 'All Sources' },
  { value: 'rr', label: 'From RR (RMA)' },
  { value: 'dn', label: 'From DN (Direct)' },
];

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-AE', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: ReturnNoteStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

/** Derive source type from baseDocRef.docType — RR vs DELIVERY vs unknown */
function getSourceType(rtn: ReturnNoteListItem): 'rr' | 'dn' | 'other' {
  const docType = (rtn.baseDocRef as { docType?: string } | null)?.docType;
  if (!docType) return 'other';
  if (docType === 'RR' || docType === 'RETURN_REQUEST') return 'rr';
  if (docType === 'DELIVERY' || docType === 'DN') return 'dn';
  return 'other';
}

/** Compute total returned qty across all lines for a list item (not on slim shape — use totals) */
function sourceLabel(rtn: ReturnNoteListItem): string {
  const ref = rtn.baseDocRef as { docNumber?: string; docType?: string } | null;
  if (!ref?.docNumber) return '—';
  const type = getSourceType(rtn);
  return ref.docNumber;
  // tag rendered separately via SourceTag
  void type;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReturnsV2Page() {
  const theme = useTheme();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const [statusFilter, setStatusFilter] = useState<ReturnNoteStatus | ''>('');
  const [sourceFilter, setSourceFilter] = useState<SourceTypeFilter>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data, isLoading, error } = useReturns({
    organizationId: orgId,
    status: statusFilter || undefined,
    page,
    size: PAGE_SIZE,
  });

  // Client-side search + source-type filter
  const filtered = useMemo<ReturnNoteListItem[]>(() => {
    const items = data?.data ?? [];
    const q = search.toLowerCase().trim();
    return items.filter((rtn) => {
      // Source-type filter — derived from baseDocRef.docType
      if (sourceFilter) {
        const st = getSourceType(rtn);
        if (sourceFilter === 'rr' && st !== 'rr') return false;
        if (sourceFilter === 'dn' && st !== 'dn') return false;
      }
      if (!q) return true;
      const src = (rtn.baseDocRef as { docNumber?: string } | null)?.docNumber ?? '';
      return (
        rtn.docNumber.toLowerCase().includes(q) ||
        rtn.customerName.toLowerCase().includes(q) ||
        src.toLowerCase().includes(q)
      );
    });
  }, [data?.data, search, sourceFilter]);

  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;

  return (
    <Container>
      <Header>
        <TitleGroup>
          <Title>Return Notes</Title>
          <Subtitle>Inventory-restoration documents — reverse Delivery COGS postings</Subtitle>
        </TitleGroup>
        <NewButton onClick={() => navigate('/sales/returns-v2/new')}>
          <Plus size={16} /> New Return Note
        </NewButton>
      </Header>

      {error && (
        <ErrorBanner>Failed to load Return Notes. Please refresh and try again.</ErrorBanner>
      )}

      <Toolbar>
        <SearchInput
          placeholder="Search doc number, customer, source RR/DN..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search Return Notes"
        />
        <ChipGroup aria-label="Filter by status">
          {STATUS_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              $active={statusFilter === opt.value}
              onClick={() => { setStatusFilter(opt.value as ReturnNoteStatus | ''); setPage(1); }}
            >
              {opt.label}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup aria-label="Filter by source type">
          {SOURCE_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              $active={sourceFilter === opt.value}
              onClick={() => { setSourceFilter(opt.value as SourceTypeFilter); setPage(1); }}
            >
              {opt.label}
            </Chip>
          ))}
        </ChipGroup>
      </Toolbar>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Doc Number</Th>
              <Th>Doc Date</Th>
              <Th>Return Date</Th>
              <Th>Customer</Th>
              <Th>Source</Th>
              <Th style={{ textAlign: 'right' }}>Gross</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <Td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                  Loading...
                </Td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <Td colSpan={7}>
                  <EmptyState>
                    {search || statusFilter || sourceFilter
                      ? 'No Return Notes match the current filters.'
                      : 'No Return Notes yet. Create one from a Return Request or Delivery.'}
                  </EmptyState>
                </Td>
              </tr>
            ) : (
              filtered.map((rtn) => {
                const st = getSourceType(rtn);
                const srcNum = sourceLabel(rtn);
                const stLabel = st === 'rr' ? 'from RR' : st === 'dn' ? 'from DN' : '';
                return (
                  <Tr
                    key={rtn.docEntry}
                    onClick={() => navigate(`/sales/returns-v2/${rtn.docEntry}`)}
                  >
                    <Td style={{ fontWeight: 600 }}>{rtn.docNumber}</Td>
                    <Td>{formatDate(rtn.docDate)}</Td>
                    <Td>{formatDate(rtn.actualReturnDate)}</Td>
                    <Td>{rtn.customerName}</Td>
                    <Td>
                      {srcNum !== '—' && stLabel && (
                        <SourceTag $type={st}>{stLabel}</SourceTag>
                      )}
                      <span style={{ color: srcNum === '—' ? theme.colors.textDisabled : undefined }}>
                        {srcNum}
                      </span>
                    </Td>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(rtn.totals.gross).toLocaleString('en-AE', {
                        minimumFractionDigits: 2, maximumFractionDigits: 2,
                      })}
                    </Td>
                    <Td>
                      <StatusBadge $status={rtn.status}>{statusLabel(rtn.status)}</StatusBadge>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>

        {!isLoading && total > 0 && (
          <Pagination>
            <span>
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <PaginationButtons>
              <PageButton $disabled={page <= 1} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </PageButton>
              <PageButton
                $disabled={page >= totalPages}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </PageButton>
            </PaginationButtons>
          </Pagination>
        )}
      </Card>
    </Container>
  );
}
