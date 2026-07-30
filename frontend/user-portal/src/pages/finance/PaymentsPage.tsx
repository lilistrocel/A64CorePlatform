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
import type { Theme } from '@a64core/shared';
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

// Payment method is categorical, not a status — one brand voice per method.
const methodColors = (theme: Theme): Record<PaymentMethod, { bg: string; text: string }> => ({
  bank_transfer: { bg: theme.colors.primary[100], text: theme.colors.primary[800] },
  cheque: { bg: theme.colors.gold[100], text: theme.colors.gold[800] },
  cash: { bg: theme.colors.emerald[100], text: theme.colors.emerald[800] },
});

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 12px;
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const ToolbarRow = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.textDisabled}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
`;

const FilterSelect = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
`;

const DateInput = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
`;

const DateLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
  display: flex;
  align-items: center;
`;

const NewButton = styled.button`
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
`;

const RefreshButton = styled.button`
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: ${({ theme }) => theme.colors.neutral[200]}; }
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

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const ClickableRow = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover { background: ${({ theme }) => theme.colors.neutral[50]}; }
`;

const MethodPill = styled.span<{ $bg: string; $text: string }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $bg }) => $bg};
  color: ${({ $text }) => $text};
`;

const ReversedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: ${({ theme }) => theme.colors.terracotta[100]};
  color: ${({ theme }) => theme.colors.terracotta[800]};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[300]};
  margin-left: 8px;
`;

const ReversedRow = styled(ClickableRow)`
  background: ${({ theme }) => theme.colors.neutral[50]};
  color: ${({ theme }) => theme.colors.textSecondary};
  /* Strike-through across the amount cell only — keep the rest readable */
`;

const JeLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.primary[600]};
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
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: ${({ theme }) => theme.colors.textPrimary};
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
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PageButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const GhostButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
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
    background: ${({ theme }) => theme.colors.textPrimary};
    color: ${({ theme }) => theme.colors.canvas};
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
      <Header>
        <Title>Vendor Payments</Title>
      </Header>

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
          <EmptyHint>
            Payments will appear here after they are recorded. Use "New Payment"
            to record the first vendor payment.
          </EmptyHint>
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
                  bg: theme.colors.neutral[100],
                  text: theme.colors.neutral[800],
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
                      <MethodPill $bg={methodColor.bg} $text={methodColor.text}>
                        {methodLabel}
                      </MethodPill>
                    </Td>
                    <Td>
                      {payment.referenceNumber ?? (
                        <span style={{ color: theme.colors.textDisabled }}>—</span>
                      )}
                    </Td>
                    <Td
                      style={{
                        textAlign: 'right',
                        fontFamily: theme.typography.fontFamily.mono,
                        fontWeight: 600,
                        textDecoration: isReversed ? 'line-through' : 'none',
                        color: isReversed ? theme.colors.textDisabled : undefined,
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
                        <span style={{ color: theme.colors.textDisabled, fontSize: 13 }}>—</span>
                      )}
                    </Td>
                    <Td style={{ fontSize: 13, color: theme.colors.textSecondary }}>
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
