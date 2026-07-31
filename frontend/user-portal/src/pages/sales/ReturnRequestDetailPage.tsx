/**
 * ReturnRequestDetailPage — Wave 3 (T-200.6)
 *
 * Shows a Return Request (RR / RMA) header, consumption-tracking lines table,
 * doc-chain card, attachments, and contextual action bar based on current status.
 *
 * Action bar logic:
 *   draft     → Edit, Post (DRAFT→OPEN), Delete
 *   open      → Create Return Note (→ /sales/returns-v2/from-rr/:rrDocEntry — 404 until T-200.7)
 *               Cancel (super_admin only, OPEN→CANCELLED)
 *   closed    → read-only, links to all Return Notes via targetDocRefs
 *   cancelled → read-only
 *
 * Lines table (read-only) shows CONSUMPTION COLUMNS:
 *   requestedQty | consumedQty | remainingQty (= requested - consumed)
 *   Visual progress bar per line showing how much of the authorised RMA has been consumed.
 *
 * Doc-chain card:
 *   baseDocRef  — the Delivery Note this RR was raised against
 *   targetDocRefs — Return Notes created from this RR
 *
 * Status badge colours — Night Observatory phase map (spec §5.2), routed
 * through the single canonical helper in components/sales/statusPhase.ts:
 *   draft     → phase.empty
 *   open      → phase.inoculated
 *   closed    → phase.resting
 *   cancelled → phase.decommissioned
 *
 * Modals (delete confirm) do NOT close on overlay click — X button only.
 * Audit History button (GhostButton) opens SalesAuditHistoryModal — visible on all statuses.
 *
 * Route: /sales/return-requests/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { ExternalLink, FileText } from 'lucide-react';
import { glassPanel, glassControl, glassOpaque, monoLabel, phaseBadge } from '@a64core/shared';
import {
  useReturnRequest,
  useTransitionReturnRequest,
  useDeleteReturnRequest,
} from '../../hooks/queries/useReturnRequests';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type {
  ReturnRequestStatus,
  ReturnRequestLine,
  DocumentLinkRef,
  ReturnReason,
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

const StatusBadge = styled.span<{ $status: ReturnRequestStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4).
const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
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
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

const SecondaryButton = styled.button`
  ${glassControl}
  padding: 9px 18px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  cursor: pointer;
  transition: background 150ms ease;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.glass.hi}; }
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const DangerButton = styled.button`
  padding: 9px 18px;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: background 150ms ease;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { background: rgba(240, 138, 112, 0.26); }
`;

const GhostButton = styled.button`
  padding: 9px 18px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const Card = styled.div`
  ${glassPanel}
  padding: 24px;
  margin-bottom: 24px;
`;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
`;

const InfoItem = styled.div`
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
  font-weight: 500;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
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
  vertical-align: middle;
`;

// Consumption progress bar components
const ProgressContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 120px;
`;

const ProgressBar = styled.div`
  height: 6px;
  border-radius: 3px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $pct: number; $isComplete: boolean }>`
  height: 100%;
  width: ${({ $pct }) => Math.min(100, $pct)}%;
  border-radius: 3px;
  background: ${({ $isComplete, theme }) => ($isComplete ? theme.colors.bright.lapis : theme.colors.bright.emerald)};
  transition: width 0.3s ease;
`;

const ProgressText = styled.span`
  font-size: 11px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.celeste};
`;

// Tooltipped "coming soon" wrapper for Create Return Note
const TooltipWrapper = styled.div`
  position: relative;
  display: inline-flex;

  &:hover > span {
    opacity: 1;
    pointer-events: auto;
  }
`;

const Tooltip = styled.span`
  ${glassOpaque}
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 10;
`;

// Doc-chain components
const DocChainItem = styled.button`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bright.lapis};
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const DocChainRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

// Delete confirmation modal — canonical treatment (spec §4): glassPanel at
// blur 24px over a cosmos scrim. Closes only via X button.
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
  max-width: 420px;
  width: 90%;
  position: relative;
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 12px;
`;

const ModalBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 24px;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 20px;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  line-height: 1;
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ActionError = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.bright.coral};
  margin-bottom: 16px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<ReturnReason, string> = {
  damaged: 'Damaged',
  wrong_item: 'Wrong Item',
  overshipped: 'Overshipped',
  customer_change: 'Customer Changed Mind',
  quality: 'Quality Issue',
  other: 'Other',
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: ReturnRequestStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function docTypeLabel(docType: string): string {
  switch (docType) {
    case 'DELIVERY': return 'DN';
    case 'AR_INVOICE': return 'ARI';
    case 'SALES_ORDER': return 'SO';
    case 'RETURN_REQUEST': return 'RR';
    case 'RETURN': return 'RTN';
    case 'AR_CREDIT_NOTE': return 'ARC';
    default: return docType;
  }
}

function docTypeRoute(ref: DocumentLinkRef): string | null {
  switch (ref.docType) {
    case 'SALES_ORDER': return `/sales/orders-v2/${ref.docId}`;
    case 'AR_INVOICE': return `/sales/ar-invoices/${ref.docId}`;
    case 'DELIVERY': return `/sales/deliveries/${ref.docId}`;
    case 'RETURN_REQUEST': return `/sales/return-requests/${ref.docId}`;
    default: return null;
  }
}

// ─── Consumption bar sub-component ────────────────────────────────────────────

interface ConsumptionCellProps {
  requestedQty: number;
  consumedQty: number;
}

function ConsumptionCell({ requestedQty, consumedQty }: ConsumptionCellProps) {
  const remaining = Math.max(0, requestedQty - consumedQty);
  const pct = requestedQty > 0 ? (consumedQty / requestedQty) * 100 : 0;
  const isComplete = remaining === 0;

  return (
    <ProgressContainer>
      <ProgressBar>
        <ProgressFill $pct={pct} $isComplete={isComplete} />
      </ProgressBar>
      <ProgressText>
        {consumedQty.toLocaleString('en-AE', { maximumFractionDigits: 3 })} of{' '}
        {requestedQty.toLocaleString('en-AE', { maximumFractionDigits: 3 })} consumed
        {' '}({Math.round(pct)}%)
      </ProgressText>
    </ProgressContainer>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReturnRequestDetailPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { docId } = useParams<{ docId: string }>();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';
  const isSuperAdmin = user?.role === 'super_admin';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data: rr, isLoading, error } = useReturnRequest(docId, orgId);
  const transitionMut = useTransitionReturnRequest();
  const deleteMut = useDeleteReturnRequest();

  // ── Action handlers ───────────────────────────────────────────────────────

  const handlePost = async () => {
    if (!rr) return;
    setActionError('');
    try {
      await transitionMut.mutateAsync({
        docId: rr.docEntry,
        transition: { newStatus: 'open' },
        orgId,
      });
    } catch {
      setActionError('Failed to post Return Request. Please check the data and try again.');
    }
  };

  const handleCancel = async () => {
    if (!rr) return;
    setActionError('');
    try {
      await transitionMut.mutateAsync({
        docId: rr.docEntry,
        transition: { newStatus: 'cancelled' },
        orgId,
      });
    } catch {
      setActionError('Failed to cancel Return Request.');
    }
  };

  const handleDelete = async () => {
    if (!rr) return;
    setActionError('');
    try {
      await deleteMut.mutateAsync({ docId: rr.docEntry, orgId });
      navigate('/sales/return-requests');
    } catch {
      setActionError('Failed to delete Return Request. Only draft documents can be deleted.');
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) return <Container>Loading...</Container>;
  if (error || !rr) {
    return (
      <Container style={{ color: theme.colors.error }}>
        Return Request not found.
      </Container>
    );
  }

  const totalRequestedQty = rr.lines.reduce(
    (sum, l) => sum + Number(l.requestedQty), 0
  );
  const totalConsumedQty = rr.lines.reduce(
    (sum, l) => sum + Number(l.consumedQty), 0
  );
  const totalRemainingQty = Math.max(0, totalRequestedQty - totalConsumedQty);

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/return-requests')}>
        ← Return Requests
      </BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>Return Request <DocNo>{rr.docNumber}</DocNo></Title>
          <StatusBadge $status={rr.status}>{statusLabel(rr.status)}</StatusBadge>
        </TitleGroup>

        <ActionBar>
          {rr.status === 'draft' && (
            <>
              <SecondaryButton
                onClick={() => navigate(`/sales/return-requests/${rr.docEntry}/edit`)}
              >
                Edit
              </SecondaryButton>
              <PrimaryButton
                onClick={handlePost}
                disabled={transitionMut.isPending}
              >
                Post (Authorise RMA)
              </PrimaryButton>
              <DangerButton
                onClick={() => setShowDeleteModal(true)}
                disabled={deleteMut.isPending}
              >
                Delete
              </DangerButton>
            </>
          )}

          {rr.status === 'open' && (
            <>
              {/*
               * Create Return Note button — navigates to /sales/returns-v2/from-rr/:rrDocEntry.
               * That route does not exist yet (T-200.7). The tooltip warns the user.
               * The button is intentionally enabled to allow future wire-up without code changes.
               */}
              <TooltipWrapper>
                <PrimaryButton
                  onClick={() =>
                    navigate(`/sales/returns-v2/from-rr/${rr.docEntry}`)
                  }
                >
                  <FileText size={15} />
                  Create Return Note
                </PrimaryButton>
                <Tooltip>Return Note (T-200.7) is not yet available</Tooltip>
              </TooltipWrapper>

              {isSuperAdmin && (
                <DangerButton
                  onClick={handleCancel}
                  disabled={transitionMut.isPending}
                >
                  Cancel RMA
                </DangerButton>
              )}
            </>
          )}
          <GhostButton onClick={() => setShowAuditModal(true)}>Audit History</GhostButton>
        </ActionBar>
      </TitleRow>

      {actionError && <ActionError>{actionError}</ActionError>}

      {/* ── Info grid ── */}
      <Card>
        <SectionTitle>Details</SectionTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Customer</InfoLabel>
            <InfoValue>{rr.customerName}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Document Date</InfoLabel>
            <InfoValue>{formatDate(rr.docDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Valid Until (RMA Window)</InfoLabel>
            <InfoValue>{formatDate(rr.validUntilDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Return Reason</InfoLabel>
            <InfoValue>{REASON_LABELS[rr.reason] ?? rr.reason}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Status</InfoLabel>
            <InfoValue>{statusLabel(rr.status)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Total Requested Qty</InfoLabel>
            <InfoValue>
              {totalRequestedQty.toLocaleString('en-AE', { maximumFractionDigits: 3 })}
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Consumed Qty</InfoLabel>
            <InfoValue>
              {totalConsumedQty.toLocaleString('en-AE', { maximumFractionDigits: 3 })}
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Remaining Qty</InfoLabel>
            <InfoValue>
              {totalRemainingQty.toLocaleString('en-AE', { maximumFractionDigits: 3 })}
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Gross Amount</InfoLabel>
            <InfoValue>
              {Number(rr.totals.gross).toLocaleString('en-AE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              AED
            </InfoValue>
          </InfoItem>
          {rr.reasonText && (
            <InfoItem style={{ gridColumn: '1 / -1' }}>
              <InfoLabel>Reason Details</InfoLabel>
              <InfoValue style={{ fontWeight: 400, whiteSpace: 'pre-line' }}>
                {rr.reasonText}
              </InfoValue>
            </InfoItem>
          )}
          {rr.notes && (
            <InfoItem style={{ gridColumn: '1 / -1' }}>
              <InfoLabel>Internal Notes</InfoLabel>
              <InfoValue style={{ fontWeight: 400, whiteSpace: 'pre-line' }}>
                {rr.notes}
              </InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </Card>

      {/* ── Lines table with consumption columns ── */}
      <Card>
        <SectionTitle>Return Lines — Consumption Tracking</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <Th style={{ width: 50 }}>#</Th>
                <Th>Item Code</Th>
                <Th>Item Name</Th>
                <Th>Description</Th>
                <Th style={{ textAlign: 'right', width: 110 }}>Requested Qty</Th>
                <Th style={{ textAlign: 'right', width: 110 }}>Consumed Qty</Th>
                <Th style={{ textAlign: 'right', width: 110 }}>Remaining Qty</Th>
                <Th>Consumption</Th>
                <Th>UoM</Th>
                <Th style={{ textAlign: 'right' }}>Unit Price</Th>
                <Th style={{ textAlign: 'right' }}>Line Gross</Th>
              </tr>
            </thead>
            <tbody>
              {rr.lines.map((line: ReturnRequestLine) => {
                const requested = Number(line.requestedQty);
                const consumed = Number(line.consumedQty);
                const remaining = Math.max(0, requested - consumed);
                return (
                  <tr key={line.lineId}>
                    <Td>{line.lineNumber}</Td>
                    <Td>
                      <strong style={{ fontFamily: theme.typography.fontFamily.mono, fontSize: 13 }}>
                        {line.itemCode}
                      </strong>
                    </Td>
                    <Td>{line.itemName}</Td>
                    <Td style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                      {line.description || '—'}
                    </Td>
                    <Td style={{ textAlign: 'right', fontFamily: theme.typography.fontFamily.mono, fontSize: 13 }}>
                      {requested.toLocaleString('en-AE', { maximumFractionDigits: 3 })}
                    </Td>
                    <Td style={{ textAlign: 'right', fontFamily: theme.typography.fontFamily.mono, fontSize: 13 }}>
                      {consumed > 0 ? (
                        <span style={{ color: theme.colors.bright.lapis, fontWeight: 600 }}>
                          {consumed.toLocaleString('en-AE', { maximumFractionDigits: 3 })}
                        </span>
                      ) : (
                        <span style={{ color: theme.colors.muted }}>—</span>
                      )}
                    </Td>
                    <Td style={{ textAlign: 'right', fontFamily: theme.typography.fontFamily.mono, fontSize: 13 }}>
                      {remaining > 0 ? (
                        <span style={{ color: theme.colors.bright.emerald, fontWeight: 600 }}>
                          {remaining.toLocaleString('en-AE', { maximumFractionDigits: 3 })}
                        </span>
                      ) : (
                        <span style={{ color: theme.colors.bright.lapis }}>Fully Consumed</span>
                      )}
                    </Td>
                    <Td>
                      <ConsumptionCell
                        requestedQty={requested}
                        consumedQty={consumed}
                      />
                    </Td>
                    <Td>{line.uom}</Td>
                    <Td style={{ textAlign: 'right', fontFamily: theme.typography.fontFamily.mono, fontSize: 13 }}>
                      {Number(line.unitPrice).toLocaleString('en-AE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}
                    </Td>
                    <Td
                      style={{
                        textAlign: 'right',
                        fontFamily: theme.typography.fontFamily.mono,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {Number(line.lineGross).toLocaleString('en-AE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>

        {/* Totals footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 32,
            marginTop: 16,
            paddingTop: 12,
            borderTop: `1px solid ${theme.colors.border}`,
          }}
        >
          <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
            Net: <strong style={{ color: theme.colors.textPrimary }}>
              {Number(rr.totals.net).toLocaleString('en-AE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} AED
            </strong>
          </span>
          <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
            Tax: <strong style={{ color: theme.colors.textPrimary }}>
              {Number(rr.totals.tax).toLocaleString('en-AE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} AED
            </strong>
          </span>
          <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
            Gross: <strong style={{ color: theme.colors.textPrimary, fontSize: 15 }}>
              {Number(rr.totals.gross).toLocaleString('en-AE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} AED
            </strong>
          </span>
        </div>
      </Card>

      {/* ── Doc-chain card ── */}
      <Card>
        <SectionTitle>Document Chain</SectionTitle>

        {/* Source Delivery (baseDocRef) */}
        {rr.baseDocRef && (
          <div style={{ marginBottom: 16 }}>
            <InfoLabel style={{ display: 'block', marginBottom: 8 }}>
              Source Document
            </InfoLabel>
            <DocChainRow>
              <DocChainItem
                onClick={() => {
                  const route = docTypeRoute(rr.baseDocRef!);
                  if (route) navigate(route);
                }}
              >
                <ExternalLink size={13} />
                {docTypeLabel(rr.baseDocRef.docType)} — {rr.baseDocRef.docNumber}
              </DocChainItem>
            </DocChainRow>
          </div>
        )}

        {/* Downstream Return Notes (targetDocRefs) */}
        {rr.targetDocRefs && rr.targetDocRefs.length > 0 && (
          <div>
            <InfoLabel style={{ display: 'block', marginBottom: 8 }}>
              Return Notes
            </InfoLabel>
            <DocChainRow>
              {rr.targetDocRefs.map((ref: DocumentLinkRef, i: number) => {
                const route = docTypeRoute(ref);
                return (
                  <DocChainItem
                    key={`${ref.docId}-${i}`}
                    onClick={() => route && navigate(route)}
                    style={{ cursor: route ? 'pointer' : 'default' }}
                  >
                    <ExternalLink size={13} />
                    {docTypeLabel(ref.docType)} — {ref.docNumber}
                  </DocChainItem>
                );
              })}
            </DocChainRow>
          </div>
        )}

        {!rr.baseDocRef && (!rr.targetDocRefs || rr.targetDocRefs.length === 0) && (
          <span style={{ color: theme.colors.textDisabled, fontSize: 14 }}>No linked documents.</span>
        )}
      </Card>

      {/* ── Attachments ── */}
      <Card>
        <SectionTitle>Attachments</SectionTitle>
        <AttachmentList docId={rr.docEntry} docType="RETURN_REQUEST" />
      </Card>

      <SalesAuditHistoryModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        organizationId={orgId}
        docType="RETURN_REQUEST"
        docEntry={rr.docEntry}
        docLabel={rr.docNumber}
      />

      {/* ── Delete confirmation modal (X-only close) ── */}
      {showDeleteModal && (
        <ModalOverlay
          onClick={(e) => {
            // Do NOT close on overlay click — project rule (feedback_modal_ux.md)
            e.stopPropagation();
          }}
        >
          <ModalBox>
            <CloseButton
              onClick={() => setShowDeleteModal(false)}
              aria-label="Close delete modal"
            >
              ×
            </CloseButton>
            <ModalTitle>Delete Return Request?</ModalTitle>
            <ModalBody>
              This will permanently delete <strong>{rr.docNumber}</strong>. This action cannot
              be undone. Only DRAFT Return Requests can be deleted.
            </ModalBody>
            <ModalActions>
              <SecondaryButton onClick={() => setShowDeleteModal(false)}>
                Cancel
              </SecondaryButton>
              <DangerButton
                onClick={handleDelete}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? 'Deleting...' : 'Delete'}
              </DangerButton>
            </ModalActions>
          </ModalBox>
        </ModalOverlay>
      )}
    </Container>
  );
}

export default ReturnRequestDetailPage;
