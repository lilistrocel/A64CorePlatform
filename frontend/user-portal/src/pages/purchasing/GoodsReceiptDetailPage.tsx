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
 *
 * Night Observatory (T-901 Phase 3): status badge colour is routed through
 * the single canonical purchasingStatusToPhase() map in ./statusPhase.ts.
 * This page's StatusBadge takes the GR's own `status` string and maps it
 * through purchasingStatusToPhase, matching PR/PO/AP.
 *
 * T-811 (2026-08-04): the backend's Wave 4 status migration lowercased the
 * stored value and collapsed 'Posted' into the shared 'open' state (isDraft/
 * isPosted below now compare against 'draft'/'open'). Display still reads
 * "Posted" for GR specifically via statusPhase.ts's statusDisplayLabel().
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { X } from 'lucide-react';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import {
  useGoodsReceipt,
  usePostGoodsReceipt,
  useDeleteGoodsReceipt,
} from '../../hooks/queries/useGoodsReceipts';
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
  align-items: center;
  margin-bottom: 20px;
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
`;

// Primary CTA — the ONE gold budget item in the action bar (spec §3/§4/§8).
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

// A quiet non-interactive status chip (e.g. "Read-only (Posted)") — glass,
// celeste text, never gold; distinct from the phase StatusBadge below.
const ReadOnlyTag = styled.span`
  ${monoLabel}
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
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

const InfoLink = styled.span`
  color: ${({ theme }) => theme.colors.bright.lapis};
  cursor: pointer;
  &:hover { text-decoration: underline; }
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

// Night Observatory (T-901 Phase 3): takes the GR's actual `status` string
// and routes it through the canonical purchasingStatusToPhase() map,
// matching PR/PO/AP. T-811: status is now the stored lowercase_snake value.
const StatusBadge = styled.span<{ $status: string }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 13px;
  margin: 8px 0 0;
`;

/** Banner that appears after a successful Post linking to the JE list —
 * emerald-tinted glass, never gold (spec §5.2 "approved/posted -> fruiting"). */
const JELinkBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: ${({ theme }) => theme.colors.successBg};
  border: 1px solid rgba(84, 211, 155, 0.35);
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
`;

const JELinkText = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.bright.emerald};
  font-weight: 500;
`;

const JELinkButton = styled.a`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bright.emerald};
  font-weight: 600;
  text-decoration: none;
  padding: 6px 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
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

// Confirm-action overlay/modal — glassPanel at blur 24px over a
// rgba(10,14,36,.6) scrim, 20px radius (spec §4 "Modals/drawers"). Retinted
// from the previous rgba(0,0,0,.5)-style scrim.
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
  max-width: 440px;
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
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
`;

const ModalFooter = styled.div`
  padding: 12px 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
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
  const theme = useTheme();

  const orgId = user?.organizationId ?? '';

  const { data: gr, isLoading, isError } = useGoodsReceipt(docId, orgId);
  const postMutation = usePostGoodsReceipt();
  const deleteMutation = useDeleteGoodsReceipt();

  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justPosted, setJustPosted] = useState(false);

  // T-811: gating now compares against the stored backend vocabulary — GR's
  // 'Posted' collapsed into the shared 'open' value. See statusPhase.ts.
  const isDraft = gr?.status === 'draft';
  const isPosted = gr?.status === 'open';

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

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/purchasing/gr')}>&larr; Back to Goods Receipts</BackLink>
        <StateWrap>
          <StateHeadline>Loading receipt…</StateHeadline>
          <StateBody>Fetching the latest details.</StateBody>
        </StateWrap>
      </Container>
    );
  }

  if (isError || !gr) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/purchasing/gr')}>&larr; Back to Goods Receipts</BackLink>
        <StateWrap>
          <StateHeadline>Goods receipt not found</StateHeadline>
          <StateBody>It may have been deleted, or the link is out of date.</StateBody>
          <PrimaryButton onClick={() => navigate('/purchasing/gr')}>Back to Goods Receipts</PrimaryButton>
        </StateWrap>
      </Container>
    );
  }

  return (
    <Container>
      <BackLink onClick={() => navigate('/purchasing/gr')}>
        &larr; Back to Goods Receipts
      </BackLink>

      {/* Cross-page link — visible immediately after posting */}
      {(justPosted || isPosted) && gr.status === 'open' && (
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

      <PageHeader
        breadcrumb={`— PURCHASING · ${gr.docNumber}`}
        title="Goods Receipt"
        emphasizeLastWord
        description={`${gr.vendorName ?? gr.vendorCode ?? 'No vendor'} · Received ${formatDate(gr.receivedDate)}`}
        stats={[
          { value: formatAmount(gr.subtotalNet, gr.currencyCode), label: `Total Net · ${gr.lines.length} Lines` },
        ]}
      />

      <HeaderActionsRow>
        <ActionBar>
          {isDraft && (
            <>
              <SecondaryButton onClick={() => navigate(`/purchasing/gr/${docId}/edit`)}>
                Edit
              </SecondaryButton>
              <PrimaryButton
                onClick={() => setConfirmPost(true)}
                disabled={postMutation.isPending}
              >
                Post
              </PrimaryButton>
              <DangerButton
                onClick={() => setConfirmDelete(true)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </DangerButton>
            </>
          )}
          {isPosted && <ReadOnlyTag>Read-only (Posted)</ReadOnlyTag>}
        </ActionBar>
      </HeaderActionsRow>

      {actionError && <ErrorText style={{ marginBottom: 16 }}>{actionError}</ErrorText>}

      {/* Header Info */}
      <Card>
        <CardTitle>Header Details</CardTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Status</InfoLabel>
            <InfoValue>
              <StatusBadge $status={gr.status}>{statusDisplayLabel(gr.status, 'GR')}</StatusBadge>
            </InfoValue>
          </InfoItem>
          <InfoItem><InfoLabel>Vendor</InfoLabel><InfoValue>{gr.vendorName ?? gr.vendorCode ?? '—'}</InfoValue></InfoItem>
          <InfoItem>
            <InfoLabel>Source PO</InfoLabel>
            <InfoValue>
              <InfoLink onClick={() => navigate(`/purchasing/po/${gr.baseDocId}`)}>
                {gr.baseDocNumber ?? gr.baseDocId}
              </InfoLink>
            </InfoValue>
          </InfoItem>
          <InfoItem><InfoLabel>GR Date</InfoLabel><InfoValueMono>{formatDate(gr.docDate)}</InfoValueMono></InfoItem>
          <InfoItem><InfoLabel>Received Date</InfoLabel><InfoValueMono>{formatDate(gr.receivedDate)}</InfoValueMono></InfoItem>
          <InfoItem><InfoLabel>Warehouse</InfoLabel><InfoValue>{gr.warehouseId ?? '—'}</InfoValue></InfoItem>
          <InfoItem><InfoLabel>Currency</InfoLabel><InfoValue>{gr.currencyCode}</InfoValue></InfoItem>
          <InfoItem>
            <InfoLabel>Total Net</InfoLabel>
            <InfoValueMono><strong>{formatAmount(gr.subtotalNet, gr.currencyCode)}</strong></InfoValueMono>
          </InfoItem>
          {gr.postedAt && (
            <InfoItem>
              <InfoLabel>Posted At</InfoLabel>
              <InfoValueMono>{formatDateTime(gr.postedAt)}</InfoValueMono>
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
                <TdMono>{line.lineNumber}</TdMono>
                <Td>
                  <div style={{ fontWeight: 600, fontFamily: theme.typography.fontFamily.mono }}>{line.itemCode}</div>
                  <div style={{ fontSize: 12, color: theme.colors.textSecondary }}>{line.itemName}</div>
                </Td>
                <Td>{line.uom}</Td>
                <TdMono>{line.quantity}</TdMono>
                <TdMono>{formatAmount(line.unitPrice, gr.currencyCode)}</TdMono>
                <TdMono><strong>{formatAmount(line.lineNet, gr.currencyCode)}</strong></TdMono>
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
          readOnly={gr.status !== 'draft'}
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
                <X size={16} strokeWidth={1.8} />
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
              <PrimaryButton
                disabled={postMutation.isPending}
                onClick={handlePost}
              >
                {postMutation.isPending ? 'Posting...' : 'Confirm Post'}
              </PrimaryButton>
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
                <X size={16} strokeWidth={1.8} />
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
