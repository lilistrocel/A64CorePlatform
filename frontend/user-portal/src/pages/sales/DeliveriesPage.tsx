/**
 * DeliveriesPage — Wave 3 (T-200.5)
 *
 * Paginated list of Delivery Notes with status filter chips, date range,
 * search by doc number / customer name, and navigation to detail / new-form pages.
 *
 * Route: /sales/deliveries
 *
 * Status vocabulary: Draft | Open | Cancelled
 * (mirrors DocumentStatus enum — all lowercase).
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint pending T-200.x.
 *
 * Night Observatory reskin (T-901): status filter chips and the status
 * column both route through the single canonical helper in
 * components/sales/statusPhase.ts — see StatusBadge / StatusChip below.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css, useTheme } from 'styled-components';
import { Check } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge, PageHeader } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { useDeliveries } from '../../hooks/queries/useDeliveries';
import { useAuthStore } from '../../stores/auth.store';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { DeliveryStatus, DeliveryListItem } from '../../services/salesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = DeliveryStatus | 'ALL';

function chipPhase(value: StatusFilter): PhaseKey | null {
  return value === 'ALL' ? null : salesStatusToPhase(value);
}

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
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

const StatusChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

// Status chips coloured by phase at ~16% tint (several are visible at once,
// so gold is never used here — spec §3).
const StatusChip = styled.button<{ $active: boolean; $phase: PhaseKey | null }>`
  ${({ $active, $phase }) => ($active && $phase ? phaseBadge($phase) : glassControl)}
  padding: 6px 16px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  ${({ $active, $phase, theme }) =>
    !($active && $phase) &&
    css`
      color: ${$active ? theme.colors.celeste : theme.colors.muted};
    `}

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${monoLabel}
  text-align: left;
  padding: 12px 16px;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
`;

const TdMono = styled(Td)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 0.1s;
  &:hover td {
    background: rgba(180, 200, 220, 0.05);
  }
  &:last-child td {
    border-bottom: none;
  }
`;

const StatusBadge = styled.span<{ $status: DeliveryStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

/**
 * F-3: Chip-style toggle for "Open to Invoice" filter. This is a boolean
 * toggle, not a status — celeste emphasis when active, never gold/phase.
 * Uses the same transient-prop pattern as StatusChip to avoid DOM leakage.
 */
const FilterToggleChip = styled.button<{ $active: boolean }>`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  color: ${({ $active, theme }) => ($active ? theme.colors.celeste : theme.colors.muted)};
  border-color: ${({ $active, theme }) => ($active ? 'rgba(180, 200, 220, 0.35)' : theme.colors.glass.border)};
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

/**
 * F-3: Badge for openInvoiceQty in the list row.
 * Zero → muted dash; positive → terra tint (action-needed semantic, per
 * spec §3 gold is never used for a generic "needs attention" data value).
 */
const OpenInvoiceListBadge = styled.span<{ $zero: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: ${({ $zero }) => ($zero ? 'transparent' : 'rgba(232, 147, 95, 0.16)')};
  color: ${({ $zero, theme }) => ($zero ? theme.colors.muted : theme.colors.bright.terra)};
  border-radius: 99px;
  font-size: 12px;
  font-weight: ${({ $zero }) => ($zero ? 400 : 600)};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const PageButton = styled.button`
  ${glassControl}
  padding: 6px 14px;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  font-size: 14px;
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// A dense results table lives inside one glass panel — no nested glass.
const TableWrapper = styled.div`
  ${glassPanel}
  padding: 8px;
  overflow: hidden;
`;

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: DeliveryStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'draft' },
  { label: 'Open', value: 'open' },
  { label: 'Cancelled', value: 'cancelled' },
];

export function DeliveriesPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  /**
   * F-3: "Open to Invoice" toggle.
   * When true, passes status='open' to the API query so only deliveries
   * with potentially invoiceable lines are returned.
   * Mutually exclusive with the status chip — activating this chip resets
   * the status chip to 'ALL' (otherwise the explicit status takes precedence).
   */
  const [openToInvoiceFilter, setOpenToInvoiceFilter] = useState(false);

  // Derive the effective status for the API: explicit chip wins, else open-to-invoice gate
  const effectiveStatus: DeliveryStatus | null =
    statusFilter !== 'ALL'
      ? statusFilter
      : openToInvoiceFilter
      ? 'open'
      : null;

  const queryParams = {
    organizationId: orgId,
    status: effectiveStatus,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    page,
    size: 20,
  };

  const { data, isLoading, error } = useDeliveries(queryParams);

  // Client-side search filter (doc number + customer name)
  const filteredItems = useMemo<DeliveryListItem[]>(() => {
    if (!data?.data) return [];
    if (!search.trim()) return data.data;
    const q = search.toLowerCase();
    return data.data.filter(
      (dn) =>
        dn.docNumber.toLowerCase().includes(q) ||
        dn.customerName.toLowerCase().includes(q),
    );
  }, [data?.data, search]);

  const meta = data?.meta;

  return (
    <Container>
      <PageHeader
        breadcrumb="SALES · LIVE"
        title="Delivery Notes"
        stats={[{ value: meta?.total ?? 0, label: 'Total Deliveries' }]}
      />
      {/* No standalone "+ New Delivery" button by design.
          Deliveries must originate from a Sales Order to preserve the
          doc chain audit trail and credit-limit gate. Open a Sales Order
          and click "Create Delivery" on its detail page.
          The /sales/deliveries/new route remains live for admin /
          data-correction use via direct URL. */}

      <FilterRow>
        <StatusChips>
          {STATUS_FILTERS.map(({ label, value }) => (
            <StatusChip
              key={value}
              $active={statusFilter === value}
              $phase={chipPhase(value)}
              onClick={() => {
                setStatusFilter(value);
                setPage(1);
              }}
            >
              {label}
            </StatusChip>
          ))}
        </StatusChips>
        {/* F-3: Open to Invoice toggle chip */}
        <FilterToggleChip
          $active={openToInvoiceFilter}
          onClick={() => {
            setOpenToInvoiceFilter((prev) => !prev);
            setPage(1);
          }}
          title="Show only deliveries with open quantity still to be invoiced (status=Open)"
        >
          {openToInvoiceFilter && <Check size={13} strokeWidth={2} />}
          Has Open Qty
        </FilterToggleChip>
      </FilterRow>

      <FilterRow>
        <SearchInput
          type="text"
          placeholder="Search by doc number or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <DateInput
          type="date"
          title="Date from"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
        />
        <DateInput
          type="date"
          title="Date to"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
        />
      </FilterRow>

      {isLoading && <EmptyState>Loading...</EmptyState>}
      {error && <EmptyState style={{ color: theme.colors.bright.coral }}>Failed to load deliveries.</EmptyState>}

      {!isLoading && !error && (
        <>
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>Doc Number</Th>
                  <Th>Doc Date</Th>
                  <Th>Actual Delivery</Th>
                  <Th>Customer</Th>
                  <Th>Source SO</Th>
                  <Th>Status</Th>
                  {/* F-3: Open to Invoice qty column. Renamed 2026-06-02 to make it
                      explicit this is a unit-quantity sum (not a money amount) —
                      the adjacent "Total COGS" column made the prior "Open to Invoice"
                      label easy to read as money. See DeliveryDetailPage for per-line breakdown. */}
                  <Th style={{ textAlign: 'right' }}>Open Qty</Th>
                  <Th style={{ textAlign: 'right' }}>Total COGS</Th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState>No delivery notes found.</EmptyState>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((dn) => (
                    <Tr
                      key={dn.docEntry}
                      onClick={() => navigate(`/sales/deliveries/${dn.docEntry}`)}
                    >
                      <TdMono>
                        <strong>{dn.docNumber}</strong>
                      </TdMono>
                      <TdMono>{formatDate(dn.docDate)}</TdMono>
                      <TdMono>{formatDate(dn.actualDeliveryDate)}</TdMono>
                      <Td>{dn.customerName}</Td>
                      <TdMono>
                        {dn.baseDocRef ? (
                          <span
                            style={{ color: theme.colors.bright.lapis, cursor: 'pointer', fontWeight: 500 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/sales/orders-v2/${dn.baseDocRef!.docId}`);
                            }}
                          >
                            {dn.baseDocRef.docNumber}
                          </span>
                        ) : (
                          <span style={{ color: theme.colors.muted }}>—</span>
                        )}
                      </TdMono>
                      <Td>
                        <StatusBadge $status={dn.status}>
                          {statusLabel(dn.status)}
                        </StatusBadge>
                      </Td>
                      {/* F-3: openInvoiceQty — provided by backend on DeliveryListItem */}
                      <Td style={{ textAlign: 'right' }}>
                        {(() => {
                          const openQty = Number(dn.openInvoiceQty ?? 0);
                          return (
                            <OpenInvoiceListBadge $zero={openQty <= 0}>
                              {openQty <= 0 ? '—' : openQty.toFixed(3)}
                            </OpenInvoiceListBadge>
                          );
                        })()}
                      </Td>
                      <Td style={{ textAlign: 'right', fontWeight: 500, fontFamily: theme.typography.fontFamily.mono }}>
                        {Number(dn.totalCogs).toLocaleString('en-AE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrapper>

          {meta && meta.totalPages > 1 && (
            <Pagination>
              <span>
                Showing {(meta.page - 1) * meta.perPage + 1}–
                {Math.min(meta.page * meta.perPage, meta.total)} of {meta.total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <PageButton
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </PageButton>
                <PageButton
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= meta.totalPages}
                >
                  Next
                </PageButton>
              </div>
            </Pagination>
          )}
        </>
      )}
    </Container>
  );
}

export default DeliveriesPage;
