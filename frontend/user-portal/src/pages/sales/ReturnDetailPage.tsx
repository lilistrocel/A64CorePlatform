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
 * Status badge colours — Night Observatory phase map (spec §5.2), routed
 * through the single canonical helper in components/sales/statusPhase.ts:
 *   draft     → phase.empty
 *   open      → phase.inoculated
 *   cancelled → phase.decommissioned
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
import styled, { useTheme } from 'styled-components';
import { ExternalLink } from 'lucide-react';
import { glassPanel, glassControl, glassOpaque, monoLabel, phaseBadge } from '@a64core/shared';
import { useReturn, useTransitionReturn, useDeleteReturn } from '../../hooks/queries/useReturns';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
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

const DocNo = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const StatusBadge = styled.span<{ $status: ReturnNoteStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4).
const PrimaryButton = styled.button`
  padding: 9px 20px;
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
  padding: 9px 20px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const DangerButton = styled.button`
  padding: 9px 20px;
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: rgba(240, 138, 112, 0.26); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const GhostButton = styled.button`
  padding: 9px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ActionError = styled.div`
  margin-top: 12px;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 13px;
`;

const Card = styled.div`
  ${glassPanel}
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
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
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
  ${monoLabel}
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  text-align: left;
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 12px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const TotalsRow = styled.tr`
  background: rgba(180, 200, 220, 0.05);
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
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  min-width: 90px;
`;

const DocLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.bright.lapis};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  &:hover { text-decoration: underline; }
`;

const NoLink = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
`;

// Delete modal — canonical treatment (spec §4): glassPanel at blur 24px
// over a cosmos scrim. Closes only via X button — no overlay-click handler.

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalBox = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 28px;
  max-width: 440px;
  width: 90%;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 12px;
`;

const ModalBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.celeste};
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
  /* Own padding, not the (now-removed) global button padding — this glyph
     has no explicit width/height, so it needs a real click target. */
  padding: 8px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.celeste};
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
  ${glassOpaque}
  visibility: hidden;
  opacity: 0;
  width: 230px;
  text-align: center;
  border-radius: 8px;
  padding: 6px 10px;
  position: absolute;
  bottom: 110%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
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
    border-top-color: ${({ theme }) => theme.colors.cosmosHi};
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
  const theme = useTheme();
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
  if (error || !rtn) return <Container style={{ color: theme.colors.error }}>Return Note not found.</Container>;

  const baseRef = rtn.baseDocRef as DocumentLinkRef | null;
  const targetRefs = (rtn.targetDocRefs ?? []) as DocumentLinkRef[];

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/returns-v2')}>← Return Notes</BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>Return Note <DocNo>{rtn.docNumber}</DocNo></Title>
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
                <Td style={{ color: theme.colors.textDisabled, width: 32 }}>{line.lineNumber}</Td>
                <Td style={{ fontWeight: 600 }}>{line.itemCode}</Td>
                <Td>{line.itemName}</Td>
                <Td style={{ color: theme.colors.textSecondary }}>{line.description || '—'}</Td>
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
