/**
 * SalesOrderDetailPage — Wave 3 (T-200.4)
 *
 * Shows a Sales Order header, fulfilment-progress lines table (read-only),
 * doc-chain card, and contextual action bar based on the SO's current status.
 *
 * Action bar logic:
 *   draft         → Edit, Post (DRAFT→OPEN), Delete
 *   open          → Create Delivery (→ T-200.5 route), Cancel (super_admin)
 *   partly_closed → Create Delivery (→ T-200.5), Cancel (super_admin)
 *   closed        → read-only with targetDocRefs links
 *   cancelled     → read-only
 *
 * Fulfilment columns: orderedQty | deliveredQty | cancelledQty | openQty
 * Each line has a visual progress bar showing % delivered.
 *
 * "Create Delivery" navigates to /sales/deliveries/from-so/:soDocEntry.
 * T-200.5 must ship to make that route live — until then it 404s.
 *
 * Attachments via AttachmentList (docType="SALES_ORDER").
 * Audit History button (GhostButton) opens SalesAuditHistoryModal — visible on all statuses.
 * Delete confirmation modal closes only via X button (project rule).
 *
 * Route: /sales/orders-v2/:docId
 */

import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { ExternalLink, Truck, FileText } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import {
  useSalesOrderV2,
  useTransitionSalesOrderV2,
  useDeleteSalesOrderV2,
} from '../../hooks/queries/useSalesOrders';
import { useSaleItemFinanceExtList } from '../../hooks/queries/useSaleItemFinanceExt';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { SalesOrderStatus, SalesOrderLine, DocumentLinkRef } from '../../services/salesApi';

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

const StatusBadge = styled.span<{ $status: SalesOrderStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-self: flex-start;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4).
const PrimaryButton = styled.button`
  padding: 10px 18px;
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
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  ${glassControl}
  padding: 10px 16px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
`;

const GhostButton = styled.button`
  padding: 10px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const DangerButton = styled.button`
  padding: 10px 16px;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: rgba(240, 138, 112, 0.26); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// Emerald action (secondary CTA, not this page's gold budget item) —
// onDark text per the onAccent audit (onAccent is gold-fill-only now).
const DeliveryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.emerald[700]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/**
 * T-201.10 — "Generate Service Invoice" secondary action button. Lapis to
 * distinguish from the emerald Delivery button — onDark text (not
 * onAccent, which is gold-fill-only per the Night Observatory redesign).
 */
const ServiceInvoiceButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: ${({ theme }) => theme.colors.bright.lapis};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.primary[600]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/**
 * T-201.10 — Type badge for SO Lines table. Repeats per-row, so kept off
 * gold (spec §3 gold-discipline) — "Service" uses terra instead of the
 * former warning/gold treatment.
 */
const TypeChip = styled.span<{ $isStock: boolean }>`
  display: inline-block;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  background: ${({ $isStock }) =>
    $isStock
      ? 'rgba(107, 138, 224, 0.16)'
      : 'rgba(232, 147, 95, 0.16)'};
  color: ${({ $isStock, theme }) =>
    $isStock
      ? theme.colors.bright.lapis
      : theme.colors.bright.terra};
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
  margin: 0 0 16px;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
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
  font-weight: 500;
`;

// Lines table
const TableWrapper = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 820px;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.celeste};
  text-align: left;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 12px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
`;

const ThRight = styled(Th)`
  text-align: right;
`;

const TdRight = styled(Td)`
  text-align: right;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

// Progress bar — segments in phase-adjacent colours per spec §4
// "Progress/distribution bars": emerald for complete, terra (not gold) for
// in-progress since this repeats per table row.
const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 99px;
  overflow: hidden;
  margin-top: 4px;
`;

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => Math.min(100, Math.max(0, $pct))}%;
  background: ${({ $pct, theme }) =>
    $pct >= 100 ? theme.colors.bright.emerald : $pct > 0 ? theme.colors.bright.terra : 'transparent'};
  border-radius: 99px;
  transition: width 300ms ease;
`;

// Doc-chain card
const DocChainList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DocChainItem = styled.li`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
`;

const DocLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.bright.lapis};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  &:hover { text-decoration: underline; }
`;

const DocTypeTag = styled.span`
  ${monoLabel}
  padding: 2px 8px;
  background: rgba(180, 200, 220, 0.07);
  border-radius: 99px;
  color: ${({ theme }) => theme.colors.celeste};
`;

const EmptyDocChain = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

// Modal — canonical treatment (spec §4): glassPanel at blur 24px over a
// cosmos scrim.
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
  line-height: 1.6;
`;

const ModalActions = styled.div`
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
  line-height: 1;
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  margin-bottom: 20px;
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAmount(amount: number, currency = 'AED'): string {
  return `${currency} ${amount.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusLabel(s: SalesOrderStatus): string {
  switch (s) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'partly_closed': return 'Partly Closed';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return s;
  }
}

function docTypeRoute(ref: DocumentLinkRef): string | null {
  switch (ref.docType) {
    case 'QUOTE': return `/sales/quotes/${ref.docId}`;
    case 'SO': return `/sales/orders-v2/${ref.docId}`;
    case 'DN': return `/sales/deliveries/${ref.docId}`;
    case 'ARI': return `/sales/ar-invoices/${ref.docId}`;
    default: return null;
  }
}

// Compute openQty for a line (orderedQty - deliveredQty - cancelledQty)
function openQty(line: SalesOrderLine): number {
  return Math.max(0, line.orderedQty - line.deliveredQty - line.cancelledQty);
}

// Delivery % for progress bar
function deliveryPct(line: SalesOrderLine): number {
  if (line.orderedQty === 0) return 0;
  return (line.deliveredQty / line.orderedQty) * 100;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesOrderDetailPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { docId } = useParams<{ docId: string }>();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: so, isLoading, isError } = useSalesOrderV2(docId, orgId);
  const transitionMut = useTransitionSalesOrderV2();
  const deleteMut = useDeleteSalesOrderV2();

  // T-201.10: Fetch item finance exts to determine isStock per SO line.
  const { data: itemFinanceExts = [] } = useSaleItemFinanceExtList(orgId);
  const itemExtByItemId = useMemo(() => {
    const map = new Map<string, { isStock: boolean }>();
    for (const ext of itemFinanceExts) {
      map.set(ext.itemId, { isStock: ext.isStock ?? true });
    }
    return map;
  }, [itemFinanceExts]);

  const isSuperAdmin = user?.role === 'super_admin';

  async function handlePost() {
    if (!docId) return;
    setActionError(null);
    try {
      await transitionMut.mutateAsync({
        docId,
        transition: { newStatus: 'open' },
        orgId,
      });
    } catch (err: unknown) {
      if (err instanceof Error) setActionError(err.message);
      else setActionError('Failed to post the Sales Order.');
    }
  }

  async function handleCancel() {
    if (!docId) return;
    setActionError(null);
    try {
      await transitionMut.mutateAsync({
        docId,
        transition: { newStatus: 'cancelled', reason: 'Cancelled by user' },
        orgId,
      });
    } catch (err: unknown) {
      if (err instanceof Error) setActionError(err.message);
      else setActionError('Failed to cancel the Sales Order.');
    }
  }

  async function handleDelete() {
    if (!docId) return;
    setActionError(null);
    try {
      await deleteMut.mutateAsync({ docId, orgId });
      navigate('/sales/orders-v2');
    } catch (err: unknown) {
      if (err instanceof Error) setActionError(err.message);
      else setActionError('Failed to delete the Sales Order.');
    } finally {
      setShowDeleteModal(false);
    }
  }

  function handleCreateDelivery() {
    if (so) navigate(`/sales/deliveries/from-so/${so.docEntry}`);
  }

  // T-201.10: Navigate to the from-SO AR Invoice form for service lines.
  function handleCreateServiceInvoice() {
    if (so) navigate(`/sales/ar-invoices/from-so/${so.docEntry}`);
  }

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/orders-v2')}>← Sales Orders</BackLink>
        <Card>
          <p style={{ color: theme.colors.textSecondary }}>Loading…</p>
        </Card>
      </Container>
    );
  }

  if (isError || !so) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/orders-v2')}>← Sales Orders</BackLink>
        <ErrorBanner>Sales Order not found or failed to load.</ErrorBanner>
      </Container>
    );
  }

  const isDraft = so.status === 'draft';
  const isOpen = so.status === 'open';
  const isPartlyClosed = so.status === 'partly_closed';
  const isClosed = so.status === 'closed';

  // T-201.10: Determine if the SO has any service lines with open invoice qty.
  // A service line has open qty when: orderedQty - invoicedQty - cancelledQty > 0.
  const hasUnbilledServiceLines =
    (isOpen || isPartlyClosed) &&
    so.lines.some((l) => {
      const isService = itemExtByItemId.get(l.itemId)?.isStock === false;
      const openInvoiceQty = Math.max(0, l.orderedQty - l.invoicedQty - l.cancelledQty);
      return isService && openInvoiceQty > 0;
    });

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/orders-v2')}>← Sales Orders</BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>Sales Order <DocNo>{so.docNumber}</DocNo></Title>
          <StatusBadge $status={so.status}>{statusLabel(so.status)}</StatusBadge>
        </TitleGroup>

        <ActionBar>
          {isDraft && (
            <>
              <SecondaryButton onClick={() => navigate(`/sales/orders-v2/${so.docEntry}/edit`)}>
                Edit
              </SecondaryButton>
              <PrimaryButton
                onClick={handlePost}
                disabled={transitionMut.isPending}
              >
                {transitionMut.isPending ? 'Posting…' : 'Post (→ Open)'}
              </PrimaryButton>
              <DangerButton
                onClick={() => setShowDeleteModal(true)}
                disabled={deleteMut.isPending}
              >
                Delete
              </DangerButton>
            </>
          )}

          {(isOpen || isPartlyClosed) && (
            <>
              <DeliveryButton onClick={handleCreateDelivery}>
                <Truck size={16} />
                Create Delivery
              </DeliveryButton>
              {/* T-201.10: Generate Service Invoice — shown when SO has unbilled service lines */}
              {hasUnbilledServiceLines && (
                <ServiceInvoiceButton onClick={handleCreateServiceInvoice}>
                  <FileText size={16} />
                  Generate Service Invoice
                </ServiceInvoiceButton>
              )}
              {isSuperAdmin && (
                <DangerButton
                  onClick={handleCancel}
                  disabled={transitionMut.isPending}
                >
                  {transitionMut.isPending ? 'Cancelling…' : 'Cancel SO'}
                </DangerButton>
              )}
            </>
          )}
          <GhostButton onClick={() => setShowAuditModal(true)}>Audit History</GhostButton>
        </ActionBar>
      </TitleRow>

      {actionError && <ErrorBanner>{actionError}</ErrorBanner>}

      {/* Info grid */}
      <Card>
        <SectionTitle>Order Details</SectionTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Customer</InfoLabel>
            <InfoValue>{so.customerName}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>BP Ref No</InfoLabel>
            <InfoValue>{so.bpRefNo ?? '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Order Date</InfoLabel>
            <InfoValue>{formatDate(so.docDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Delivery Date</InfoLabel>
            <InfoValue>{formatDate(so.deliveryDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Currency</InfoLabel>
            <InfoValue>{so.currency} @ {so.exchangeRate}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Payment Terms</InfoLabel>
            <InfoValue>{so.paymentTermsId ?? '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Net Total</InfoLabel>
            <InfoValue>{formatAmount(so.totals.net, so.currency)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Tax Total</InfoLabel>
            <InfoValue>{formatAmount(so.totals.tax, so.currency)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Gross Total</InfoLabel>
            <InfoValue style={{ fontWeight: 700, fontSize: 15 }}>
              {formatAmount(so.totals.gross, so.currency)}
            </InfoValue>
          </InfoItem>
          {so.notes && (
            <InfoItem style={{ gridColumn: '1 / -1' }}>
              <InfoLabel>Notes</InfoLabel>
              <InfoValue style={{ fontWeight: 400 }}>{so.notes}</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </Card>

      {/* Lines table with fulfilment columns — T-201.10 adds Type + per-type columns */}
      <Card>
        <SectionTitle>Order Lines — Fulfilment Progress</SectionTitle>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Type</Th>
                <Th>Item</Th>
                <Th>Description</Th>
                <Th>UOM</Th>
                <ThRight>Unit Price</ThRight>
                <ThRight>Line Gross</ThRight>
                <ThRight>Ordered</ThRight>
                {/* Stock lines: Delivered column; service lines: Invoiced Qty column */}
                <ThRight>Delivered</ThRight>
                <ThRight>Invoiced</ThRight>
                <ThRight>Cancelled</ThRight>
                <ThRight>Open</ThRight>
                <Th style={{ minWidth: 100 }}>Progress</Th>
              </tr>
            </thead>
            <tbody>
              {so.lines.map((line) => {
                const isService = itemExtByItemId.get(line.itemId)?.isStock === false;
                const pct = deliveryPct(line);
                const oQty = openQty(line);
                // For service lines open qty includes both delivery and invoice tracking.
                const serviceOpenQty = Math.max(
                  0,
                  line.orderedQty - line.invoicedQty - line.cancelledQty,
                );
                return (
                  <tr key={line.lineId}>
                    <Td style={{ color: theme.colors.textSecondary }}>{line.lineNumber}</Td>
                    <Td>
                      <TypeChip $isStock={!isService}>
                        {isService ? 'Service' : 'Stock'}
                      </TypeChip>
                    </Td>
                    <Td>
                      <div style={{ fontWeight: 500 }}>{line.itemCode}</div>
                      <div style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{line.itemName}</div>
                    </Td>
                    <Td style={{ color: theme.colors.textSecondary }}>{line.description || '—'}</Td>
                    <Td>{line.uom}</Td>
                    <TdRight>{formatAmount(line.unitPrice, so.currency)}</TdRight>
                    <TdRight>{formatAmount(line.lineGross, so.currency)}</TdRight>
                    <TdRight style={{ fontWeight: 600 }}>{line.orderedQty}</TdRight>
                    {/* Stock: show deliveredQty; Service: show — */}
                    <TdRight style={{ color: theme.colors.bright.emerald }}>
                      {isService ? '—' : line.deliveredQty}
                    </TdRight>
                    {/* Service: show invoicedQty; Stock: show — */}
                    <TdRight style={{ color: theme.colors.bright.emerald }}>
                      {isService ? line.invoicedQty : '—'}
                    </TdRight>
                    <TdRight style={{ color: theme.colors.bright.coral }}>{line.cancelledQty}</TdRight>
                    <TdRight style={{ fontWeight: 600, color: (isService ? serviceOpenQty : oQty) > 0 ? theme.colors.bright.terra : theme.colors.celeste }}>
                      {isService ? serviceOpenQty : oQty}
                    </TdRight>
                    <Td>
                      {isService ? (
                        <>
                          <div style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 2 }}>
                            {line.orderedQty > 0
                              ? ((line.invoicedQty / line.orderedQty) * 100).toFixed(0)
                              : '0'}% invoiced
                          </div>
                          <ProgressBar>
                            <ProgressFill
                              $pct={
                                line.orderedQty > 0
                                  ? (line.invoicedQty / line.orderedQty) * 100
                                  : 0
                              }
                            />
                          </ProgressBar>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 2 }}>
                            {pct.toFixed(0)}% delivered
                          </div>
                          <ProgressBar>
                            <ProgressFill $pct={pct} />
                          </ProgressBar>
                        </>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>

      {/* Doc-chain card */}
      <Card>
        <SectionTitle>Document Chain</SectionTitle>
        <div style={{ marginBottom: 16 }}>
          <InfoLabel style={{ marginBottom: 8 }}>Source Document (Quote)</InfoLabel>
          {so.baseDocRef ? (
            <DocChainList>
              <DocChainItem>
                <DocTypeTag>{so.baseDocRef.docType}</DocTypeTag>
                <DocLink onClick={() => {
                  const route = docTypeRoute(so.baseDocRef!);
                  if (route) navigate(route);
                }}>
                  {so.baseDocRef.docNumber}
                  <ExternalLink size={12} />
                </DocLink>
              </DocChainItem>
            </DocChainList>
          ) : (
            <EmptyDocChain>No source document (direct SO).</EmptyDocChain>
          )}
        </div>

        <div>
          <InfoLabel style={{ marginBottom: 8 }}>Target Documents (Deliveries / AR Invoices)</InfoLabel>
          {so.targetDocRefs.length > 0 ? (
            <DocChainList>
              {so.targetDocRefs.map((ref, i) => {
                const route = docTypeRoute(ref);
                return (
                  <DocChainItem key={i}>
                    <DocTypeTag>{ref.docType}</DocTypeTag>
                    {route ? (
                      <DocLink onClick={() => navigate(route)}>
                        {ref.docNumber}
                        <ExternalLink size={12} />
                      </DocLink>
                    ) : (
                      <span style={{ fontSize: 13 }}>{ref.docNumber}</span>
                    )}
                  </DocChainItem>
                );
              })}
            </DocChainList>
          ) : (
            <EmptyDocChain>
              {(isOpen || isPartlyClosed)
                ? 'No deliveries yet. Use "Create Delivery" to begin fulfilment.'
                : 'No target documents.'}
            </EmptyDocChain>
          )}
        </div>

        {isClosed && so.targetDocRefs.length === 0 && (
          <p style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 12, marginBottom: 0 }}>
            This SO is closed. All lines have been fulfilled via delivery documents.
          </p>
        )}
      </Card>

      {/* Attachments */}
      <Card>
        <SectionTitle>Attachments</SectionTitle>
        {docId && <AttachmentList docType="SALES_ORDER" docId={docId} />}
      </Card>

      <SalesAuditHistoryModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        organizationId={orgId}
        docType="SALES_ORDER"
        docEntry={so.docEntry}
        docLabel={so.docNumber}
      />

      {/* Delete confirmation modal — X button only, no overlay close */}
      {showDeleteModal && (
        <ModalOverlay>
          <ModalBox style={{ position: 'relative' }}>
            <ModalCloseBtn
              aria-label="Close modal"
              onClick={() => setShowDeleteModal(false)}
            >
              ×
            </ModalCloseBtn>
            <ModalTitle>Delete Sales Order?</ModalTitle>
            <ModalBody>
              This will permanently delete Sales Order <strong>{so.docNumber}</strong>.
              If this SO was created from a Quote, the Quote's consumed quantity will be
              restored. This action cannot be undone.
            </ModalBody>
            <ModalActions>
              <SecondaryButton onClick={() => setShowDeleteModal(false)}>
                Cancel
              </SecondaryButton>
              <DangerButton
                onClick={handleDelete}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? 'Deleting…' : 'Confirm Delete'}
              </DangerButton>
            </ModalActions>
          </ModalBox>
        </ModalOverlay>
      )}
    </Container>
  );
}
