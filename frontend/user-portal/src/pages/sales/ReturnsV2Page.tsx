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
 *
 * Night Observatory reskin (T-901): status filter chips and the status
 * column both route through the single canonical helper in
 * components/sales/statusPhase.ts — see StatusBadge / Chip below. Source
 * chips/tags have no phase (categorical, not status).
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css, useTheme } from 'styled-components';
import { Plus } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge, PageHeader } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { useReturns } from '../../hooks/queries/useReturns';
import { useAuthStore } from '../../stores/auth.store';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { ReturnNoteStatus, ReturnNoteListItem } from '../../services/salesApi';

function chipPhase(value: ReturnNoteStatus | ''): PhaseKey | null {
  return value === '' ? null : salesStatusToPhase(value);
}

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
`;

const NewButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
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

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
`;

const SearchInput = styled.input`
  ${glassControl}
  padding: 9px 14px;
  font-size: 14px;
  width: 280px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ChipGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Chip = styled.button<{ $active: boolean; $phase?: PhaseKey | null }>`
  ${({ $active, $phase }) => ($active && $phase ? phaseBadge($phase) : glassControl)}
  padding: 5px 12px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.66rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;

  ${({ $active, $phase, theme }) =>
    !($active && $phase) &&
    css`
      color: ${$active ? theme.colors.celeste : theme.colors.muted};
    `}

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// A dense results table lives inside one glass panel — no nested glass.
const Card = styled.div`
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
  padding: 11px 14px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const Tr = styled.tr`
  cursor: pointer;
  &:hover td { background: rgba(180, 200, 220, 0.05); }
`;

const Td = styled.td`
  padding: 13px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
`;

const TdMono = styled(Td)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const StatusBadge = styled.span<{ $status: ReturnNoteStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

// Source-type tag — categorical (which doc this Return Note was raised
// from), not a status. rr → lapis, dn → terra, other → muted. Neither uses
// gold (spec §3 — gold is not a categorical data-value colour).
const SourceTag = styled.span<{ $type: 'rr' | 'dn' | 'other' }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${({ $type }) =>
    $type === 'rr' ? 'rgba(107, 138, 224, 0.16)' : $type === 'dn' ? 'rgba(232, 147, 95, 0.16)' : 'rgba(139, 144, 172, 0.16)'};
  color: ${({ $type, theme }) =>
    $type === 'rr' ? theme.colors.bright.lapis : $type === 'dn' ? theme.colors.bright.terra : theme.colors.muted};
  margin-right: 6px;
`;

const EmptyState = styled.div`
  padding: 56px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 8px 4px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $disabled?: boolean }>`
  ${glassControl}
  padding: 6px 14px;
  color: ${({ $disabled, theme }) => $disabled ? theme.colors.muted : theme.colors.celeste};
  font-size: 13px;
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'pointer'};
  &:hover:not(:disabled) { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ErrorBanner = styled.div`
  padding: 14px 20px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  margin-bottom: 16px;
  color: ${({ theme }) => theme.colors.bright.coral};
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
      <PageHeader
        breadcrumb="SALES · LIVE"
        title="Return Notes"
        description="Inventory-restoration documents — reverse Delivery COGS postings"
        stats={[{ value: total, label: 'Total Notes' }]}
      />

      <ActionRow>
        <NewButton onClick={() => navigate('/sales/returns-v2/new')}>
          <Plus size={16} strokeWidth={1.8} /> New Return Note
        </NewButton>
      </ActionRow>

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
              $phase={chipPhase(opt.value)}
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
                    <TdMono style={{ fontWeight: 600 }}>{rtn.docNumber}</TdMono>
                    <TdMono>{formatDate(rtn.docDate)}</TdMono>
                    <TdMono>{formatDate(rtn.actualReturnDate)}</TdMono>
                    <Td>{rtn.customerName}</Td>
                    <TdMono>
                      {srcNum !== '—' && stLabel && (
                        <SourceTag $type={st}>{stLabel}</SourceTag>
                      )}
                      <span style={{ color: srcNum === '—' ? theme.colors.muted : undefined }}>
                        {srcNum}
                      </span>
                    </TdMono>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: theme.typography.fontFamily.mono }}>
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
