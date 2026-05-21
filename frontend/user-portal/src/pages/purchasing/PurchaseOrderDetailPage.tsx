/**
 * PurchaseOrderDetailPage
 *
 * Read-only PO summary with contextual action buttons based on status + role.
 * Includes approval card, lines table, and navigation to base PR if applicable.
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  usePurchaseOrder,
  useSubmitPurchaseOrder,
  useApprovePurchaseOrder,
  useRejectPurchaseOrder,
  useSendPurchaseOrder,
  useCancelPurchaseOrder,
} from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';

// ─── Styled components (mirrors PurchaseRequestDetailPage) ────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1100px;
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

const Title = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
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
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SuccessButton = styled(PrimaryButton)`
  background: ${({ theme }) => theme.colors.success || '#10b981'};
  &:hover { background: #059669; }
`;

const DangerButton = styled(PrimaryButton)`
  background: ${({ theme }) => theme.colors.error || '#ef4444'};
  &:hover { background: #dc2626; }
`;

const GhostButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: 24px 28px;
  margin-bottom: 20px;
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
`;

const InfoItem = styled.div``;

const InfoLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const InfoValue = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
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
`;

const ApprovalCard = styled(Card)`
  border-left: 4px solid ${({ theme }) => theme.colors.primary[500]};
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows.xl};
  width: 100%;
  max-width: 480px;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px;
  border-radius: 6px;
  line-height: 1;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const ModalBody = styled.div`
  padding: 20px 24px;
`;

const ModalFooter = styled.div`
  padding: 12px 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error || '#ef4444'};
  font-size: 13px;
  margin: 8px 0 0;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PurchaseOrderDetailPage() {
  const { docId } = useParams<{ docId: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: po, isLoading, isError } = usePurchaseOrder(docId, user?.organizationId);

  const submitMutation = useSubmitPurchaseOrder();
  const approveMutation = useApprovePurchaseOrder();
  const rejectMutation = useRejectPurchaseOrder();
  const sendMutation = useSendPurchaseOrder();
  const cancelMutation = useCancelPurchaseOrder();

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const userRole = user?.role ?? '';
  const userId = user?.userId ?? '';
  const orgId = user?.organizationId ?? '';

  const isApproverRole = ['procurement_manager', 'admin', 'super_admin'].includes(userRole);
  const isIssuer = po?.issuedBy === userId;
  const canApprove = isApproverRole && !isIssuer && po?.status === 'Pending Approval';
  const canSubmit = po?.status === 'Draft';
  const canSend = po?.status === 'Open';
  const canCancel = ['Draft', 'Pending Approval', 'Open', 'Sent'].includes(po?.status ?? '');
  const canEdit = po?.status === 'Draft';

  const handleAction = async (fn: () => Promise<any>) => {
    setActionError(null);
    try { await fn(); } catch (err: any) {
      setActionError(err?.response?.data?.detail ?? err?.message ?? 'An error occurred');
    }
  };

  if (isLoading) return <Container><p>Loading...</p></Container>;
  if (isError || !po) return <Container><p>Purchase order not found.</p></Container>;

  return (
    <Container>
      <BackLink onClick={() => navigate('/purchasing/po')}>&larr; Back to Purchase Orders</BackLink>

      <TitleRow>
        <div>
          <Title>{po.docNumber}</Title>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
            Vendor: {po.vendorName ?? po.vendorCode ?? '—'} •{' '}
            {po.baseDocId && (
              <span
                style={{ color: '#2563eb', cursor: 'pointer' }}
                onClick={() => navigate(`/purchasing/pr/${po.baseDocId}`)}
              >
                Based on PR
              </span>
            )}
            {' '}Created {formatDate(po.docDate)}
          </div>
        </div>
        <ActionBar>
          {canEdit && (
            <GhostButton onClick={() => navigate(`/purchasing/po/${docId}/edit`)}>Edit</GhostButton>
          )}
          {canSubmit && (
            <PrimaryButton
              onClick={() => handleAction(() => submitMutation.mutateAsync({ docId: docId!, organizationId: orgId }))}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit'}
            </PrimaryButton>
          )}
          {canApprove && (
            <>
              <SuccessButton
                onClick={() => handleAction(() => approveMutation.mutateAsync({ docId: docId!, organizationId: orgId }))}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </SuccessButton>
              <DangerButton onClick={() => setShowRejectModal(true)}>Reject</DangerButton>
            </>
          )}
          {canSend && (
            <SuccessButton
              onClick={() => handleAction(() => sendMutation.mutateAsync({ docId: docId!, organizationId: orgId }))}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? 'Sending...' : 'Mark as Sent'}
            </SuccessButton>
          )}
          {canCancel && (
            <DangerButton
              onClick={() => {
                if (!confirm('Cancel this Purchase Order?')) return;
                handleAction(() => cancelMutation.mutateAsync({ docId: docId!, organizationId: orgId }));
              }}
              disabled={cancelMutation.isPending}
            >
              Cancel
            </DangerButton>
          )}
        </ActionBar>
      </TitleRow>

      {actionError && <ErrorText style={{ marginBottom: 16 }}>{actionError}</ErrorText>}

      {/* Header Info */}
      <Card>
        <CardTitle>Header Details</CardTitle>
        <InfoGrid>
          <InfoItem><InfoLabel>Status</InfoLabel><InfoValue>{po.status}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Vendor</InfoLabel><InfoValue>{po.vendorName ?? po.vendorCode ?? '—'}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Payment Terms</InfoLabel><InfoValue>{po.paymentTermsCode ?? '—'}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>PO Date</InfoLabel><InfoValue>{formatDate(po.docDate)}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Issued Date</InfoLabel><InfoValue>{formatDate(po.issuedDate)}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Expected Delivery</InfoLabel><InfoValue>{formatDate(po.expectedDeliveryDate)}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Due Date</InfoLabel><InfoValue>{formatDate(po.dueDate)}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Currency</InfoLabel><InfoValue>{po.currencyCode}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Net Amount</InfoLabel><InfoValue>{formatAmount(po.subtotalNet, po.currencyCode)}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>VAT</InfoLabel><InfoValue>{formatAmount(po.totalTax, po.currencyCode)}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Total Gross</InfoLabel><InfoValue><strong>{formatAmount(po.totalGross, po.currencyCode)}</strong></InfoValue></InfoItem>
          {po.notes && <InfoItem style={{ gridColumn: '1/-1' }}><InfoLabel>Notes</InfoLabel><InfoValue>{po.notes}</InfoValue></InfoItem>}
        </InfoGrid>
      </Card>

      {/* Approval Card */}
      {po.approvalState !== 'NotRequired' && (
        <ApprovalCard>
          <CardTitle>Approval</CardTitle>
          <InfoGrid>
            <InfoItem><InfoLabel>Approval State</InfoLabel><InfoValue>{po.approvalState}</InfoValue></InfoItem>
            {po.approvalRequestedFrom && <InfoItem><InfoLabel>Requested From</InfoLabel><InfoValue>{po.approvalRequestedFrom}</InfoValue></InfoItem>}
            {po.approvalRequestedAt && <InfoItem><InfoLabel>Requested At</InfoLabel><InfoValue>{formatDate(po.approvalRequestedAt)}</InfoValue></InfoItem>}
            {po.approvalDecidedAt && <InfoItem><InfoLabel>Decided At</InfoLabel><InfoValue>{formatDate(po.approvalDecidedAt)}</InfoValue></InfoItem>}
            {po.approvalComment && <InfoItem style={{ gridColumn: '1/-1' }}><InfoLabel>Comment</InfoLabel><InfoValue>{po.approvalComment}</InfoValue></InfoItem>}
          </InfoGrid>
        </ApprovalCard>
      )}

      {/* Lines */}
      <Card>
        <CardTitle>Lines ({po.lines.length})</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Item</Th>
              <Th>UOM</Th>
              <Th>Qty</Th>
              <Th>Open Qty</Th>
              <Th>Unit Price</Th>
              <Th>Net</Th>
              <Th>Tax</Th>
              <Th>Gross</Th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line) => (
              <tr key={line.lineId}>
                <Td>{line.lineNumber}</Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>{line.itemCode}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{line.itemName}</div>
                </Td>
                <Td>{line.uom}</Td>
                <Td>{line.quantity}</Td>
                <Td>{line.openQuantity}</Td>
                <Td>{formatAmount(line.unitPrice, po.currencyCode)}</Td>
                <Td>{formatAmount(line.lineNet, po.currencyCode)}</Td>
                <Td>{line.taxCode ? `${line.taxCode} (${line.taxRate}%)` : '—'}</Td>
                <Td><strong>{formatAmount(line.lineGross, po.currencyCode)}</strong></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Attachments — readOnly when status is not Draft */}
      <Card>
        <AttachmentList
          docType="PO"
          docId={docId!}
          organizationId={orgId}
          readOnly={po.status !== 'Draft'}
        />
      </Card>

      {/* Reject Modal */}
      {showRejectModal && (
        <Overlay>
          {/* Reason: modal must NOT close on overlay click — X button only */}
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Reject Purchase Order</ModalTitle>
              <CloseButton onClick={() => { setShowRejectModal(false); setRejectComment(''); }}>✕</CloseButton>
            </ModalHeader>
            <ModalBody>
              <p style={{ fontSize: 14, color: '#6b7280', marginTop: 0 }}>
                Please provide a reason for rejecting {po.docNumber}.
              </p>
              <Textarea
                placeholder="Rejection reason (required)..."
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
              />
              {actionError && <ErrorText>{actionError}</ErrorText>}
            </ModalBody>
            <ModalFooter>
              <GhostButton onClick={() => { setShowRejectModal(false); setRejectComment(''); }}>Cancel</GhostButton>
              <DangerButton
                disabled={!rejectComment.trim() || rejectMutation.isPending}
                onClick={async () => {
                  setActionError(null);
                  try {
                    await rejectMutation.mutateAsync({ docId: docId!, comment: rejectComment.trim(), organizationId: orgId });
                    setShowRejectModal(false);
                    setRejectComment('');
                  } catch (err: any) {
                    setActionError(err?.response?.data?.detail ?? err?.message ?? 'Failed to reject');
                  }
                }}
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Reject'}
              </DangerButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}
    </Container>
  );
}
