/**
 * DeliveryDetailPage — Wave 3 (T-200.5)
 *
 * Shows a Delivery Note header, read-only lines table, doc-chain card,
 * attachments, and contextual action bar based on current status.
 *
 * Action bar logic:
 *   draft     → Edit, Post (DRAFT→OPEN), Delete
 *   open      → Generate AR Invoice (→ /sales/ar-invoices/from-delivery/:dnDocEntry),
 *               Cancel (super_admin only, OPEN→CANCELLED)
 *   cancelled → read-only
 *
 * Lines table shows: #, itemCode, itemName, description, qty, uom,
 *   warehouse, returnedQty (with "X of Y returned" indicator when > 0).
 *
 * Doc-chain card: baseDocRef (the source SO) + targetDocRefs (AR Invoice, Returns).
 *
 * Attachments via AttachmentList (docType="DELIVERY").
 *
 * Modals (delete confirm) do NOT close on overlay click — X button only.
 * Audit History button (GhostButton) opens SalesAuditHistoryModal — visible on all statuses.
 *
 * Route: /sales/deliveries/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { ExternalLink, FileText } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import {
  useDelivery,
  useTransitionDelivery,
  useDeleteDelivery,
} from '../../hooks/queries/useDeliveries';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { DeliveryStatus, DeliveryLine, DocumentLinkRef } from '../../services/salesApi';

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

const StatusBadge = styled.span<{ $status: DeliveryStatus }>`
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

// Repeats per-row — kept off gold (spec §3 gold-discipline budget) even
// though it flags an "attention" state. bright.terra reads as an amber-ish
// highlight without spending the gold budget.
const ReturnedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(232, 147, 95, 0.16);
  color: ${({ theme }) => theme.colors.bright.terra};
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 6px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

/**
 * Badge for the per-line Invoiced Qty column.
 * Zero → muted grey dash; any positive → lapis-tinted display.
 */
const InvoicedBadge = styled.span<{ $zero: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: ${({ $zero }) => ($zero ? 'transparent' : 'rgba(107, 138, 224, 0.16)')};
  color: ${({ $zero, theme }) => ($zero ? theme.colors.muted : theme.colors.bright.lapis)};
  border-radius: 99px;
  font-size: 11px;
  font-weight: ${({ $zero }) => ($zero ? 400 : 600)};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

/**
 * Badge for the per-line Open to Invoice column.
 * full open (= delivered qty) → emerald; partial → terra (NOT gold — this
 * repeats per row, see spec §3 gold-discipline); zero → muted grey.
 */
const OpenInvoiceBadge = styled.span<{ $state: 'full' | 'partial' | 'zero' }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: ${({ $state }) => {
    switch ($state) {
      case 'full':    return 'rgba(84, 211, 155, 0.16)';
      case 'partial': return 'rgba(232, 147, 95, 0.16)';
      case 'zero':    return 'transparent';
    }
  }};
  color: ${({ $state, theme }) => {
    switch ($state) {
      case 'full':    return theme.colors.bright.emerald;
      case 'partial': return theme.colors.bright.terra;
      case 'zero':    return theme.colors.muted;
    }
  }};
  border-radius: 99px;
  font-size: 11px;
  font-weight: ${({ $state }) => ($state === 'zero' ? 400 : 600)};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

/** Muted chip shown in the action bar when all lines are fully invoiced. */
const FullyInvoicedChip = styled.span`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  font-weight: 500;
`;

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

// ── Delete confirmation modal ──────────────────────────────────────────────────

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
  color: ${({ theme }) => theme.colors.textSecondary};
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
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  line-height: 1;
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function statusLabel(status: DeliveryStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function docTypeLabel(docType: string): string {
  switch (docType) {
    case 'DELIVERY': return 'DN';
    case 'AR_INVOICE': return 'ARI';
    case 'SALES_ORDER': return 'SO';
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
    default: return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeliveryDetailPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { docId } = useParams<{ docId: string }>();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';
  const isSuperAdmin = user?.role === 'super_admin';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data: dn, isLoading, error } = useDelivery(docId, orgId);
  const transitionMut = useTransitionDelivery();
  const deleteMut = useDeleteDelivery();

  // ── Action handlers ───────────────────────────────────────────────────────

  const handlePost = async () => {
    if (!dn) return;
    setActionError('');
    try {
      await transitionMut.mutateAsync({
        docId: dn.docEntry,
        transition: { newStatus: 'open' },
        orgId,
      });
    } catch {
      setActionError('Failed to post delivery. Check inventory balance and try again.');
    }
  };

  const handleCancel = async () => {
    if (!dn) return;
    setActionError('');
    try {
      await transitionMut.mutateAsync({
        docId: dn.docEntry,
        transition: { newStatus: 'cancelled' },
        orgId,
      });
    } catch {
      setActionError('Failed to cancel delivery.');
    }
  };

  const handleDelete = async () => {
    if (!dn) return;
    setActionError('');
    try {
      await deleteMut.mutateAsync({ docId: dn.docEntry, orgId });
      navigate('/sales/deliveries');
    } catch {
      setActionError('Failed to delete delivery.');
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) return <Container>Loading...</Container>;
  if (error || !dn) return <Container style={{ color: theme.colors.error }}>Delivery Note not found.</Container>;

  const totalLines = dn.lines.length;
  const totalQty = dn.lines.reduce((sum, l) => sum + Number(l.quantity), 0);

  /**
   * F-2: A delivery is "fully invoiced" when every line has open_invoice_qty <= 0.
   * open_invoice_qty = max(0, quantity − invoicedQty − creditedQty − cancelledQty)
   */
  const isFullyInvoiced =
    dn.lines.length > 0 &&
    dn.lines.every((l) => {
      const open = Number(l.quantity) - Number(l.invoicedQty) - Number(l.creditedQty) - Number(l.cancelledQty);
      return open <= 0;
    });

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/deliveries')}>← Delivery Notes</BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>Delivery Note <DocNo>{dn.docNumber}</DocNo></Title>
          <StatusBadge $status={dn.status}>{statusLabel(dn.status)}</StatusBadge>
        </TitleGroup>

        <ActionBar>
          {dn.status === 'draft' && (
            <>
              <SecondaryButton onClick={() => navigate(`/sales/deliveries/${dn.docEntry}/edit`)}>
                Edit
              </SecondaryButton>
              <PrimaryButton onClick={handlePost} disabled={transitionMut.isPending}>
                Post (Confirm Shipment)
              </PrimaryButton>
              <DangerButton onClick={() => setShowDeleteModal(true)} disabled={deleteMut.isPending}>
                Delete
              </DangerButton>
            </>
          )}

          {dn.status === 'open' && (
            <>
              {/* F-2: hide "Generate AR Invoice" when all lines are fully invoiced */}
              {isFullyInvoiced ? (
                <FullyInvoicedChip>Fully Invoiced</FullyInvoicedChip>
              ) : (
                <PrimaryButton onClick={() => navigate(`/sales/ar-invoices/from-delivery/${dn.docEntry}`)}>
                  <FileText size={15} />
                  Generate AR Invoice
                </PrimaryButton>
              )}
              <SecondaryButton
                onClick={() => navigate(`/sales/return-requests/from-delivery/${dn.docEntry}`)}
              >
                Request Return (RMA)
              </SecondaryButton>
              <SecondaryButton
                onClick={() => navigate(`/sales/returns-v2/from-delivery/${dn.docEntry}`)}
              >
                Receive Return (direct)
              </SecondaryButton>
              {isSuperAdmin && (
                <DangerButton onClick={handleCancel} disabled={transitionMut.isPending}>
                  Cancel
                </DangerButton>
              )}
            </>
          )}
          <GhostButton onClick={() => setShowAuditModal(true)}>Audit History</GhostButton>
        </ActionBar>
      </TitleRow>

      {actionError && (
        <div style={{
          background: theme.colors.errorBg,
          border: '1px solid rgba(240, 138, 112, 0.45)',
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: 14,
          color: theme.colors.bright.coral,
          marginBottom: 16,
        }}>
          {actionError}
        </div>
      )}

      {/* ── Info grid ── */}
      <Card>
        <SectionTitle>Details</SectionTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Customer</InfoLabel>
            <InfoValue>{dn.customerName}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Document Date</InfoLabel>
            <InfoValue>{formatDate(dn.docDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Actual Delivery Date</InfoLabel>
            <InfoValue>{formatDate(dn.actualDeliveryDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Status</InfoLabel>
            <InfoValue>{statusLabel(dn.status)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Total Lines</InfoLabel>
            <InfoValue>{totalLines}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Total Qty Shipped</InfoLabel>
            <InfoValue>{totalQty.toLocaleString('en-AE', { maximumFractionDigits: 3 })}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Total COGS</InfoLabel>
            <InfoValue>
              {Number(dn.totalCogs).toLocaleString('en-AE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} AED
            </InfoValue>
          </InfoItem>
          {dn.notes && (
            <InfoItem style={{ gridColumn: '1 / -1' }}>
              <InfoLabel>Notes</InfoLabel>
              <InfoValue style={{ fontWeight: 400, whiteSpace: 'pre-line' }}>{dn.notes}</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </Card>

      {/* ── Lines table ── */}
      <Card>
        <SectionTitle>Lines</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <Th style={{ width: 50 }}>#</Th>
                <Th>Item Code</Th>
                <Th>Item Name</Th>
                <Th>Description</Th>
                <Th style={{ textAlign: 'right' }}>Qty</Th>
                {/* F-1: Invoiced + Open to Invoice columns. "Open Qty" rename
                    2026-06-02 — see DeliveriesPage for rationale. Stays as a
                    quantity sum here too (per-line); "Line COGS" further right
                    is the money. */}
                <Th style={{ textAlign: 'right' }}>Invoiced Qty</Th>
                <Th style={{ textAlign: 'right' }}>Open Qty</Th>
                <Th>UoM</Th>
                <Th>Warehouse</Th>
                <Th style={{ textAlign: 'right' }}>Returned</Th>
                <Th style={{ textAlign: 'right' }}>Unit Cost</Th>
                <Th style={{ textAlign: 'right' }}>Line COGS</Th>
              </tr>
            </thead>
            <tbody>
              {dn.lines.map((line: DeliveryLine) => {
                const returnedQty = Number(line.returnedQty ?? 0);
                const qty = Number(line.quantity);
                // F-1: per-line invoiced + open-to-invoice computation
                const invoicedQty = Number(line.invoicedQty);
                const openQty = Math.max(
                  0,
                  qty - invoicedQty - Number(line.creditedQty) - Number(line.cancelledQty),
                );
                const openState: 'full' | 'partial' | 'zero' =
                  openQty <= 0
                    ? 'zero'
                    : openQty >= qty
                    ? 'full'
                    : 'partial';
                return (
                  <tr key={line.lineId}>
                    <Td>{line.lineNumber}</Td>
                    <Td>
                      <strong style={{ fontFamily: theme.typography.fontFamily.mono, fontSize: 13 }}>
                        {line.itemCode}
                      </strong>
                    </Td>
                    <Td>{line.itemName}</Td>
                    <Td style={{ color: theme.colors.textSecondary, fontSize: 13 }}>{line.description}</Td>
                    <Td style={{ textAlign: 'right' }}>
                      {qty.toLocaleString('en-AE', { maximumFractionDigits: 3 })}
                    </Td>
                    {/* F-1: Invoiced column */}
                    <Td style={{ textAlign: 'right' }}>
                      <InvoicedBadge $zero={invoicedQty === 0}>
                        {invoicedQty === 0 ? '—' : invoicedQty.toFixed(3)}
                      </InvoicedBadge>
                    </Td>
                    {/* F-1: Open to Invoice column */}
                    <Td style={{ textAlign: 'right' }}>
                      <OpenInvoiceBadge $state={openState}>
                        {openState === 'zero' ? '—' : openQty.toFixed(3)}
                      </OpenInvoiceBadge>
                    </Td>
                    <Td>{line.uom}</Td>
                    <Td style={{ fontSize: 12, color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.mono }}>
                      {line.warehouseId}
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      {returnedQty > 0 ? (
                        <ReturnedBadge title={`${returnedQty} of ${qty} returned`}>
                          {returnedQty.toFixed(3)} of {qty.toFixed(3)}
                        </ReturnedBadge>
                      ) : (
                        <span style={{ color: theme.colors.border, fontSize: 12 }}>—</span>
                      )}
                    </Td>
                    <Td style={{ textAlign: 'right', fontFamily: theme.typography.fontFamily.mono, fontSize: 13 }}>
                      {Number(line.unitCost).toFixed(4)}
                    </Td>
                    <Td style={{ textAlign: 'right', fontFamily: theme.typography.fontFamily.mono, fontSize: 13, fontWeight: 600 }}>
                      {Number(line.lineCogs).toLocaleString('en-AE', {
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
      </Card>

      {/* ── Doc-chain card ── */}
      <Card>
        <SectionTitle>Document Chain</SectionTitle>

        {/* Source SO */}
        {dn.baseDocRef && (
          <div style={{ marginBottom: 16 }}>
            <InfoLabel style={{ display: 'block', marginBottom: 8 }}>Source</InfoLabel>
            <DocChainRow>
              <DocChainItem
                onClick={() => {
                  const route = docTypeRoute(dn.baseDocRef!);
                  if (route) navigate(route);
                }}
              >
                <ExternalLink size={13} />
                {docTypeLabel(dn.baseDocRef.docType)} — {dn.baseDocRef.docNumber}
              </DocChainItem>
            </DocChainRow>
          </div>
        )}

        {/* Target documents (ARI, Returns) */}
        {dn.targetDocRefs && dn.targetDocRefs.length > 0 && (
          <div>
            <InfoLabel style={{ display: 'block', marginBottom: 8 }}>Downstream</InfoLabel>
            <DocChainRow>
              {dn.targetDocRefs.map((ref: DocumentLinkRef, i: number) => {
                const route = docTypeRoute(ref);
                return (
                  <DocChainItem
                    key={`${ref.docId}-${i}`}
                    onClick={() => route && navigate(route)}
                  >
                    <ExternalLink size={13} />
                    {docTypeLabel(ref.docType)} — {ref.docNumber}
                  </DocChainItem>
                );
              })}
            </DocChainRow>
          </div>
        )}

        {!dn.baseDocRef && (!dn.targetDocRefs || dn.targetDocRefs.length === 0) && (
          <span style={{ color: theme.colors.textDisabled, fontSize: 14 }}>No linked documents.</span>
        )}
      </Card>

      {/* ── Attachments ── */}
      <Card>
        <SectionTitle>Attachments</SectionTitle>
        <AttachmentList docId={dn.docEntry} docType="DELIVERY" />
      </Card>

      <SalesAuditHistoryModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        organizationId={orgId}
        docType="DELIVERY"
        docEntry={dn.docEntry}
        docLabel={dn.docNumber}
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
            <CloseButton onClick={() => setShowDeleteModal(false)} aria-label="Close">×</CloseButton>
            <ModalTitle>Delete Delivery Note?</ModalTitle>
            <ModalBody>
              This will permanently delete {dn.docNumber}. This action cannot be undone.
              Only DRAFT deliveries can be deleted.
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

export default DeliveryDetailPage;
