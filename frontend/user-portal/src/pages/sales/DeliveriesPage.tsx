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
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Truck } from 'lucide-react';
import { useDeliveries } from '../../hooks/queries/useDeliveries';
import { useAuthStore } from '../../stores/auth.store';
import type { DeliveryStatus, DeliveryListItem } from '../../services/salesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = DeliveryStatus | 'ALL';

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
  margin-bottom: 16px;
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

const StatusChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const StatusChip = styled.button<{ $active: boolean; $status: StatusFilter }>`
  padding: 6px 16px;
  border-radius: 99px;
  border: 1.5px solid transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  background: ${({ $active, $status, theme }) => {
    if (!$active) return theme.colors.neutral[100];
    switch ($status) {
      case 'draft': return theme.colors.neutral[100];
      case 'open': return theme.colors.successBg;
      case 'cancelled': return theme.colors.errorBg;
      default: return theme.colors.primary[50];
    }
  }};
  color: ${({ $active, $status, theme }) => {
    if (!$active) return theme.colors.textSecondary;
    switch ($status) {
      case 'draft': return theme.colors.textSecondary;
      case 'open': return theme.colors.emerald[700];
      case 'cancelled': return theme.colors.terracotta[700];
      default: return theme.colors.primary[700];
    }
  }};
  border-color: ${({ $active, $status, theme }) => {
    if (!$active) return 'transparent';
    switch ($status) {
      case 'draft': return theme.colors.neutral[400];
      case 'open': return theme.colors.emerald[300];
      case 'cancelled': return theme.colors.terracotta[300];
      default: return theme.colors.primary[300];
    }
  }};
  &:hover {
    opacity: 0.85;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
`;

const Th = styled.th`
  text-align: left;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 0.1s;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
  &:last-child td {
    border-bottom: none;
  }
`;

const StatusBadge = styled.span<{ $status: DeliveryStatus }>`
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

/**
 * F-3: Chip-style toggle for "Open to Invoice" filter.
 * Uses the same transient-prop pattern as StatusChip to avoid DOM leakage.
 */
const FilterToggleChip = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 99px;
  border: 1.5px solid ${({ $active, theme }) => ($active ? theme.colors.primary[300] : 'transparent')};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  background: ${({ $active, theme }) => ($active ? theme.colors.primary[50] : theme.colors.neutral[100])};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary[700] : theme.colors.textSecondary)};
  &:hover { opacity: 0.85; }
`;

/**
 * F-3: Badge for openInvoiceQty in the list row.
 * Zero → muted grey dash; positive → coloured (amber for partial).
 */
const OpenInvoiceListBadge = styled.span<{ $zero: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: ${({ $zero, theme }) => ($zero ? 'transparent' : theme.colors.warningBg)};
  color: ${({ $zero, theme }) => ($zero ? theme.colors.border : theme.colors.gold[800])};
  border-radius: 99px;
  font-size: 12px;
  font-weight: ${({ $zero }) => ($zero ? 400 : 600)};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PageButton = styled.button`
  padding: 6px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  font-size: 14px;
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
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
      <Header>
        <Title>Delivery Notes</Title>
        {/* No standalone "+ New Delivery" button by design.
            Deliveries must originate from a Sales Order to preserve the
            doc chain audit trail and credit-limit gate. Open a Sales Order
            and click "Create Delivery" on its detail page.
            The /sales/deliveries/new route remains live for admin /
            data-correction use via direct URL. */}
      </Header>

      <FilterRow>
        <StatusChips>
          {STATUS_FILTERS.map(({ label, value }) => (
            <StatusChip
              key={value}
              $active={statusFilter === value}
              $status={value}
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
          {openToInvoiceFilter ? '✓ ' : ''}Has Open Qty
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
      {error && <EmptyState style={{ color: theme.colors.error }}>Failed to load deliveries.</EmptyState>}

      {!isLoading && !error && (
        <>
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
                    <Td>
                      <strong>{dn.docNumber}</strong>
                    </Td>
                    <Td>{formatDate(dn.docDate)}</Td>
                    <Td>{formatDate(dn.actualDeliveryDate)}</Td>
                    <Td>{dn.customerName}</Td>
                    <Td>
                      {dn.baseDocRef ? (
                        <span
                          style={{ color: theme.colors.primary[500], cursor: 'pointer', fontWeight: 500 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/sales/orders-v2/${dn.baseDocRef!.docId}`);
                          }}
                        >
                          {dn.baseDocRef.docNumber}
                        </span>
                      ) : (
                        <span style={{ color: theme.colors.textDisabled }}>—</span>
                      )}
                    </Td>
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
                    <Td style={{ textAlign: 'right', fontWeight: 500 }}>
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
