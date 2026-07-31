/**
 * PaymentsPage
 *
 * Lists all vendor payments for the organisation.
 * Toolbar: search, vendor filter, date range, "New Payment" button.
 * Table: number, date, vendor, method pill, reference, amount, JE link, created by.
 *
 * Role gating:
 *   View:   accountant, finance_admin, auditor, admin, super_admin
 *   Create: finance_admin, admin, super_admin (New Payment button hidden otherwise)
 *
 * Route: /finance/payments
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge, type Theme } from '@a64core/shared';
import { usePayments } from '../../hooks/queries/usePayments';
import { useVendors } from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { ApPaymentResponse, PaymentMethod } from '../../services/paymentsService';

// ─── Role constants ───────────────────────────────────────────────────────────

const CREATE_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(val: string | number, currency = 'AED'): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  cash: 'Cash',
};

// Payment method is categorical, not a status — one brand voice per method,
// styled as a badge-pattern chip (text = colour, bg/border = colour tint).
// Deliberately NOT gold for "cheque": this pill can repeat once per row in
// an unbounded list, and gold discipline (spec §3, target <=4 per view)
// cannot survive a column of gold chips. Uses `bright.*` tokens instead —
// lavender for cheque keeps the three methods visually distinct without
// spending the gold budget on a categorical (non-phase) distinction.
const methodColors = (theme: Theme): Record<PaymentMethod, { bg: string; border: string; text: string }> => ({
  bank_transfer: { bg: 'rgba(107, 138, 224, 0.16)', border: 'rgba(107, 138, 224, 0.45)', text: theme.colors.bright.lapis },
  cheque: { bg: 'rgba(195, 160, 207, 0.16)', border: 'rgba(195, 160, 207, 0.45)', text: theme.colors.bright.lavender },
  cash: { bg: 'rgba(84, 211, 155, 0.16)', border: 'rgba(84, 211, 155, 0.45)', text: theme.colors.bright.emerald },
});

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const ToolbarRow = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  ${glassControl}
  flex: 1;
  min-width: 200px;
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

const FilterSelect = styled.select`
  ${glassControl}
  padding: 10px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const DateInput = styled.input`
  ${glassControl}
  padding: 10px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const DateLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
  display: flex;
  align-items: center;
`;

// The page's one primary CTA — spec §4 Buttons: gold gradient + onAccent
// (cosmos) text.
const NewButton = styled.button`
  padding: 10px 20px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 150ms ease, box-shadow 150ms ease;
  &:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25); }
`;

const RefreshButton = styled.button`
  ${glassControl}
  padding: 10px 16px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
`;

// Dense table, spec §4: one glass panel, transparent rows/header, Space Mono
// uppercase celeste column headers, `line` row dividers, hover
// rgba(180,200,220,.05).
const Table = styled.table`
  ${glassPanel}
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 14px 16px;
  text-align: left;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  background: transparent;
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
`;

const ClickableRow = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover { background: rgba(180, 200, 220, 0.05); }
`;

const MethodPill = styled.span<{ $bg: string; $border: string; $text: string }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${({ $bg }) => $bg};
  border: 1px solid ${({ $border }) => $border};
  color: ${({ $text }) => $text};
`;

// "Reversed" reads as the payment's accounting impact being voided — maps to
// `decommissioned` (dim slate, spec §5.2 "cancelled / void / archived").
const ReversedBadge = styled.span`
  ${phaseBadge('decommissioned')}
  margin-left: 8px;
`;

const ReversedRow = styled(ClickableRow)`
  color: ${({ theme }) => theme.colors.muted};
  /* Strike-through across the amount cell only — keep the rest readable */
`;

const JeLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 600;
  &:hover { opacity: 0.75; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 80px 32px;
  color: ${({ theme }) => theme.colors.muted};
`;

// Empty-state headline, spec §4/§9: Fraunces italic celeste.
const EmptyTitle = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 19px;
  font-weight: 400;
  margin-bottom: 8px;
  color: ${({ theme }) => theme.colors.celeste};
`;

const EmptyHint = styled.div`
  font-size: 14px;
  max-width: 440px;
  margin: 0 auto;
  line-height: 1.6;
`;

const LoadingOverlay = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
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
  gap: 8px;
`;

const GhostButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Tooltip = styled.span`
  position: relative;
  cursor: default;
  &:hover > span {
    display: block;
  }
  > span {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1050;
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
    border: 1px solid ${({ theme }) => theme.colors.glass.border};
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    max-width: 240px;
    white-space: normal;
    pointer-events: none;
    line-height: 1.5;
  }
`;

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const organizationId = user?.organizationId ?? '';

  const canCreate = CREATE_ROLES.has(user?.role ?? '');

  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Initialise search from URL query param for cross-page link support
  const urlSearch = searchParams.get('search');
  const effectiveSearch = search || urlSearch || '';

  const listParams = {
    organizationId,
    search: effectiveSearch || undefined,
    vendorId: vendorFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    size: 25,
  };

  const { data, isLoading, isError, refetch } = usePayments(listParams);

  // Vendor dropdown — load active vendors for the filter
  const { data: vendorsData } = useVendors({
    organizationId,
    isActive: true,
    perPage: 200,
  });
  const vendors = vendorsData?.data ?? [];

  const items = data?.items ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  const handleRowClick = (payment: ApPaymentResponse) => {
    navigate(`/finance/payments/${payment.paymentId}`);
  };

  const handleJeLinkClick = (e: React.MouseEvent, jeNumber: string) => {
    e.stopPropagation();
    navigate(`/finance/journal-entries?search=${encodeURIComponent(jeNumber)}`);
  };

  return (
    <Container>
      <PageHeader
        breadcrumb="FINANCE · ACCOUNTS PAYABLE"
        title="Vendor Payments"
        stats={[{ value: totalItems, label: 'Total Payments' }]}
      />

      <ToolbarRow>
        <SearchInput
          placeholder="Search by payment #, vendor code, or reference..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search payments"
        />
        <FilterSelect
          value={vendorFilter}
          onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
          aria-label="Filter by vendor"
        >
          <option value="">All Vendors</option>
          {vendors.map((v) => (
            <option key={v.vendorId} value={v.vendorId}>
              {v.vendorCode} — {v.name}
            </option>
          ))}
        </FilterSelect>
        <DateLabel>From</DateLabel>
        <DateInput
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          aria-label="Filter from date"
        />
        <DateLabel>To</DateLabel>
        <DateInput
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          aria-label="Filter to date"
        />
        <RefreshButton onClick={() => refetch()} aria-label="Refresh payments">
          Refresh
        </RefreshButton>
        {canCreate && (
          <NewButton onClick={() => navigate('/finance/payments/new')}>
            + New Payment
          </NewButton>
        )}
      </ToolbarRow>

      {isLoading && <LoadingOverlay>Loading payments...</LoadingOverlay>}

      {isError && (
        <EmptyState>
          <EmptyTitle>Failed to load payments</EmptyTitle>
          <EmptyHint>
            Please try refreshing. If the problem persists, check the finance
            service is running.
          </EmptyHint>
        </EmptyState>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState>
          <EmptyTitle>No payments yet</EmptyTitle>
          <EmptyHint>Payments will appear here once the first one is recorded.</EmptyHint>
          {canCreate && (
            <NewButton style={{ marginTop: 20 }} onClick={() => navigate('/finance/payments/new')}>
              + New Payment
            </NewButton>
          )}
        </EmptyState>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Payment Number</Th>
                <Th>Date</Th>
                <Th>Vendor</Th>
                <Th>Method</Th>
                <Th>Reference #</Th>
                <Th style={{ textAlign: 'right' }}>Amount</Th>
                <Th>JE Number</Th>
                <Th>Created By</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((payment) => {
                const methodLabel = METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod;
                const methodColor = methodColors(theme)[payment.paymentMethod] ?? {
                  bg: 'rgba(180, 200, 220, 0.1)',
                  border: theme.colors.glass.border,
                  text: theme.colors.muted,
                };
                const isReversed = Boolean(payment.je?.reversedByJeNumber);
                const RowComponent = isReversed ? ReversedRow : ClickableRow;

                return (
                  <RowComponent
                    key={payment.paymentId}
                    onClick={() => handleRowClick(payment)}
                    aria-label={`View payment ${payment.paymentNumber}${isReversed ? ' (reversed)' : ''}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleRowClick(payment);
                      }
                    }}
                  >
                    <Td>
                      <code style={{ fontSize: 13, fontWeight: 600 }}>
                        {payment.paymentNumber}
                      </code>
                      {isReversed && (
                        <ReversedBadge title="The journal entry for this payment has been voided. The accounting impact is fully reversed.">
                          Reversed
                        </ReversedBadge>
                      )}
                    </Td>
                    <Td>{formatDate(payment.paymentDate)}</Td>
                    <Td>
                      {payment.vendorName ? (
                        <Tooltip>
                          <span style={{ fontWeight: 500 }}>{payment.vendorCode}</span>
                          <span>{payment.vendorName}</span>
                        </Tooltip>
                      ) : (
                        <span style={{ fontWeight: 500 }}>{payment.vendorCode}</span>
                      )}
                    </Td>
                    <Td>
                      <MethodPill $bg={methodColor.bg} $border={methodColor.border} $text={methodColor.text}>
                        {methodLabel}
                      </MethodPill>
                    </Td>
                    <Td>
                      {payment.referenceNumber ?? (
                        <span style={{ color: theme.colors.muted }}>—</span>
                      )}
                    </Td>
                    <Td
                      style={{
                        textAlign: 'right',
                        fontFamily: theme.typography.fontFamily.mono,
                        fontWeight: 600,
                        textDecoration: isReversed ? 'line-through' : 'none',
                        color: isReversed ? theme.colors.muted : undefined,
                      }}
                    >
                      {formatCurrency(payment.totalAmount, payment.currencyCode)}
                    </Td>
                    <Td>
                      {payment.jeId ? (
                        <JeLink
                          onClick={(e) => handleJeLinkClick(e, payment.paymentNumber)}
                          title="View linked journal entry"
                          aria-label={`View journal entry for ${payment.paymentNumber}`}
                        >
                          {/* jeNumber not in list response — use paymentNumber as search seed */}
                          View JE
                        </JeLink>
                      ) : (
                        <span style={{ color: theme.colors.muted, fontSize: 13 }}>—</span>
                      )}
                    </Td>
                    <Td style={{ fontSize: 13, color: theme.colors.muted }}>
                      {payment.createdBy}
                    </Td>
                  </RowComponent>
                );
              })}
            </tbody>
          </Table>

          <Pagination>
            <span>
              Showing {items.length} of {totalItems} payments
            </span>
            <PageButtons>
              <GhostButton
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </GhostButton>
              <span style={{ padding: '6px 12px', fontSize: 13 }}>
                Page {page} / {totalPages}
              </span>
              <GhostButton
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next
              </GhostButton>
            </PageButtons>
          </Pagination>
        </>
      )}
    </Container>
  );
}
