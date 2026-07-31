/**
 * APInvoicesPage
 *
 * Paginated list of AP (Vendor) Invoices. Mirrors GoodsReceiptsPage pattern.
 * Includes a Variance column: "—" when zero, coral when positive, emerald
 * when negative.
 *
 * Role gating: procurement_officer, procurement_manager, accountant,
 *   finance_admin, auditor, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 *
 * Route: /purchasing/ap
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md):
 * visual reskin only — glass table/controls, phase badges via ./statusPhase,
 * Space Mono metadata, shared PageHeader/Button. Logic, routes, data-fetching
 * and props are unchanged.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { useAPInvoices } from '../../hooks/queries/useAPInvoices';
import { useAuthStore } from '../../stores/auth.store';
import type { APStatus } from '../../services/apInvoicesService';
import { purchasingStatusToPhase } from './statusPhase';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
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
  min-width: 260px;
  padding: 10px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
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

/** Filter pill — spec §5 preamble: "same status = same colour in every
 * context (badge, card edge, filter pill, ...)". Active state without a
 * phase (the "All" chip) falls back to celeste, never gold. */
const Chip = styled.button<{ $active: boolean; $phase?: PhaseKey }>`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  transition: all 150ms ease;

  &:hover {
    border-color: rgba(180, 200, 220, 0.4);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  ${({ $active, $phase, theme }) =>
    $active &&
    ($phase
      ? phaseBadge($phase)
      : css`
          color: ${theme.colors.celeste};
          border-color: ${theme.colors.celeste};
          background: rgba(180, 200, 220, 0.14);
        `)}
`;

const TableWrap = styled.div`
  ${glassPanel}
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

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover td { background: rgba(180, 200, 220, 0.05); }
  &:last-child td { border-bottom: none; }
`;

/** Space Mono for document IDs, quantities, currency amounts, timestamps —
 * spec §2/instruction 6. */
const Mono = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const DocCode = styled(Mono)`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** Muted, smaller Space Mono — for secondary metadata like "Approved By/At". */
const MutedMono = styled(Mono)`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`;

const StatusBadge = styled.span<{ $status: APStatus }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
`;

/** Variance cell: hidden when zero, coral when positive (vendor charged
 * more), emerald when negative (vendor charged less) — the two "only red"
 * and "healthy" semantic tokens (spec §1.1), not raw ramp steps. */
const VarianceCell = styled(Mono)<{ $sign: 'positive' | 'negative' | 'zero' }>`
  font-size: 13px;
  font-weight: ${({ $sign }) => ($sign === 'zero' ? '400' : '600')};
  color: ${({ $sign, theme }) => {
    if ($sign === 'positive') return theme.colors.error;
    if ($sign === 'negative') return theme.colors.success;
    return theme.colors.muted;
  }};
`;

const StatusMessage = styled.p`
  text-align: center;
  padding: 48px 32px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 15px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
`;

const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 1.4rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px;
`;

const EmptyText = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9rem;
  margin: 0 0 20px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const PageButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PageIndicator = styled.span`
  ${monoLabel}
  padding: 6px 12px;
  color: ${({ theme }) => theme.colors.celeste};
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: APStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Pending Approval', value: 'Pending Approval' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
];

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a variance amount for display.
 * Returns { label, sign } where sign drives the colour.
 */
function formatVariance(
  variance: number,
  currency: string
): { label: string; sign: 'positive' | 'negative' | 'zero' } {
  if (variance === 0) return { label: '—', sign: 'zero' };
  const abs = new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(variance));
  if (variance > 0) return { label: `+${abs}`, sign: 'positive' };
  return { label: `(${abs})`, sign: 'negative' };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function APInvoicesPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const organizationId = user?.organizationId ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<APStatus | 'all'>('all');

  const { data, isLoading, isError } = useAPInvoices({
    organizationId,
    page,
    perPage: 20,
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const aps = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <Container>
      <PageHeader
        breadcrumb="— PURCHASING · AP"
        title="AP Invoices"
        emphasizeLastWord
        description="Vendor invoices matched against goods receipts, awaiting approval and posting."
        stats={[
          { value: meta.total, label: 'Total Invoices' },
          { value: aps.length, label: 'This Page' },
        ]}
      />

      <FilterRow>
        <SearchInput
          placeholder="Search by doc number, vendor, or invoice #..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search AP invoices"
        />
        <FilterChips>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.value}
              $active={statusFilter === f.value}
              $phase={f.value === 'all' ? undefined : purchasingStatusToPhase(f.value)}
              onClick={() => { setStatusFilter(f.value as APStatus | 'all'); setPage(1); }}
            >
              {f.label}
            </Chip>
          ))}
        </FilterChips>
        <Button variant="primary" onClick={() => navigate('/purchasing/ap/new')}>
          New from GR
        </Button>
      </FilterRow>

      {isLoading && <StatusMessage>Loading AP invoices...</StatusMessage>}
      {isError && <StatusMessage>Failed to load AP invoices. Please try again.</StatusMessage>}
      {!isLoading && !isError && aps.length === 0 && (
        <EmptyState>
          <EmptyHeadline>No AP invoices yet</EmptyHeadline>
          {/* Reason: no separate CTA — "New from GR" above in FilterRow
              already covers this action; a second gold primary button here
              would breach the spec §3 ≤4-gold-per-view budget. */}
          <EmptyText style={{ marginBottom: 0 }}>Match a vendor invoice against a goods receipt above to get started.</EmptyText>
        </EmptyState>
      )}

      {!isLoading && !isError && aps.length > 0 && (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Doc Number</Th>
                  <Th>Vendor Invoice #</Th>
                  <Th>Vendor</Th>
                  <Th>Invoice Date</Th>
                  <Th>Due Date</Th>
                  <Th>Total Gross</Th>
                  <Th>Variance</Th>
                  <Th>Status</Th>
                  <Th>Approved By / At</Th>
                </tr>
              </thead>
              <tbody>
                {aps.map((ap) => {
                  const { label: varLabel, sign: varSign } = formatVariance(
                    ap.totalPriceVariance,
                    ap.currencyCode
                  );
                  return (
                    <Tr key={ap.docId} onClick={() => navigate(`/purchasing/ap/${ap.docId}`)}>
                      <Td>
                        <DocCode>{ap.docNumber}</DocCode>
                      </Td>
                      <Td><Mono style={{ fontSize: 13 }}>{ap.invoiceNumber}</Mono></Td>
                      <Td>{ap.vendorName ?? ap.vendorCode ?? '—'}</Td>
                      <Td><Mono>{formatDate(ap.invoiceDate)}</Mono></Td>
                      <Td><Mono>{formatDate(ap.dueDate)}</Mono></Td>
                      <Td><Mono>{formatAmount(ap.totalGross, ap.currencyCode)}</Mono></Td>
                      <Td>
                        <VarianceCell $sign={varSign}>{varLabel}</VarianceCell>
                      </Td>
                      <Td>
                        <StatusBadge $status={ap.status}>{ap.status}</StatusBadge>
                      </Td>
                      <Td>
                        <MutedMono>
                          {ap.approvedBy
                            ? `${ap.approvedBy}${ap.approvedAt ? ` · ${formatDate(ap.approvedAt)}` : ''}`
                            : '—'}
                        </MutedMono>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination>
            <span>Showing {aps.length} of {meta.total} AP invoices</span>
            <PageButtons>
              <Button
                variant="outline"
                size="small"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <PageIndicator>Page {meta.page} / {meta.totalPages}</PageIndicator>
              <Button
                variant="outline"
                size="small"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.totalPages}
              >
                Next
              </Button>
            </PageButtons>
          </Pagination>
        </>
      )}
    </Container>
  );
}
