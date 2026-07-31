/**
 * PurchaseRequestsPage
 *
 * Paginated list of Purchase Requests with status filters and navigation
 * to detail/new form pages.
 *
 * Modals do NOT close on overlay click — X button only.
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
import { usePurchaseRequests } from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { PRStatus, UrgencyLevel } from '../../services/purchasingApi';
import { purchasingStatusToPhase } from './statusPhase';

// ─── Styled components ──────────────────────────────────────────────────────

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
  min-width: 220px;
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

const StatusBadge = styled.span<{ $status: PRStatus }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
`;

const UrgencyDot = styled.span<{ $urgency: UrgencyLevel }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  background: ${({ $urgency, theme }) => {
    switch ($urgency) {
      case 'high': return theme.colors.error;
      // Reason: 'normal' previously rendered in theme.colors.warning (gold-b).
      // A per-row 8px dot in gold would have blown the <=4-gold-elements-per-
      // view budget (spec §3) on any list with several "normal" PRs. Urgency
      // is not a lifecycle status (the phase map's extrapolation table only
      // covers document states — spec §5.2), so celeste (secondary emphasis)
      // is the correct non-gold substitute, not a phase colour.
      case 'normal': return theme.colors.celeste;
      case 'low': return theme.colors.muted;
      default: return theme.colors.muted;
    }
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

// ─── Status filter options ────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: PRStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Pending Approval', value: 'Pending Approval' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
  { label: 'Cancelled', value: 'Cancelled' },
];

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PurchaseRequestsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const organizationId = user?.organizationId ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PRStatus | 'all'>('all');

  const { data, isLoading, isError } = usePurchaseRequests({
    organizationId,
    page,
    perPage: 20,
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const prs = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <Container>
      <PageHeader
        breadcrumb="— PURCHASING · REQUESTS"
        title="Purchase Requests"
        emphasizeLastWord
        description="Departmental requests awaiting review before they become purchase orders."
        stats={[
          { value: meta.total, label: 'Total PRs' },
          { value: prs.length, label: 'This Page' },
        ]}
      />

      <FilterRow>
        <SearchInput
          placeholder="Search by PR number..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <FilterChips>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.value}
              $active={statusFilter === f.value}
              $phase={f.value === 'all' ? undefined : purchasingStatusToPhase(f.value)}
              onClick={() => { setStatusFilter(f.value as any); setPage(1); }}
            >
              {f.label}
            </Chip>
          ))}
        </FilterChips>
        <Button variant="primary" onClick={() => navigate('/purchasing/pr/new')}>
          New Purchase Request
        </Button>
      </FilterRow>

      {isLoading && <StatusMessage>Loading purchase requests...</StatusMessage>}
      {isError && <StatusMessage>Failed to load purchase requests. Please try again.</StatusMessage>}
      {!isLoading && !isError && prs.length === 0 && (
        <EmptyState>
          <EmptyHeadline>No purchase requests yet</EmptyHeadline>
          {/* Reason: no separate CTA here — the "New Purchase Request" button
              already sits in FilterRow above and stays visible in this empty
              state. A second simultaneous gold primary button would duplicate
              that action and push this view over the spec §3 ≤4-gold-
              elements-per-view budget. */}
          <EmptyText style={{ marginBottom: 0 }}>Create your first PR above to get the approval chain moving.</EmptyText>
        </EmptyState>
      )}

      {!isLoading && !isError && prs.length > 0 && (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>PR Number</Th>
                  <Th>Department</Th>
                  <Th>Urgency</Th>
                  <Th>Total (AED)</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {prs.map((pr) => (
                  <Tr key={pr.docId} onClick={() => navigate(`/purchasing/pr/${pr.docId}`)}>
                    <Td>
                      <DocCode>{pr.docNumber}</DocCode>
                    </Td>
                    <Td>{pr.department ?? '—'}</Td>
                    <Td>
                      <UrgencyDot $urgency={pr.urgency} />
                      {pr.urgency}
                    </Td>
                    <Td><Mono>{formatAmount(pr.totalGross, pr.currencyCode)}</Mono></Td>
                    <Td>
                      <StatusBadge $status={pr.status}>{pr.status}</StatusBadge>
                    </Td>
                    <Td><Mono>{formatDate(pr.requestedDate)}</Mono></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination>
            <span>Showing {prs.length} of {meta.total} purchase requests</span>
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
