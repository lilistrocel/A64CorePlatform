/**
 * GoodsReceiptDetailPage
 *
 * Shows GR header + lines. Draft GRs have Post / Edit / Delete actions.
 * Posted GRs are read-only.
 *
 * After a successful Post, shows a "View Journal Entry" link to the finance
 * JE list filtered by this GR's docNumber — the moment the cycle closes.
 *
 * Role gating: procurement_officer, procurement_manager, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 *
 * Route: /purchasing/gr/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  useGoodsReceipt,
  usePostGoodsReceipt,
  useDeleteGoodsReceipt,
} from '../../hooks/queries/useGoodsReceipts';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1100px;
  margin: 0 auto;
`;

const BackLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.accent.sage};
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
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageDeep}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SuccessButton = styled(PrimaryButton)`
  background: ${({ theme }) => theme.colors.status.success || '#10b981'};
  &:hover { background: #059669; }
`;

const DangerButton = styled(PrimaryButton)`
  background: ${({ theme }) => theme.colors.status.danger || '#ef4444'};
  &:hover { background: #dc2626; }
`;

const GhostButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: 24px 28px;
  margin-bottom: 20px;
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
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
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: 4px;
`;

const InfoValue = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
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
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Td = styled.td`
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
`;

const StatusBadge = styled.span<{ $posted: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $posted }) => ($posted ? '#d1fae5' : '#f3f4f6')};
  color: ${({ $posted }) => ($posted ? '#065f46' : '#6b7280')};
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.status.danger || '#ef4444'};
  font-size: 13px;
  margin: 8px 0 0;
`;

/** Banner that appears after a successful Post linking to the JE list */
const JELinkBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
`;

const JELinkText = styled.span`
  font-size: 14px;
  color: #065f46;
  font-weight: 500;
`;

const JELinkButton = styled.a`
  font-size: 13px;
  color: #059669;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid #6ee7b7;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  &:hover { background: #d1fae5; }
`;

// Confirm-action overlay/modal (mirrors PO detail page pattern)
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
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  width: 100%;
  max-width: 440px;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
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
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: 4px;
  border-radius: 6px;
  line-height: 1;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;

const ModalBody = styled.div`
  padding: 20px 24px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  line-height: 1.6;
`;

const ModalFooter = styled.div`
  padding: 12px 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GoodsReceiptDetailPage() {
  const { docId } = useParams<{ docId: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const orgId = user?.organizationId ?? '';

  const { data: gr, isLoading, isError } = useGoodsReceipt(docId, orgId);
  const postMutation = usePostGoodsReceipt();
  const deleteMutation = useDeleteGoodsReceipt();

  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justPosted, setJustPosted] = useState(false);

  const isDraft = gr?.status === 'Draft';
  const isPosted = gr?.status === 'Posted';

  const handlePost = async () => {
    setActionError(null);
    try {
      await postMutation.mutateAsync({ docId: docId!, organizationId: orgId });
      setConfirmPost(false);
      setJustPosted(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setActionError(
        axiosErr?.response?.data?.detail ?? axiosErr?.message ?? 'Failed to post GR.'
      );
    }
  };

  const handleDelete = async () => {
    setActionError(null);
    try {
      await deleteMutation.mutateAsync({ docId: docId!, organizationId: orgId });
      navigate('/purchasing/gr');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setActionError(
        axiosErr?.response?.data?.detail ?? axiosErr?.message ?? 'Failed to delete GR.'
      );
    }
  };

  if (isLoading) return <Container><p>Loading...</p></Container>;
  if (isError || !gr) return <Container><p>Goods receipt not found.</p></Container>;

  return (
    <Container>
      <BackLink onClick={() => navigate('/purchasing/gr')}>
        &larr; Back to Goods Receipts
      </BackLink>

      {/* Cross-page link — visible immediately after posting */}
      {(justPosted || isPosted) && gr.status === 'Posted' && (
        <JELinkBanner>
          <JELinkText>
            GR posted. The finance team will see a new journal entry shortly.
          </JELinkText>
          <JELinkButton
            href={`/finance/journal-entries?search=${encodeURIComponent(gr.docNumber)}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/finance/journal-entries?search=${encodeURIComponent(gr.docNumber)}`);
            }}
          >
            View Journal Entry &rarr;
          </JELinkButton>
        </JELinkBanner>
      )}

      <TitleRow>
        <div>
          <Title>{gr.docNumber}</Title>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
            {gr.vendorName ?? gr.vendorCode ?? 'No vendor'} &bull;{' '}
            <span
              style={{ color: '#2563eb', cursor: 'pointer' }}
              onClick={() => navigate(`/purchasing/po/${gr.baseDocId}`)}
            >
              {gr.baseDocNumber ?? 'View PO'}
            </span>
            {' '}&bull; Received {formatDate(gr.receivedDate)}
          </div>
        </div>
        <ActionBar>
          {isDraft && (
            <>
              <GhostButton onClick={() => navigate(`/purchasing/gr/${docId}/edit`)}>
                Edit
              </GhostButton>
              <SuccessButton
                onClick={() => setConfirmPost(true)}
                disabled={postMutation.isPending}
              >
                Post
              </SuccessButton>
              <DangerButton
                onClick={() => setConfirmDelete(true)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </DangerButton>
            </>
          )}
          {isPosted && (
            <span style={{
              fontSize: 13, color: '#6b7280',
              padding: '8px 12px',
              background: '#f3f4f6',
              borderRadius: 8,
            }}>
              Read-only (Posted)
            </span>
          )}
        </ActionBar>
      </TitleRow>

      {actionError && <ErrorText style={{ marginBottom: 16 }}>{actionError}</ErrorText>}

      {/* Header Info */}
      <Card>
        <CardTitle>Header Details</CardTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Status</InfoLabel>
            <InfoValue>
              <StatusBadge $posted={isPosted}>{gr.status}</StatusBadge>
            </InfoValue>
          </InfoItem>
          <InfoItem><InfoLabel>Vendor</InfoLabel><InfoValue>{gr.vendorName ?? gr.vendorCode ?? '—'}</InfoValue></InfoItem>
          <InfoItem>
            <InfoLabel>Source PO</InfoLabel>
            <InfoValue>
              <span
                style={{ color: '#2563eb', cursor: 'pointer' }}
                onClick={() => navigate(`/purchasing/po/${gr.baseDocId}`)}
              >
                {gr.baseDocNumber ?? gr.baseDocId}
              </span>
            </InfoValue>
          </InfoItem>
          <InfoItem><InfoLabel>GR Date</InfoLabel><InfoValue>{formatDate(gr.docDate)}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Received Date</InfoLabel><InfoValue>{formatDate(gr.receivedDate)}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Warehouse</InfoLabel><InfoValue>{gr.warehouseId ?? '—'}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Currency</InfoLabel><InfoValue>{gr.currencyCode}</InfoValue></InfoItem>
          <InfoItem>
            <InfoLabel>Total Net</InfoLabel>
            <InfoValue><strong>{formatAmount(gr.subtotalNet, gr.currencyCode)}</strong></InfoValue>
          </InfoItem>
          {gr.postedAt && (
            <InfoItem>
              <InfoLabel>Posted At</InfoLabel>
              <InfoValue>{formatDateTime(gr.postedAt)}</InfoValue>
            </InfoItem>
          )}
          {gr.postedBy && (
            <InfoItem><InfoLabel>Posted By</InfoLabel><InfoValue>{gr.postedBy}</InfoValue></InfoItem>
          )}
          {gr.notes && (
            <InfoItem style={{ gridColumn: '1/-1' }}>
              <InfoLabel>Notes</InfoLabel>
              <InfoValue>{gr.notes}</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </Card>

      {/* Lines */}
      <Card>
        <CardTitle>Lines ({gr.lines.length})</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Item</Th>
              <Th>UOM</Th>
              <Th>Qty Received</Th>
              <Th>Unit Price</Th>
              <Th>Line Net</Th>
            </tr>
          </thead>
          <tbody>
            {gr.lines.map((line) => (
              <tr key={line.grLineId}>
                <Td>{line.lineNumber}</Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>{line.itemCode}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{line.itemName}</div>
                </Td>
                <Td>{line.uom}</Td>
                <Td>{line.quantity}</Td>
                <Td>{formatAmount(line.unitPrice, gr.currencyCode)}</Td>
                <Td><strong>{formatAmount(line.lineNet, gr.currencyCode)}</strong></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Attachments — readOnly when status is not Draft */}
      <Card>
        <AttachmentList
          docType="GR"
          docId={docId!}
          organizationId={orgId}
          readOnly={gr.status !== 'Draft'}
        />
      </Card>

      {/* Confirm Post modal */}
      {confirmPost && (
        <Overlay>
          {/* Modal does NOT close on overlay click — use X or Cancel button */}
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Post Goods Receipt</ModalTitle>
              <CloseButton
                onClick={() => { setConfirmPost(false); setActionError(null); }}
                aria-label="Close"
              >
                ✕
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p style={{ margin: '0 0 8px' }}>
                You are about to post <strong>{gr.docNumber}</strong>.
              </p>
              <p style={{ margin: 0 }}>
                This will decrement the open quantities on the source PO and trigger a
                journal entry on the finance side. This action cannot be undone.
              </p>
              {actionError && <ErrorText>{actionError}</ErrorText>}
            </ModalBody>
            <ModalFooter>
              <GhostButton onClick={() => { setConfirmPost(false); setActionError(null); }}>
                Cancel
              </GhostButton>
              <SuccessButton
                disabled={postMutation.isPending}
                onClick={handlePost}
              >
                {postMutation.isPending ? 'Posting...' : 'Confirm Post'}
              </SuccessButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}

      {/* Confirm Delete modal */}
      {confirmDelete && (
        <Overlay>
          {/* Modal does NOT close on overlay click — use X or Cancel button */}
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Delete Goods Receipt</ModalTitle>
              <CloseButton
                onClick={() => { setConfirmDelete(false); setActionError(null); }}
                aria-label="Close"
              >
                ✕
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              Are you sure you want to permanently delete{' '}
              <strong>{gr.docNumber}</strong>? This cannot be undone.
              {actionError && <ErrorText>{actionError}</ErrorText>}
            </ModalBody>
            <ModalFooter>
              <GhostButton onClick={() => { setConfirmDelete(false); setActionError(null); }}>
                Cancel
              </GhostButton>
              <DangerButton
                disabled={deleteMutation.isPending}
                onClick={handleDelete}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </DangerButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}
    </Container>
  );
}
