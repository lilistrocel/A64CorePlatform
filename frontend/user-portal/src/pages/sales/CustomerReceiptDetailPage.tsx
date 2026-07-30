/**
 * CustomerReceiptDetailPage — Wave 3 (T-200.1)
 *
 * Shows a Customer Receipt header, allocations table, and contextual
 * action bar based on the receipt's current status.
 *
 * Action bar logic:
 *   DRAFT      → Edit, Post (DRAFT→OPEN), Delete
 *   OPEN       → Cancel (OPEN→CANCELLED) — super_admin only
 *   CANCELLED  → read-only
 *   CLOSED     → read-only (fully applied via credit notes or other flows)
 *
 * Allocations table shows each AR Invoice this receipt is applied to.
 * Clickable rows navigate to the corresponding AR Invoice detail page.
 *
 * Attachments via existing AttachmentList component.
 * NO Audit History button — Rule 4: finance audit_log only allows
 * FiscalPeriod and JournalEntry entity types.
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 *
 * Status badge colours (A20Core tokens — shared vocabulary across all
 * Wave 3 sales detail pages, see a20core-rebrand-spec.md):
 *   draft     → neutral      (neutral[100] / textSecondary)
 *   open      → emerald      (successBg / emerald[700])
 *   closed    → neutral (dark) (neutral[200] / neutral[800])
 *   cancelled → terracotta   (errorBg / terracotta[700])
 *
 * Route: /sales/customer-receipts/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { ExternalLink } from 'lucide-react';
import {
  useCustomerReceipt,
  useTransitionCustomerReceipt,
  useDeleteCustomerReceipt,
} from '../../hooks/queries/useCustomerReceipts';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import type { CustomerReceiptStatus, CustomerReceiptAllocation } from '../../services/salesApi';

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

const StatusBadge = styled.span<{ $status: CustomerReceiptStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 5px 14px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'draft': return theme.colors.neutral[100];
      case 'open': return theme.colors.successBg;
      case 'closed': return theme.colors.neutral[200];
      case 'cancelled': return theme.colors.errorBg;
      default: return theme.colors.neutral[100];
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'draft': return theme.colors.textSecondary;
      case 'open': return theme.colors.emerald[700];
      case 'closed': return theme.colors.neutral[800];
      case 'cancelled': return theme.colors.terracotta[700];
      default: return theme.colors.textSecondary;
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
  color: ${({ theme }) => theme.colors.onAccent};
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

const DangerButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.terracotta[600]};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.errorBg}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
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

const ClickableTr = styled.tr`
  cursor: pointer;
  &:hover td {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const AllocLink = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-weight: 500;
  &:hover { text-decoration: underline; }
`;

const UnallocatedRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 48px;
  font-size: 14px;
  padding: 10px 12px;
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  margin-top: 4px;
  font-weight: 600;
`;

const UnallocLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 140px;
`;

const UnallocValue = styled.span<{ $positive: boolean }>`
  font-variant-numeric: tabular-nums;
  min-width: 120px;
  text-align: right;
  color: ${({ $positive, theme }) => ($positive ? theme.colors.emerald[600] : theme.colors.textPrimary)};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  color: ${({ theme }) => theme.colors.terracotta[700]};
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

// ─── Delete confirmation modal ────────────────────────────────────────────────
// Does NOT close on overlay click — X button only (project rule).

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
  background: ${({ theme }) => theme.colors.background};
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

function statusLabel(status: CustomerReceiptStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'bank_transfer': return 'Bank Transfer';
    case 'cheque': return 'Cheque';
    case 'cash': return 'Cash';
    case 'card': return 'Card';
    default: return method;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerReceiptDetailPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { docId } = useParams<{ docId: string }>();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';
  const userRole = (user as { role?: string } | null)?.role ?? '';

  const { data: receipt, isLoading, isError } = useCustomerReceipt(docId, orgId);
  const transitionMutation = useTransitionCustomerReceipt();
  const deleteMutation = useDeleteCustomerReceipt();

  const [actionError, setActionError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const handlePost = async () => {
    if (!receipt) return;
    setActionError(null);
    setTransitioning(true);
    try {
      const result = await transitionMutation.mutateAsync({
        docId: receipt.docEntry,
        transition: { newStatus: 'open', reason: null },
        orgId,
      });
      navigate(`/sales/customer-receipts/${result.docEntry}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to post Customer Receipt.',
      );
    } finally {
      setTransitioning(false);
    }
  };

  const handleCancel = async () => {
    if (!receipt) return;
    setActionError(null);
    setTransitioning(true);
    try {
      const result = await transitionMutation.mutateAsync({
        docId: receipt.docEntry,
        transition: { newStatus: 'cancelled', reason: 'Cancelled by user' },
        orgId,
      });
      navigate(`/sales/customer-receipts/${result.docEntry}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to cancel Customer Receipt.',
      );
    } finally {
      setTransitioning(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!receipt) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync({ docId: receipt.docEntry, orgId });
      navigate('/sales/customer-receipts');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to delete Customer Receipt.',
      );
      setShowDeleteModal(false);
    }
  };

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/customer-receipts')}>
          ← Customer Receipts
        </BackLink>
        <EmptyState>Loading Customer Receipt…</EmptyState>
      </Container>
    );
  }

  if (isError || !receipt) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/customer-receipts')}>
          ← Customer Receipts
        </BackLink>
        <ErrorBanner>Customer Receipt not found or failed to load.</ErrorBanner>
      </Container>
    );
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const isDraft = receipt.status === 'draft';
  const isOpen = receipt.status === 'open';
  const isReadOnly = ['closed', 'cancelled'].includes(receipt.status);
  const isSuperAdmin = userRole === 'super_admin';

  return (
    <Container>
      <BackLink
        onClick={() => navigate('/sales/customer-receipts')}
        aria-label="Back to Customer Receipts list"
      >
        ← Customer Receipts
      </BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>Customer Receipt {receipt.docNumber}</Title>
          <StatusBadge
            $status={receipt.status}
            aria-label={`Status: ${statusLabel(receipt.status)}`}
          >
            {statusLabel(receipt.status)}
          </StatusBadge>
        </TitleGroup>

        <ActionBar>
          {isDraft && (
            <>
              <SecondaryButton
                onClick={() =>
                  navigate(`/sales/customer-receipts/${receipt.docEntry}/edit`)
                }
                aria-label="Edit this Customer Receipt"
              >
                Edit
              </SecondaryButton>
              <PrimaryButton
                onClick={handlePost}
                disabled={transitioning}
                aria-label="Post receipt (DRAFT → OPEN)"
              >
                {transitioning ? 'Posting…' : 'Post Receipt'}
              </PrimaryButton>
              <DangerButton
                onClick={() => setShowDeleteModal(true)}
                aria-label="Delete this Customer Receipt"
              >
                Delete
              </DangerButton>
            </>
          )}
          {isOpen && isSuperAdmin && (
            <DangerButton
              onClick={handleCancel}
              disabled={transitioning}
              aria-label="Cancel this Customer Receipt (super_admin only)"
            >
              {transitioning ? 'Cancelling…' : 'Cancel Receipt'}
            </DangerButton>
          )}
          {/* T-200.x: Audit History — now wired to sales-side endpoint */}
          <GhostButton
            onClick={() => setShowAuditModal(true)}
            aria-label="Open audit history for this Customer Receipt"
          >
            Audit History
          </GhostButton>
        </ActionBar>
      </TitleRow>

      {actionError && <ErrorBanner role="alert">{actionError}</ErrorBanner>}

      {/* ── Header info grid ── */}
      <Card>
        <CardTitle>Receipt Details</CardTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Customer</InfoLabel>
            <InfoValue>{receipt.customerName}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Customer Ref</InfoLabel>
            <InfoValue>{receipt.bpRefNo || '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Receipt Date</InfoLabel>
            <InfoValue>{formatDate(receipt.docDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Payment Method</InfoLabel>
            <InfoValue>{paymentMethodLabel(receipt.paymentMethod)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Payment Reference</InfoLabel>
            <InfoValue>{receipt.paymentRef || '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Bank Account</InfoLabel>
            <InfoValue>{receipt.bankAccountId || '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Currency</InfoLabel>
            <InfoValue>
              {receipt.currency}
              {receipt.exchangeRate !== 1 ? ` (Rate: ${receipt.exchangeRate})` : ''}
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Amount Received</InfoLabel>
            <InfoValueBold>
              {formatAmount(receipt.amountReceived, receipt.currency)}
            </InfoValueBold>
          </InfoItem>
          {receipt.unallocatedAmount > 0 && (
            <InfoItem>
              <InfoLabel>Unallocated Amount</InfoLabel>
              <InfoValue style={{ color: theme.colors.gold[600] }}>
                {formatAmount(receipt.unallocatedAmount, receipt.currency)}
              </InfoValue>
            </InfoItem>
          )}
          {receipt.journalMemo && (
            <InfoItem style={{ gridColumn: 'span 2' }}>
              <InfoLabel>Journal Memo</InfoLabel>
              <InfoValue>{receipt.journalMemo}</InfoValue>
            </InfoItem>
          )}
          {receipt.notes && (
            <InfoItem style={{ gridColumn: 'span 2' }}>
              <InfoLabel>Notes</InfoLabel>
              <InfoValue>{receipt.notes}</InfoValue>
            </InfoItem>
          )}
          <InfoItem>
            <InfoLabel>Created</InfoLabel>
            <InfoValueMuted>
              {formatDate(receipt.createdAt)} by {receipt.createdBy}
            </InfoValueMuted>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Updated</InfoLabel>
            <InfoValueMuted>
              {formatDate(receipt.updatedAt)} by {receipt.updatedBy}
            </InfoValueMuted>
          </InfoItem>
        </InfoGrid>
      </Card>

      {/* ── Allocations table ── */}
      <Card>
        <CardTitle>AR Invoice Allocations</CardTitle>
        {receipt.allocations.length === 0 ? (
          <EmptyState style={{ padding: '24px' }}>
            No allocations attached to this receipt.
          </EmptyState>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>AR Invoice</Th>
                    <ThRight>Amount Applied</ThRight>
                    <Th>Currency</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.allocations.map((alloc: CustomerReceiptAllocation, idx: number) => (
                    <ClickableTr
                      key={`${alloc.arInvoiceDocEntry}-${idx}`}
                      onClick={() =>
                        navigate(`/sales/ar-invoices/${alloc.arInvoiceDocEntry}`)
                      }
                      aria-label={`Open AR Invoice ${alloc.arInvoiceDocNumber}`}
                    >
                      <Td>{alloc.allocationLineNumber}</Td>
                      <Td>
                        <AllocLink>
                          <ExternalLink size={13} />
                          {alloc.arInvoiceDocNumber}
                        </AllocLink>
                      </Td>
                      <TdRight>
                        <strong>{formatAmount(Number(alloc.amountApplied))}</strong>
                      </TdRight>
                      <Td>{alloc.currencyApplied || receipt.currency}</Td>
                      <Td>{alloc.notes || '—'}</Td>
                    </ClickableTr>
                  ))}
                </tbody>
              </Table>
            </div>

            <UnallocatedRow>
              <UnallocLabel>Total Received:</UnallocLabel>
              <UnallocValue $positive={false}>
                {formatAmount(receipt.amountReceived, receipt.currency)}
              </UnallocValue>
            </UnallocatedRow>
            {receipt.unallocatedAmount > 0 && (
              <UnallocatedRow style={{ borderTop: 'none', fontWeight: 400, fontSize: '13px' }}>
                <UnallocLabel>Unallocated:</UnallocLabel>
                <UnallocValue $positive={true}>
                  {formatAmount(receipt.unallocatedAmount, receipt.currency)}
                </UnallocValue>
              </UnallocatedRow>
            )}
          </>
        )}
      </Card>

      {/* ── Attachments ── */}
      <Card>
        <CardTitle>Attachments</CardTitle>
        {/* CUSTOMER_RECEIPT added to AttachmentDocType in T-200.1.
            Backend endpoint to be wired in a follow-up task —
            the component handles 404 gracefully. */}
        {docId && orgId && (
          <AttachmentList
            docType="CUSTOMER_RECEIPT"
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
            <ModalTitle id="delete-modal-title">Delete Customer Receipt?</ModalTitle>
            <ModalBody>
              This will permanently delete{' '}
              <strong>{receipt.docNumber}</strong>. This action cannot be
              undone. Only DRAFT receipts can be deleted.
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
      {receipt && (
        <SalesAuditHistoryModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          organizationId={orgId}
          docType="CUSTOMER_RECEIPT"
          docEntry={receipt.docEntry}
          docLabel={receipt.docNumber}
          viewerRole={userRole}
        />
      )}
    </Container>
  );
}

export default CustomerReceiptDetailPage;
