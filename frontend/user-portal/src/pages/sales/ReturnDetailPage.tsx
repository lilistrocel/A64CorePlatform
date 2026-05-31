/**
 * ReturnDetailPage — Wave 3 (T-200.7)
 *
 * Shows a Return Note (RTN) header, lines table, doc-chain card, attachments,
 * and contextual action bar based on current status.
 *
 * Action bar logic:
 *   draft     → Edit, Post (DRAFT→OPEN), Delete
 *   open      → Issue Credit Note (→ /sales/ar-credit-notes/from-rtn/:rtnDocEntry — 404 until T-200.8)
 *               Cancel (super_admin only, OPEN→CANCELLED)
 *   cancelled → read-only
 *
 * Status badge colours:
 *   draft     → gray  (#f3f4f6 / #374151)
 *   open      → green (#ecfdf5 / #065f46)
 *   cancelled → red   (#fef2f2 / #991b1b)
 *
 * Doc-chain card:
 *   baseDocRef   — the RR (if from-RR path) or DN (if from-DN path)
 *   targetDocRefs — AR Credit Notes issued against this RTN
 *
 * Delete modal closes via X button only — NOT on overlay click (project rule).
 * Audit History button (GhostButton) opens SalesAuditHistoryModal — visible on all statuses.
 *
 * Route: /sales/returns-v2/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ExternalLink } from 'lucide-react';
import { useReturn, useTransitionReturn, useDeleteReturn } from '../../hooks/queries/useReturns';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import type {
  ReturnNoteStatus,
  ReturnNoteLine,
  DocumentLinkRef,
} from '../../services/salesApi';

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

const StatusBadge = styled.span<{ $status: ReturnNoteStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 5px 14px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#f3f4f6';
      case 'open': return '#ecfdf5';
      case 'cancelled': return '#fef2f2';
      default: return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#374151';
      case 'open': return '#065f46';
      case 'cancelled': return '#991b1b';
      default: return '#374151';
    }
  }};
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  padding: 9px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.primary[600]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  padding: 9px 20px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const DangerButton = styled.button`
  padding: 9px 20px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  &:hover { background: #fee2e2; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const GhostButton = styled.button`
  padding: 9px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const ActionError = styled.div`
  margin-top: 12px;
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #991b1b;
  font-size: 13px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
`;

const SectionTitle = styled.h2`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
`;

const InfoField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  text-align: left;
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 12px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const TotalsRow = styled.tr`
  background: ${({ theme }) => theme.colors.neutral[50]};
  font-weight: 600;
`;

// Doc-chain

const DocChainSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DocChainRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const DocChainLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 90px;
`;

const DocLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[600]};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  &:hover { text-decoration: underline; }
`;

const NoLink = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
`;

// Delete modal

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  padding: 28px;
  max-width: 440px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 12px;
`;

const ModalBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 24px;
  line-height: 1.6;
`;

const ModalFooter = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

const ModalCloseBtn = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ModalWrapper = styled.div`
  position: relative;
`;

// Credit note button tooltip wrapper
const Tooltip = styled.span`
  position: relative;
  display: inline-block;
  &:hover .tooltip-text {
    visibility: visible;
    opacity: 1;
  }
`;

const TooltipText = styled.span`
  visibility: hidden;
  opacity: 0;
  width: 230px;
  background: #1f2937;
  color: #f9fafb;
  text-align: center;
  border-radius: 6px;
  padding: 6px 10px;
  position: absolute;
  bottom: 110%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  transition: opacity 0.2s;
  z-index: 100;
  pointer-events: none;
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: #1f2937;
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-AE', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: ReturnNoteStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function resolveDocRoute(ref: DocumentLinkRef): string | null {
  switch (ref.docType) {
    case 'RR':
    case 'RETURN_REQUEST': return `/sales/return-requests/${ref.docId}`;
    case 'DELIVERY':
    case 'DN': return `/sales/deliveries/${ref.docId}`;
    case 'AR_CREDIT_NOTE':
    case 'ARC': return `/sales/ar-credit-notes/${ref.docId}`;
    default: return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReturnDetailPage() {
  const navigate = useNavigate();
  const { docId } = useParams<{ docId: string }>();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';
  const isSuperAdmin = user?.role === 'super_admin';

  const { data: rtn, isLoading, error } = useReturn(docId, orgId);
  const transitionMut = useTransitionReturn();
  const deleteMut = useDeleteReturn();

  const [actionError, setActionError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const handlePost = async () => {
    if (!rtn) return;
    setActionError('');
    try {
      await transitionMut.mutateAsync({
        docId: rtn.docEntry,
        transition: { newStatus: 'open' },
        orgId,
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setActionError(typeof msg === 'string' ? msg : 'Failed to post Return Note.');
    }
  };

  const handleCancel = async () => {
    if (!rtn) return;
    setActionError('');
    try {
      await transitionMut.mutateAsync({
        docId: rtn.docEntry,
        transition: { newStatus: 'cancelled', reason: 'Cancelled by admin' },
        orgId,
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setActionError(typeof msg === 'string' ? msg : 'Failed to cancel Return Note.');
    }
  };

  const handleDelete = async () => {
    if (!rtn) return;
    try {
      await deleteMut.mutateAsync({ docId: rtn.docEntry, orgId });
      navigate('/sales/returns-v2');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setActionError(typeof msg === 'string' ? msg : 'Failed to delete Return Note.');
      setShowDeleteModal(false);
    }
  };

  if (isLoading) return <Container>Loading...</Container>;
  if (error || !rtn) return <Container style={{ color: '#dc2626' }}>Return Note not found.</Container>;

  const baseRef = rtn.baseDocRef as DocumentLinkRef | null;
  const targetRefs = (rtn.targetDocRefs ?? []) as DocumentLinkRef[];

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/returns-v2')}>← Return Notes</BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>Return Note {rtn.docNumber}</Title>
          <StatusBadge $status={rtn.status}>{statusLabel(rtn.status)}</StatusBadge>
        </TitleGroup>

        <ActionBar>
          {rtn.status === 'draft' && (
            <>
              <SecondaryButton onClick={() => navigate(`/sales/returns-v2/${rtn.docEntry}/edit`)}>
                Edit
              </SecondaryButton>
              <PrimaryButton
                onClick={handlePost}
                disabled={transitionMut.isPending}
              >
                {transitionMut.isPending ? 'Posting...' : 'Post (Draft → Open)'}
              </PrimaryButton>
              <DangerButton onClick={() => setShowDeleteModal(true)}>
                Delete
              </DangerButton>
            </>
          )}

          {rtn.status === 'open' && (
            <>
              {/*
               * Issue Credit Note — navigates to AR Credit Note form (T-200.8).
               * Until T-200.8 ships this route 404s; tooltip explains the situation.
               */}
              <Tooltip>
                <PrimaryButton
                  onClick={() => navigate(`/sales/ar-credit-notes/from-rtn/${rtn.docEntry}`)}
                >
                  Issue Credit Note
                </PrimaryButton>
                <TooltipText className="tooltip-text">
                  Will land on the AR Credit Note form (T-200.8 — coming soon).
                </TooltipText>
              </Tooltip>

              {isSuperAdmin && (
                <DangerButton
                  onClick={handleCancel}
                  disabled={transitionMut.isPending}
                >
                  {transitionMut.isPending ? 'Cancelling...' : 'Cancel (Reverse)'}
                </DangerButton>
              )}
            </>
          )}
          <GhostButton onClick={() => setShowAuditModal(true)}>Audit History</GhostButton>
        </ActionBar>
      </TitleRow>

      {actionError && <ActionError>{actionError}</ActionError>}

      {/* ─ Header info ────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Details</SectionTitle>
        <InfoGrid>
          <InfoField>
            <InfoLabel>Customer</InfoLabel>
            <InfoValue>{rtn.customerName}</InfoValue>
          </InfoField>
          <InfoField>
            <InfoLabel>Document Date</InfoLabel>
            <InfoValue>{formatDate(rtn.docDate)}</InfoValue>
          </InfoField>
          <InfoField>
            <InfoLabel>Actual Return Date</InfoLabel>
            <InfoValue>{formatDate(rtn.actualReturnDate)}</InfoValue>
          </InfoField>
          <InfoField>
            <InfoLabel>Status</InfoLabel>
            <InfoValue>{statusLabel(rtn.status)}</InfoValue>
          </InfoField>
          <InfoField>
            <InfoLabel>Company Code</InfoLabel>
            <InfoValue>{rtn.companyCode}</InfoValue>
          </InfoField>
          <InfoField>
            <InfoLabel>Notes</InfoLabel>
            <InfoValue>{rtn.notes ?? '—'}</InfoValue>
          </InfoField>
        </InfoGrid>
      </Card>

      {/* ─ Lines table ────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Lines</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Item Code</Th>
              <Th>Item Name</Th>
              <Th>Description</Th>
              <Th style={{ textAlign: 'right' }}>Returned Qty</Th>
              <Th>UOM</Th>
              <Th>Warehouse</Th>
              <Th style={{ textAlign: 'right' }}>Unit Price</Th>
              <Th style={{ textAlign: 'right' }}>Line Net</Th>
              <Th style={{ textAlign: 'right' }}>Line Tax</Th>
              <Th style={{ textAlign: 'right' }}>Line Gross</Th>
            </tr>
          </thead>
          <tbody>
            {rtn.lines.map((line: ReturnNoteLine) => (
              <tr key={line.lineId}>
                <Td style={{ color: '#9ca3af', width: 32 }}>{line.lineNumber}</Td>
                <Td style={{ fontWeight: 600 }}>{line.itemCode}</Td>
                <Td>{line.itemName}</Td>
                <Td style={{ color: '#6b7280' }}>{line.description || '—'}</Td>
                <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(line.returnedQty).toLocaleString('en-AE', {
                    minimumFractionDigits: 0, maximumFractionDigits: 3,
                  })}
                </Td>
                <Td>{line.uom}</Td>
                <Td>{line.warehouseId}</Td>
                <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(line.unitPrice).toLocaleString('en-AE', {
                    minimumFractionDigits: 2, maximumFractionDigits: 4,
                  })}
                </Td>
                <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(line.lineNet).toLocaleString('en-AE', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2,
                  })}
                </Td>
                <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(line.lineTax).toLocaleString('en-AE', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2,
                  })}
                </Td>
                <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(line.lineGross).toLocaleString('en-AE', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2,
                  })}
                </Td>
              </tr>
            ))}
            <TotalsRow>
              <Td colSpan={8} style={{ textAlign: 'right', fontSize: 13 }}>Totals</Td>
              <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {Number(rtn.totals.net).toLocaleString('en-AE', {
                  minimumFractionDigits: 2, maximumFractionDigits: 2,
                })}
              </Td>
              <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {Number(rtn.totals.tax).toLocaleString('en-AE', {
                  minimumFractionDigits: 2, maximumFractionDigits: 2,
                })}
              </Td>
              <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {Number(rtn.totals.gross).toLocaleString('en-AE', {
                  minimumFractionDigits: 2, maximumFractionDigits: 2,
                })}
              </Td>
            </TotalsRow>
          </tbody>
        </Table>
      </Card>

      {/* ─ Doc-chain card ─────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Document Chain</SectionTitle>
        <DocChainSection>
          <DocChainRow>
            <DocChainLabel>Source:</DocChainLabel>
            {baseRef ? (
              <DocLink onClick={() => {
                const route = resolveDocRoute(baseRef);
                if (route) navigate(route);
              }}>
                <ExternalLink size={13} />
                {baseRef.docNumber ?? baseRef.docId}
              </DocLink>
            ) : (
              <NoLink>No source document</NoLink>
            )}
          </DocChainRow>
          <DocChainRow>
            <DocChainLabel>Credit Notes:</DocChainLabel>
            {targetRefs.length === 0 ? (
              <NoLink>None yet</NoLink>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {targetRefs.map((ref, i) => (
                  <DocLink
                    key={i}
                    onClick={() => {
                      const route = resolveDocRoute(ref);
                      if (route) navigate(route);
                    }}
                  >
                    <ExternalLink size={13} />
                    {ref.docNumber ?? ref.docId}
                  </DocLink>
                ))}
              </div>
            )}
          </DocChainRow>
        </DocChainSection>
      </Card>

      {/* ─ Attachments ────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Attachments</SectionTitle>
        <AttachmentList docType="RETURN" docId={rtn.docEntry} />
      </Card>

      <SalesAuditHistoryModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        organizationId={orgId}
        docType="RETURN"
        docEntry={rtn.docEntry}
        docLabel={rtn.docNumber}
      />

      {/* ─ Delete confirm modal ───────────────────────────────────────────── */}
      {showDeleteModal && (
        <ModalOverlay>
          {/* Intentionally no onClick on overlay — project rule: close only via X */}
          <ModalWrapper>
            <ModalBox>
              <ModalCloseBtn
                type="button"
                onClick={() => setShowDeleteModal(false)}
                aria-label="Close modal"
              >
                ×
              </ModalCloseBtn>
              <ModalTitle>Delete Return Note?</ModalTitle>
              <ModalBody>
                You are about to permanently delete <strong>{rtn.docNumber}</strong>.
                This action cannot be undone. Only DRAFT Return Notes can be deleted.
              </ModalBody>
              <ModalFooter>
                <SecondaryButton type="button" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </SecondaryButton>
                <DangerButton
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteMut.isPending}
                >
                  {deleteMut.isPending ? 'Deleting...' : 'Delete'}
                </DangerButton>
              </ModalFooter>
            </ModalBox>
          </ModalWrapper>
        </ModalOverlay>
      )}
    </Container>
  );
}
