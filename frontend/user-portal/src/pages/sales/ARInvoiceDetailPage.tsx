/**
 * ARInvoiceDetailPage — Wave 3 (T-200.0)
 *
 * Shows AR Invoice header, lines, totals, doc-chain card, and contextual
 * action bar based on the invoice's current status.
 *
 * Action bar logic (mirrors SAP B1 AR Invoice lifecycle):
 *   DRAFT            → Edit, Post (DRAFT→OPEN), Delete
 *   OPEN             → Cancel (OPEN→CANCELLED) — super_admin only
 *   PENDING_APPROVAL → read-only (no UI actions in T-200.0)
 *   PARTLY_CLOSED / CLOSED / CANCELLED → read-only
 *
 * Doc-chain card shows:
 *   - Base Delivery link (if baseDocRef.docType == "DELIVERY")
 *   - Target links (Customer Receipts, Credit Notes allocated against this ARI)
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * Route: /sales/ar-invoices/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { Link2, ExternalLink } from 'lucide-react';
import { useArInvoice, useTransitionArInvoice, useDeleteArInvoice } from '../../hooks/queries/useArInvoices';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import type { ARInvoiceStatus, ARInvoiceLine } from '../../services/salesApi';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1280px;
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

const TitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
`;

const TitleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const StatusBadge = styled.span<{ $status: ARInvoiceStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 5px 14px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#f3f4f6';
      case 'pending_approval': return '#fef3c7';
      case 'open': return '#ecfdf5';
      case 'partly_closed': return '#eff6ff';
      case 'closed': return '#ede9fe';
      case 'cancelled': return '#fef2f2';
      default: return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#6b7280';
      case 'pending_approval': return '#92400e';
      case 'open': return '#059669';
      case 'partly_closed': return '#2563eb';
      case 'closed': return '#5b21b6';
      case 'cancelled': return '#dc2626';
      default: return '#6b7280';
    }
  }};
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const DangerButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.error || '#dc2626'};
  border: 1px solid ${({ theme }) => theme.colors.error || '#dc2626'};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.errorBg || '#fef2f2'};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const GhostButton = styled.button`
  padding: 10px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const InfoValueBold = styled(InfoValue)`
  font-weight: 600;
  font-size: 16px;
`;

const InfoValueMuted = styled(InfoValue)`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  padding: 10px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const ThRight = styled(Th)`
  text-align: right;
`;

const Td = styled.td`
  padding: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const TdRight = styled(Td)`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const TotalsRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 48px;
  font-size: 14px;
  padding: 8px 12px;
`;

const TotalsLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 120px;
`;

const TotalsValue = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  min-width: 120px;
  text-align: right;
`;

const TotalsGross = styled(TotalsRow)`
  font-size: 16px;
  font-weight: 700;
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  margin-top: 4px;
  padding-top: 12px;
`;

const DocChainLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: 14px;
  text-decoration: none;
  &:hover { text-decoration: underline; }
`;

const DocChainItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  &:last-child { border-bottom: none; }
`;

const DocChainType = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 100px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg || '#fef2f2'};
  color: ${({ theme }) => theme.colors.error || '#dc2626'};
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
// Inline modal — does NOT close on overlay click (project rule).

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
`;

const ModalBox = styled.div`
  background: white;
  border-radius: 12px;
  padding: 28px;
  max-width: 460px;
  width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 12px 0;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ModalBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 24px 0;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatAmount(value: number, currency = ''): string {
  const formatted = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function statusLabel(status: ARInvoiceStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'pending_approval': return 'Pending Approval';
    case 'open': return 'Open';
    case 'partly_closed': return 'Partly Closed';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function docTypeLabel(docType: string): string {
  switch (docType) {
    case 'DELIVERY': return 'Delivery Note';
    case 'CUSTOMER_RECEIPT': return 'Customer Receipt';
    case 'AR_CREDIT_NOTE': return 'AR Credit Note';
    case 'AR_INVOICE': return 'AR Invoice';
    default: return docType;
  }
}

function docTypeRoute(docType: string, docEntry: string): string {
  switch (docType) {
    case 'DELIVERY': return `/sales/deliveries/${docEntry}`;
    case 'CUSTOMER_RECEIPT': return `/sales/customer-receipts/${docEntry}`;
    case 'AR_CREDIT_NOTE': return `/sales/ar-credit-notes/${docEntry}`;
    default: return `/sales/${docType.toLowerCase()}/${docEntry}`;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ARInvoiceDetailPage() {
  const navigate = useNavigate();
  const { docId } = useParams<{ docId: string }>();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';
  const userRole = (user as { role?: string } | null)?.role ?? '';

  const { data: invoice, isLoading, isError } = useArInvoice(docId, orgId);
  const transitionMutation = useTransitionArInvoice();
  const deleteMutation = useDeleteArInvoice();

  const [actionError, setActionError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const handlePost = async () => {
    if (!invoice) return;
    setActionError(null);
    setTransitioning(true);
    try {
      const result = await transitionMutation.mutateAsync({
        docId: invoice.docEntry,
        transition: { newStatus: 'open', reason: null },
        orgId,
      });
      navigate(`/sales/ar-invoices/${result.docEntry}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to post invoice.',
      );
    } finally {
      setTransitioning(false);
    }
  };

  const handleCancel = async () => {
    if (!invoice) return;
    setActionError(null);
    setTransitioning(true);
    try {
      const result = await transitionMutation.mutateAsync({
        docId: invoice.docEntry,
        transition: { newStatus: 'cancelled', reason: 'Cancelled by user' },
        orgId,
      });
      navigate(`/sales/ar-invoices/${result.docEntry}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to cancel invoice.',
      );
    } finally {
      setTransitioning(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!invoice) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync({ docId: invoice.docEntry, orgId });
      navigate('/sales/ar-invoices');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to delete invoice.',
      );
      setShowDeleteModal(false);
    }
  };

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/ar-invoices')}>← AR Invoices</BackLink>
        <EmptyState>Loading AR Invoice…</EmptyState>
      </Container>
    );
  }

  if (isError || !invoice) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/ar-invoices')}>← AR Invoices</BackLink>
        <ErrorBanner>AR Invoice not found or failed to load.</ErrorBanner>
      </Container>
    );
  }

  const isDraft = invoice.status === 'draft';
  const isOpen = invoice.status === 'open';
  const isReadOnly = ['partly_closed', 'closed', 'cancelled', 'pending_approval'].includes(
    invoice.status,
  );
  const isSuperAdmin = userRole === 'super_admin';

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/ar-invoices')} aria-label="Back to AR Invoices list">
        ← AR Invoices
      </BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>AR Invoice {invoice.docNumber}</Title>
          <StatusBadge $status={invoice.status} aria-label={`Status: ${statusLabel(invoice.status)}`}>
            {statusLabel(invoice.status)}
          </StatusBadge>
        </TitleGroup>

        <ActionBar>
          {isDraft && (
            <>
              <SecondaryButton
                onClick={() => navigate(`/sales/ar-invoices/${invoice.docEntry}/edit`)}
                aria-label="Edit this AR Invoice"
              >
                Edit
              </SecondaryButton>
              <PrimaryButton
                onClick={handlePost}
                disabled={transitioning}
                aria-label="Post invoice (DRAFT → OPEN)"
              >
                {transitioning ? 'Posting…' : 'Post Invoice'}
              </PrimaryButton>
              <DangerButton
                onClick={() => setShowDeleteModal(true)}
                aria-label="Delete this AR Invoice"
              >
                Delete
              </DangerButton>
            </>
          )}
          {isOpen && (
            <PrimaryButton
              onClick={() =>
                navigate(`/sales/customer-receipts/from-invoice/${invoice.docEntry}`)
              }
              aria-label="Receive payment for this AR Invoice"
            >
              Receive Payment
            </PrimaryButton>
          )}
          {/* Issue Credit Note — direct financial reversal without physical return.
              Used for discounts, billing corrections, customer refunds without goods movement.
              Available when ARI is open (creditedAmount < gross and openAmount > 0). */}
          {isOpen && (
            <SecondaryButton
              onClick={() =>
                navigate(`/sales/ar-credit-notes/from-invoice/${invoice.docEntry}`)
              }
              aria-label="Issue a credit note against this AR Invoice"
            >
              Issue Credit Note
            </SecondaryButton>
          )}
          {isOpen && isSuperAdmin && (
            <DangerButton
              onClick={handleCancel}
              disabled={transitioning}
              aria-label="Cancel this AR Invoice"
            >
              {transitioning ? 'Cancelling…' : 'Cancel Invoice'}
            </DangerButton>
          )}
          {/* T-200.x: Audit History button — now wired to the sales-side
              audit endpoint via SalesAuditHistoryModal. Visible on ALL
              statuses (read-only view — does not mutate the document). */}
          <GhostButton
            onClick={() => setShowAuditModal(true)}
            aria-label="Open audit history for this AR Invoice"
          >
            Audit History
          </GhostButton>
        </ActionBar>
      </TitleRow>

      {actionError && <ErrorBanner>{actionError}</ErrorBanner>}

      {/* ── Info Grid ── */}
      <Card>
        <CardTitle>Invoice Details</CardTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Customer</InfoLabel>
            <InfoValue>{invoice.customerName}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>BP Ref No</InfoLabel>
            <InfoValue>{invoice.bpRefNo || '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Doc Date</InfoLabel>
            <InfoValue>{formatDate(invoice.docDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Date of Supply</InfoLabel>
            <InfoValue>{formatDate(invoice.dateOfSupply)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Invoice Date</InfoLabel>
            <InfoValue>{formatDate(invoice.invoiceDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Tax Point Date</InfoLabel>
            <InfoValue>{formatDate(invoice.taxDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Due Date</InfoLabel>
            <InfoValue>{formatDate(invoice.dueDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Currency</InfoLabel>
            <InfoValue>
              {invoice.currency}
              {invoice.exchangeRate !== 1 ? ` (Rate: ${invoice.exchangeRate})` : ''}
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Total Amount</InfoLabel>
            <InfoValueBold>
              {formatAmount(invoice.totals.gross, invoice.currency)}
            </InfoValueBold>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Paid Amount</InfoLabel>
            <InfoValue>{formatAmount(invoice.totals.paidAmount, invoice.currency)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Credited Amount</InfoLabel>
            <InfoValue>{formatAmount(invoice.totals.creditedAmount, invoice.currency)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Open Amount</InfoLabel>
            <InfoValueBold style={{ color: invoice.totals.openAmount > 0 ? '#059669' : undefined }}>
              {formatAmount(invoice.totals.openAmount, invoice.currency)}
            </InfoValueBold>
          </InfoItem>
          {invoice.journalMemo && (
            <InfoItem style={{ gridColumn: 'span 2' }}>
              <InfoLabel>Journal Memo</InfoLabel>
              <InfoValue>{invoice.journalMemo}</InfoValue>
            </InfoItem>
          )}
          {invoice.notes && (
            <InfoItem style={{ gridColumn: 'span 2' }}>
              <InfoLabel>Notes</InfoLabel>
              <InfoValue>{invoice.notes}</InfoValue>
            </InfoItem>
          )}
          <InfoItem>
            <InfoLabel>Created</InfoLabel>
            <InfoValueMuted>
              {formatDate(invoice.createdAt)} by {invoice.createdBy}
            </InfoValueMuted>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Updated</InfoLabel>
            <InfoValueMuted>
              {formatDate(invoice.updatedAt)} by {invoice.updatedBy}
            </InfoValueMuted>
          </InfoItem>
        </InfoGrid>
      </Card>

      {/* ── Lines table ── */}
      <Card>
        <CardTitle>Invoice Lines</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Item Code</Th>
                <Th>Description</Th>
                <ThRight>Qty</ThRight>
                <Th>UoM</Th>
                <ThRight>Unit Price</ThRight>
                <ThRight>Disc %</ThRight>
                <ThRight>Line Net</ThRight>
                <Th>Tax Code</Th>
                <ThRight>Tax %</ThRight>
                <ThRight>Tax Amt</ThRight>
                <ThRight>Line Gross</ThRight>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line: ARInvoiceLine) => (
                <tr key={line.lineId}>
                  <Td>{line.lineNumber}</Td>
                  <Td>
                    <strong>{line.itemCode}</strong>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginTop: '2px',
                      }}
                    >
                      {line.itemName}
                    </span>
                  </Td>
                  <Td>{line.description}</Td>
                  <TdRight>{formatAmount(Number(line.quantity))}</TdRight>
                  <Td>{line.uom}</Td>
                  <TdRight>{formatAmount(Number(line.unitPrice))}</TdRight>
                  <TdRight>{Number(line.discountPercent).toFixed(2)}%</TdRight>
                  <TdRight>{formatAmount(Number(line.lineNet))}</TdRight>
                  <Td>{line.taxCodeId || '—'}</Td>
                  <TdRight>{Number(line.taxPercent).toFixed(2)}%</TdRight>
                  <TdRight>{formatAmount(Number(line.lineTax))}</TdRight>
                  <TdRight>
                    <strong>{formatAmount(Number(line.lineGross))}</strong>
                  </TdRight>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        {/* Totals */}
        <div style={{ marginTop: '16px' }}>
          <TotalsRow>
            <TotalsLabel>Net Amount</TotalsLabel>
            <TotalsValue>
              {formatAmount(invoice.totals.net)} {invoice.currency}
            </TotalsValue>
          </TotalsRow>
          <TotalsRow>
            <TotalsLabel>Tax Amount</TotalsLabel>
            <TotalsValue>
              {formatAmount(invoice.totals.tax)} {invoice.currency}
            </TotalsValue>
          </TotalsRow>
          <TotalsGross>
            <TotalsLabel>Total (Gross)</TotalsLabel>
            <TotalsValue>
              {formatAmount(invoice.totals.gross)} {invoice.currency}
            </TotalsValue>
          </TotalsGross>
        </div>
      </Card>

      {/* ── Doc chain card ── */}
      {(invoice.baseDocRef || invoice.targetDocRefs.length > 0) && (
        <Card>
          <CardTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link2 size={16} />
              Document Chain
            </div>
          </CardTitle>

          {invoice.baseDocRef && (
            <DocChainItem>
              <DocChainType>Base Document</DocChainType>
              <DocChainLink
                href={docTypeRoute(
                  invoice.baseDocRef.docType,
                  invoice.baseDocRef.docId,
                )}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(
                    docTypeRoute(
                      invoice.baseDocRef!.docType,
                      invoice.baseDocRef!.docId,
                    ),
                  );
                }}
                aria-label={`Open ${docTypeLabel(invoice.baseDocRef.docType)} ${invoice.baseDocRef.docNumber}`}
              >
                <ExternalLink size={14} />
                {docTypeLabel(invoice.baseDocRef.docType)}{' '}
                {invoice.baseDocRef.docNumber}
              </DocChainLink>
            </DocChainItem>
          )}

          {invoice.targetDocRefs.map((ref, i) => (
            <DocChainItem key={`${ref.docId}-${i}`}>
              <DocChainType>{docTypeLabel(ref.docType)}</DocChainType>
              <DocChainLink
                href={docTypeRoute(ref.docType, ref.docId)}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(docTypeRoute(ref.docType, ref.docId));
                }}
                aria-label={`Open ${docTypeLabel(ref.docType)} ${ref.docNumber}`}
              >
                <ExternalLink size={14} />
                {ref.docNumber}
              </DocChainLink>
            </DocChainItem>
          ))}
        </Card>
      )}

      {/* ── Attachments ── */}
      <Card>
        <CardTitle>Attachments</CardTitle>
        {/* AttachmentDocType has been extended to include 'AR_INVOICE' (T-200.0).
            The backend attachment endpoint for AR_INVOICE is a follow-up task —
            the component handles 404 gracefully (shows empty list, no crash). */}
        {docId && orgId && (
          <AttachmentList
            docType="AR_INVOICE"
            docId={docId}
            organizationId={orgId}
            readOnly={isReadOnly}
          />
        )}
      </Card>

      {/* ── Delete confirmation modal ── */}
      {showDeleteModal && (
        <ModalOverlay
          // Intentionally does NOT close on overlay click — project rule.
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalTitle id="delete-modal-title">Delete AR Invoice?</ModalTitle>
            <ModalBody>
              This will permanently delete{' '}
              <strong>{invoice.docNumber}</strong>. This action cannot be
              undone. Only DRAFT invoices can be deleted.
            </ModalBody>
            <ModalActions>
              <SecondaryButton
                onClick={() => setShowDeleteModal(false)}
                aria-label="Cancel deletion"
              >
                Cancel
              </SecondaryButton>
              <DangerButton
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                aria-label="Confirm deletion"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </DangerButton>
            </ModalActions>
          </ModalBox>
        </ModalOverlay>
      )}

      {/* T-200.x: Sales-side audit history modal */}
      {invoice && (
        <SalesAuditHistoryModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          organizationId={orgId}
          docType="AR_INVOICE"
          docEntry={invoice.docEntry}
          docLabel={invoice.docNumber}
          viewerRole={userRole}
        />
      )}
    </Container>
  );
}

export default ARInvoiceDetailPage;
