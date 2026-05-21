/**
 * PaymentDetailPage
 *
 * Shows a vendor payment's header info, applied invoices table, and linked JE
 * inline summary. Provides a "Reverse this payment" affordance that redirects
 * into the existing JE reversal flow (JournalEntriesPage?search=jeNumber).
 *
 * Payments are immutable in v1 — no edit or delete actions are shown.
 *
 * Role gating: accountant, finance_admin, auditor, admin, super_admin.
 * Route: /finance/payments/:paymentId
 */

import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { usePayment } from '../../hooks/queries/usePayments';
import { useAuthStore } from '../../stores/auth.store';
import type { PaymentMethod } from '../../services/paymentsService';
import { AttachmentList } from '../../components/attachments/AttachmentList';

// ─── Role constants ───────────────────────────────────────────────────────────

const REVERSE_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

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

const METHOD_COLORS: Record<PaymentMethod, { bg: string; text: string }> = {
  bank_transfer: { bg: '#dbeafe', text: '#1e40af' },
  cheque: { bg: '#fef9c3', text: '#854d0e' },
  cash: { bg: '#dcfce7', text: '#166534' },
};

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
`;

const BackLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  &:hover { text-decoration: underline; }
`;

const PageHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 28px;
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const TitleSubLine = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const ActionsRow = styled.div`
  display: flex;
  gap: 10px;
  flex-shrink: 0;
`;

const ReverseButton = styled.button`
  padding: 9px 18px;
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: #fee2e2; }
`;

const ReversedBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  margin-bottom: 20px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-left: 4px solid #dc2626;
  border-radius: 8px;
  color: #7f1d1d;
  font-size: 14px;
  line-height: 1.5;
`;

const ReversedTag = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
  margin-left: 10px;
  vertical-align: middle;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: 24px 28px;
  margin-bottom: 20px;
`;

const CardTitle = styled.h2`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 0 0 20px;
`;

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px 32px;
`;

const MetaField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const MetaLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const MetaValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TotalAmount = styled.span`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-variant-numeric: tabular-nums;
`;

const MethodPill = styled.span<{ $bg: string; $text: string }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $bg }) => $bg};
  color: ${({ $text }) => $text};
`;

const NotesText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.6;
  margin: 0;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: 6px;
  padding: 10px 14px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 10px 12px;
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
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const TdRight = styled(Td)`
  text-align: right;
  font-family: monospace;
  font-weight: 600;
`;

const InvoiceLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.primary[600] || theme.colors.primary[500]};
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  font-family: monospace;
  font-weight: 600;
  &:hover { opacity: 0.75; }
`;

const JeSummaryRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const JeLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.primary[600] || theme.colors.primary[500]};
  font-size: 14px;
  cursor: pointer;
  text-decoration: underline;
  font-weight: 600;
  &:hover { opacity: 0.75; }
`;

const JeInlineSummary = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: 6px;
  padding: 4px 10px;
  font-family: monospace;
`;

const TotalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 24px;
  align-items: baseline;
  padding-top: 12px;
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  margin-top: 4px;
`;

const TotalLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TotalValue = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: monospace;
`;

const LoadingState = styled.div`
  padding: 48px;
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorState = styled.div`
  padding: 48px;
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.error || '#ef4444'};
`;

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PaymentDetailPage() {
  const navigate = useNavigate();
  const { paymentId } = useParams<{ paymentId: string }>();
  const { user } = useAuthStore();
  const organizationId = user?.organizationId ?? '';

  const canReverse = REVERSE_ROLES.has(user?.role ?? '');

  const { data: payment, isLoading, isError } = usePayment(
    paymentId ?? null,
    organizationId
  );

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/finance/payments')}>&larr; Back to Payments</BackLink>
        <LoadingState>Loading payment details...</LoadingState>
      </Container>
    );
  }

  if (isError || !payment) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/finance/payments')}>&larr; Back to Payments</BackLink>
        <ErrorState>
          Failed to load payment. It may not exist or you may not have access.
        </ErrorState>
      </Container>
    );
  }

  const methodLabel = METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod;
  const methodColor = METHOD_COLORS[payment.paymentMethod] ?? { bg: '#f3f4f6', text: '#374151' };
  const isReversed = Boolean(payment.je?.reversedByJeNumber);

  const applicationsTotal = payment.applications.reduce(
    (sum, a) => sum + (parseFloat(a.amountApplied) || 0),
    0
  );

  const handleReverseClick = () => {
    if (payment.je?.jeNumber) {
      // Redirect to JournalEntriesPage pre-filtered to this JE so user can
      // click "Reverse Entry" from the existing reversal flow.
      navigate(
        `/finance/journal-entries?search=${encodeURIComponent(payment.je.jeNumber)}`
      );
    }
  };

  const handleInvoiceClick = (apDocId: string) => {
    navigate(`/purchasing/ap/${apDocId}`);
  };

  const handleJeClick = () => {
    if (payment.je?.jeNumber) {
      navigate(
        `/finance/journal-entries?search=${encodeURIComponent(payment.je.jeNumber)}`
      );
    }
  };

  return (
    <Container>
      <BackLink onClick={() => navigate('/finance/payments')}>&larr; Back to Payments</BackLink>

      <PageHeader>
        <div>
          <PageTitle>
            <code style={{ fontSize: 24 }}>{payment.paymentNumber}</code>
            {isReversed && <ReversedTag>Reversed</ReversedTag>}
          </PageTitle>
          <TitleSubLine>
            {formatDate(payment.paymentDate)} &middot; {payment.vendorCode}
            {payment.vendorName ? ` — ${payment.vendorName}` : ''}
          </TitleSubLine>
        </div>
        <ActionsRow>
          {canReverse && payment.je && !isReversed && (
            <ReverseButton
              type="button"
              onClick={handleReverseClick}
              aria-label="Reverse this payment via journal entry reversal"
              title="Redirects to the linked journal entry where you can trigger a reversal"
            >
              Reverse this Payment
            </ReverseButton>
          )}
        </ActionsRow>
      </PageHeader>

      {isReversed && (
        <ReversedBanner role="status" aria-live="polite">
          <strong>This payment has been reversed.</strong>
          {' '}A reversing journal entry{' '}
          {payment.je?.reversedByJeNumber ? <code>({payment.je.reversedByJeNumber})</code> : null}
          {' '}has been posted against the original{' '}
          {payment.je?.jeNumber ? <code>({payment.je.jeNumber})</code> : null}.
          Both entries remain on the books for audit and net to zero — the accounting impact
          is fully cancelled.
        </ReversedBanner>
      )}

      {/* Payment Header Card */}
      <Card>
        <CardTitle>Payment Details</CardTitle>
        <MetaGrid>
          <MetaField>
            <MetaLabel>Payment Number</MetaLabel>
            <MetaValue>
              <code style={{ fontWeight: 600 }}>{payment.paymentNumber}</code>
            </MetaValue>
          </MetaField>
          <MetaField>
            <MetaLabel>Payment Date</MetaLabel>
            <MetaValue>{formatDate(payment.paymentDate)}</MetaValue>
          </MetaField>
          <MetaField>
            <MetaLabel>Vendor</MetaLabel>
            <MetaValue>
              <strong>{payment.vendorCode}</strong>
              {payment.vendorName && (
                <span style={{ fontWeight: 400, marginLeft: 6, color: '#6b7280' }}>
                  {payment.vendorName}
                </span>
              )}
            </MetaValue>
          </MetaField>
          <MetaField>
            <MetaLabel>Method</MetaLabel>
            <MetaValue>
              <MethodPill $bg={methodColor.bg} $text={methodColor.text}>
                {methodLabel}
              </MethodPill>
            </MetaValue>
          </MetaField>
          <MetaField>
            <MetaLabel>Reference #</MetaLabel>
            <MetaValue>
              {payment.referenceNumber ?? <span style={{ color: '#9ca3af' }}>—</span>}
            </MetaValue>
          </MetaField>
          <MetaField>
            <MetaLabel>Currency</MetaLabel>
            <MetaValue>{payment.currencyCode}</MetaValue>
          </MetaField>
          <MetaField>
            <MetaLabel>Total Amount</MetaLabel>
            <TotalAmount>
              {formatCurrency(payment.totalAmount, payment.currencyCode)}
            </TotalAmount>
          </MetaField>
          <MetaField>
            <MetaLabel>Created By</MetaLabel>
            <MetaValue>{payment.createdBy}</MetaValue>
          </MetaField>
          <MetaField>
            <MetaLabel>Company</MetaLabel>
            <MetaValue>{payment.companyCode}</MetaValue>
          </MetaField>
        </MetaGrid>

        {payment.notes && (
          <div style={{ marginTop: 20 }}>
            <MetaLabel style={{ display: 'block', marginBottom: 8 }}>Notes</MetaLabel>
            <NotesText>{payment.notes}</NotesText>
          </div>
        )}
      </Card>

      {/* Applied Invoices */}
      <Card>
        <CardTitle>Applied Invoices ({payment.applications.length})</CardTitle>
        {payment.applications.length === 0 ? (
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            No invoice applications recorded.
          </p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>AP Document Number</Th>
                  <Th style={{ textAlign: 'right' }}>Amount Applied</Th>
                </tr>
              </thead>
              <tbody>
                {payment.applications.map((app, idx) => (
                  <tr key={app.applicationId}>
                    <Td style={{ color: '#6b7280', width: 48 }}>{idx + 1}</Td>
                    <Td>
                      <InvoiceLink
                        onClick={() => handleInvoiceClick(app.apDocId)}
                        title={`View AP invoice ${app.apDocNumber}`}
                        aria-label={`View AP invoice ${app.apDocNumber}`}
                      >
                        {app.apDocNumber}
                      </InvoiceLink>
                    </Td>
                    <TdRight>
                      {formatCurrency(app.amountApplied, payment.currencyCode)}
                    </TdRight>
                  </tr>
                ))}
              </tbody>
            </Table>
            <TotalFooter>
              <TotalLabel>Total Applied</TotalLabel>
              <TotalValue>
                {formatCurrency(applicationsTotal, payment.currencyCode)}
              </TotalValue>
            </TotalFooter>
          </>
        )}
      </Card>

      {/* Linked Journal Entry */}
      {payment.je && (
        <Card>
          <CardTitle>Linked Journal Entry</CardTitle>
          <JeSummaryRow>
            <JeLink
              onClick={handleJeClick}
              aria-label={`View journal entry ${payment.je.jeNumber}`}
            >
              <code style={{ fontSize: 14 }}>{payment.je.jeNumber}</code>
            </JeLink>
            {isReversed && <ReversedTag style={{ marginLeft: 0 }}>Reversed</ReversedTag>}
            <JeInlineSummary>
              DR AP {formatCurrency(payment.je.totalDebit, payment.currencyCode)}
              {'  /  '}
              CR Bank {formatCurrency(payment.je.totalCredit, payment.currencyCode)}
            </JeInlineSummary>
          </JeSummaryRow>
          {canReverse && !isReversed && (
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12, marginBottom: 0 }}>
              To reverse this payment, click "Reverse this Payment" above. This will
              navigate to the linked journal entry where you can trigger the reversal.
            </p>
          )}
        </Card>
      )}

      {/* Attachments — payments are always-mutable for attachments */}
      <Card>
        <AttachmentList
          docType="PAYMENT"
          docId={paymentId!}
          organizationId={organizationId}
          readOnly={false}
        />
      </Card>
    </Container>
  );
}
