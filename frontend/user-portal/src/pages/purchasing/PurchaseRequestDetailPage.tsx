/**
 * PurchaseRequestDetailPage
 *
 * Read-only PR summary with contextual action buttons based on status + role.
 * Approval card shows who approved/rejected with comment.
 *
 * Modals do NOT close on overlay click — X button only.
 *
 * Night Observatory (T-901 Phase 3): status badge colour is routed through
 * the single canonical purchasingStatusToPhase() map in ./statusPhase.ts —
 * see that file for the PR/PO/GR/AP status -> phase.* vocabulary.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { X } from 'lucide-react';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import {
  usePurchaseRequest,
  useSubmitPurchaseRequest,
  useApprovePurchaseRequest,
  useRejectPurchaseRequest,
  useCancelPurchaseRequest,
} from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { purchasingStatusToPhase, statusDisplayLabel } from './statusPhase';

// ─── Styled components ────────────────────────────────────────────────────────

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

const HeaderActionsRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

// Primary CTA — the ONE gold budget item in the action bar (spec §3/§4/§8):
// gold gradient fill, cosmos (onAccent) text. onAccent is correct here
// specifically because this button's fill is gold — see the redesign report
// for the full onAccent audit of this file.
const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  ${glassControl}
  padding: 10px 20px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const DangerButton = styled.button`
  padding: 10px 20px;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: rgba(240, 138, 112, 0.26); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const GhostButton = styled.button`
  padding: 10px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Card = styled.div`
  ${glassPanel}
  padding: 24px 28px;
  margin-bottom: 20px;
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
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
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 4px;
`;

const InfoValue = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Space Mono for quantities/currency amounts/timestamps (spec §6).
const InfoValueMono = styled(InfoValue)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 10px 12px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Td = styled.td`
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const TdMono = styled(Td)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
`;

// Night Observatory (T-901 Phase 3): was a raw `color?: string` prop with
// per-call-site colour choices. Now routes the PR's own status field through
// the single canonical purchasingStatusToPhase() map + the shared phaseBadge
// mixin, matching every other purchasing/sales StatusBadge.
const StatusBadge = styled.span<{ $status: string }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
`;

const ApprovalCard = styled(Card)`
  border-left: 3px solid ${({ theme }) => theme.colors.bright.lapis};
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 13px;
  margin: 8px 0 0;
`;

// ─── Empty / loading / error states (spec §4 "Empty states") ──────────────────

const StateWrap = styled.div`
  text-align: center;
  padding: 96px 32px;
`;

const StateHeadline = styled.h2`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.6rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 10px;
`;

const StateBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 24px;
`;

// ─── Reject Modal ─────────────────────────────────────────────────────────────
// glassPanel at blur 24px over a rgba(10,14,36,.6) scrim, 20px radius (spec §4
// "Modals/drawers"). Retinted from the previous rgba(0,0,0,.45)-style scrim.

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 480px;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CloseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.celeste};
  padding: 6px;
  border-radius: 8px;
  transition: background 150ms ease, color 150ms ease;
  &:hover { background: rgba(180, 200, 220, 0.1); color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ModalBody = styled.div`
  padding: 20px 24px;
`;

const ModalFooter = styled.div`
  padding: 12px 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

// Inputs/selects/textareas — glassControl, 11px radius, cream-hi text, muted
// placeholder, gold-hi focus ring (spec §4 "Inputs/selects/textareas").
const Textarea = styled.textarea`
  ${glassControl}
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
  box-sizing: border-box;
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PurchaseRequestDetailPage() {
  const { docId } = useParams<{ docId: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const theme = useTheme();

  const { data: pr, isLoading, isError } = usePurchaseRequest(docId, user?.organizationId);

  const submitMutation = useSubmitPurchaseRequest();
  const approveMutation = useApprovePurchaseRequest();
  const rejectMutation = useRejectPurchaseRequest();
  const cancelMutation = useCancelPurchaseRequest();

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const userRole = user?.role ?? '';
  const userId = user?.userId ?? '';
  const orgId = user?.organizationId ?? '';

  const isApproverRole = ['procurement_manager', 'admin', 'super_admin'].includes(userRole);
  const isRequester = pr?.requestedBy === userId;
  // T-811: gating now compares against the stored backend vocabulary
  // ('draft' | 'pending_approval' | 'open' | ...) — see statusPhase.ts.
  const canApprove = isApproverRole && !isRequester && pr?.status === 'pending_approval';
  const canSubmit = pr?.status === 'draft';
  const canCancel = ['draft', 'pending_approval'].includes(pr?.status ?? '');
  const canEdit = pr?.status === 'draft';
  const canCreatePO = pr?.status === 'open';

  const handleAction = async (fn: () => Promise<any>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail ?? err?.message ?? 'An error occurred');
    }
  };

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/purchasing/pr')}>&larr; Back to Purchase Requests</BackLink>
        <StateWrap>
          <StateHeadline>Loading request…</StateHeadline>
          <StateBody>Fetching the latest details.</StateBody>
        </StateWrap>
      </Container>
    );
  }

  if (isError || !pr) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/purchasing/pr')}>&larr; Back to Purchase Requests</BackLink>
        <StateWrap>
          <StateHeadline>Purchase request not found</StateHeadline>
          <StateBody>It may have been deleted, or the link is out of date.</StateBody>
          <PrimaryButton onClick={() => navigate('/purchasing/pr')}>Back to Purchase Requests</PrimaryButton>
        </StateWrap>
      </Container>
    );
  }

  return (
    <Container>
      <BackLink onClick={() => navigate('/purchasing/pr')}>&larr; Back to Purchase Requests</BackLink>

      <PageHeader
        breadcrumb={`— PURCHASING · ${pr.docNumber}`}
        title="Purchase Request"
        emphasizeLastWord
        description={`${pr.department ? `${pr.department} · ` : ''}Urgency: ${pr.urgency} · Created ${formatDate(pr.docDate)}`}
        stats={[
          { value: formatAmount(pr.totalGross, pr.currencyCode), label: `Total Gross · ${pr.lines.length} Lines` },
        ]}
      />

      <HeaderActionsRow>
        <ActionBar>
          {canEdit && (
            <SecondaryButton onClick={() => navigate(`/purchasing/pr/${docId}/edit`)}>
              Edit
            </SecondaryButton>
          )}
          {canSubmit && (
            <PrimaryButton
              onClick={() => handleAction(() => submitMutation.mutateAsync({ docId: docId!, organizationId: orgId }))}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
            </PrimaryButton>
          )}
          {canApprove && (
            <>
              <PrimaryButton
                onClick={() => handleAction(() => approveMutation.mutateAsync({ docId: docId!, organizationId: orgId }))}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </PrimaryButton>
              <DangerButton onClick={() => setShowRejectModal(true)}>Reject</DangerButton>
            </>
          )}
          {canCreatePO && (
            <PrimaryButton onClick={() => navigate(`/purchasing/po/from-pr/${docId}`)}>
              Create PO
            </PrimaryButton>
          )}
          {canCancel && (
            <DangerButton
              onClick={() => {
                if (!confirm('Cancel this Purchase Request?')) return;
                handleAction(() => cancelMutation.mutateAsync({ docId: docId!, organizationId: orgId }));
              }}
              disabled={cancelMutation.isPending}
            >
              Cancel
            </DangerButton>
          )}
        </ActionBar>
      </HeaderActionsRow>

      {actionError && <ErrorText style={{ marginBottom: 16 }}>{actionError}</ErrorText>}

      {/* Header Info */}
      <Card>
        <CardTitle>Header Details</CardTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Status</InfoLabel>
            <InfoValue><StatusBadge $status={pr.status}>{statusDisplayLabel(pr.status, 'PR')}</StatusBadge></InfoValue>
          </InfoItem>
          <InfoItem><InfoLabel>Department</InfoLabel><InfoValue>{pr.department ?? '—'}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Urgency</InfoLabel><InfoValue>{pr.urgency}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Requested Date</InfoLabel><InfoValueMono>{formatDate(pr.requestedDate)}</InfoValueMono></InfoItem>
          <InfoItem><InfoLabel>Expected Delivery</InfoLabel><InfoValueMono>{formatDate(pr.expectedDeliveryDate)}</InfoValueMono></InfoItem>
          <InfoItem><InfoLabel>Currency</InfoLabel><InfoValue>{pr.currencyCode}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Net Amount</InfoLabel><InfoValueMono>{formatAmount(pr.subtotalNet, pr.currencyCode)}</InfoValueMono></InfoItem>
          <InfoItem><InfoLabel>VAT</InfoLabel><InfoValueMono>{formatAmount(pr.totalTax, pr.currencyCode)}</InfoValueMono></InfoItem>
          <InfoItem><InfoLabel>Total Gross</InfoLabel><InfoValueMono><strong>{formatAmount(pr.totalGross, pr.currencyCode)}</strong></InfoValueMono></InfoItem>
          {pr.notes && <InfoItem style={{ gridColumn: '1/-1' }}><InfoLabel>Notes</InfoLabel><InfoValue>{pr.notes}</InfoValue></InfoItem>}
        </InfoGrid>
      </Card>

      {/* Approval Card */}
      {pr.approvalState !== 'NotRequired' && (
        <ApprovalCard>
          <CardTitle>Approval</CardTitle>
          <InfoGrid>
            <InfoItem><InfoLabel>Approval State</InfoLabel><InfoValue>{pr.approvalState}</InfoValue></InfoItem>
            {pr.approvalRequestedFrom && (
              <InfoItem><InfoLabel>Requested From</InfoLabel><InfoValue>{pr.approvalRequestedFrom}</InfoValue></InfoItem>
            )}
            {pr.approvalRequestedAt && (
              <InfoItem><InfoLabel>Requested At</InfoLabel><InfoValueMono>{formatDate(pr.approvalRequestedAt)}</InfoValueMono></InfoItem>
            )}
            {pr.approvalDecidedAt && (
              <InfoItem><InfoLabel>Decided At</InfoLabel><InfoValueMono>{formatDate(pr.approvalDecidedAt)}</InfoValueMono></InfoItem>
            )}
            {pr.approvalComment && (
              <InfoItem style={{ gridColumn: '1/-1' }}><InfoLabel>Comment</InfoLabel><InfoValue>{pr.approvalComment}</InfoValue></InfoItem>
            )}
          </InfoGrid>
        </ApprovalCard>
      )}

      {/* Lines */}
      <Card>
        <CardTitle>Lines ({pr.lines.length})</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Item</Th>
              <Th>Description</Th>
              <Th>UOM</Th>
              <Th>Quantity</Th>
              <Th>Unit Price</Th>
              <Th>Net</Th>
              <Th>Tax</Th>
              <Th>Gross</Th>
            </tr>
          </thead>
          <tbody>
            {pr.lines.map((line) => (
              <tr key={line.lineId}>
                <TdMono>{line.lineNumber}</TdMono>
                <Td>
                  <div style={{ fontWeight: 600, fontFamily: theme.typography.fontFamily.mono }}>{line.itemCode}</div>
                  <div style={{ fontSize: 12, color: theme.colors.textSecondary }}>{line.itemName}</div>
                </Td>
                <Td>{line.description ?? '—'}</Td>
                <Td>{line.uom}</Td>
                <TdMono>{line.quantity}</TdMono>
                <TdMono>{formatAmount(line.unitPrice, pr.currencyCode)}</TdMono>
                <TdMono>{formatAmount(line.lineNet, pr.currencyCode)}</TdMono>
                <Td>{line.taxCode ? `${line.taxCode} (${line.taxRate}%)` : '—'}</Td>
                <TdMono><strong>{formatAmount(line.lineGross, pr.currencyCode)}</strong></TdMono>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Attachments — readOnly when status is not Draft */}
      <Card>
        <AttachmentList
          docType="PR"
          docId={docId!}
          organizationId={orgId}
          readOnly={pr.status !== 'draft'}
        />
      </Card>

      {/* Reject Modal */}
      {showRejectModal && (
        <Overlay>
          {/* Reason: modal must NOT close on overlay click — X button only */}
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Reject Purchase Request</ModalTitle>
              <CloseButton
                onClick={() => { setShowRejectModal(false); setRejectComment(''); }}
                aria-label="Close"
              >
                <X size={16} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p style={{ fontSize: 14, color: theme.colors.textSecondary, marginTop: 0 }}>
                Please provide a reason for rejecting {pr.docNumber}.
              </p>
              <Textarea
                placeholder="Rejection reason (required)..."
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
              />
              {actionError && <ErrorText>{actionError}</ErrorText>}
            </ModalBody>
            <ModalFooter>
              <GhostButton onClick={() => { setShowRejectModal(false); setRejectComment(''); }}>
                Cancel
              </GhostButton>
              <DangerButton
                disabled={!rejectComment.trim() || rejectMutation.isPending}
                onClick={async () => {
                  setActionError(null);
                  try {
                    await rejectMutation.mutateAsync({
                      docId: docId!,
                      comment: rejectComment.trim(),
                      organizationId: orgId,
                    });
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
