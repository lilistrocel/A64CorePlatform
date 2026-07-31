/**
 * QuoteDetailPage — Wave 3 (T-200.3)
 *
 * Shows a Sales Quote header, lines table (read-only), doc-chain card,
 * and contextual action bar based on the quote's current status.
 *
 * Action bar logic:
 *   draft     → Edit, Post (DRAFT→OPEN), Delete
 *   open      → Cancel (OPEN→CANCELLED), Convert to Sales Order (→ T-200.4 route)
 *   closed    → read-only with link to converted SO via targetDocRefs
 *   cancelled → read-only
 *
 * "Convert to Sales Order" navigates to /sales/orders-v2/from-quote/:quoteDocEntry.
 * T-200.4 must ship to make that route live — until then the link is intentionally
 * active so when T-200.4 ships the flow just works. A tooltip warns the accountant.
 *
 * Attachments via AttachmentList (docType="QUOTE").
 * NO Audit History button — sales audit endpoint pending T-200.x.
 * Delete confirmation modal closes only via X button (project rule).
 *
 * Route: /sales/quotes/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { ExternalLink } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import {
  useQuote,
  useTransitionQuote,
  useDeleteQuote,
} from '../../hooks/queries/useQuotes';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { QuoteStatus, QuoteLine, DocumentLinkRef } from '../../services/salesApi';

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

const StatusBadge = styled.span<{ $status: QuoteStatus }>`
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
  font-size: 13px;
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

// Emerald action (secondary CTA, not the page's gold budget item) — onDark
// text per the onAccent audit (onAccent is gold-fill-only now).
const ConvertButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  position: relative;
  &:hover { background: ${({ theme }) => theme.colors.emerald[700]}; }

  /* Tooltip */
  .tooltip {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
    padding: 6px 10px;
    border-radius: 6px;
    pointer-events: none;
    transition: opacity 150ms ease;
    z-index: 10;
  }
  &:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
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

  @media (max-width: 900px) {
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
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const TableWrapper = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
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
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  &:last-child {
    text-align: right;
  }
`;

const TotalsCard = styled.div`
  ${glassPanel}
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
  margin-left: auto;
  margin-top: 16px;
`;

const TotalsRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.celeste};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const TotalsGross = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  padding-top: 10px;
`;

const DocChainCard = styled.div`
  ${glassPanel}
  padding: 16px 20px;
`;

const DocChainTitle = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 10px;
`;

const DocChainLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.bright.lapis};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 0;
  &:hover { text-decoration: underline; }
`;

const ErrorBanner = styled.div`
  padding: 16px 20px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  margin-bottom: 20px;
`;

// ─── Delete confirmation modal ────────────────────────────────────────────────
// Canonical modal treatment (spec §4): glassPanel at blur 24px over a
// cosmos scrim.

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 28px;
  max-width: 440px;
  width: calc(100vw - 32px);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.celeste};
  padding: 4px 8px;
  border-radius: 6px;
  &:hover { background: rgba(180, 200, 220, 0.07); }
`;

const ModalText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 24px;
`;

const ModalActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined): string {
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

function statusLabel(status: QuoteStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuoteDetailPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { docId } = useParams<{ docId: string }>();

  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';
  const userRole = (user as { role?: string } | null)?.role ?? '';

  const { data: quote, isLoading, isError } = useQuote(docId, orgId);
  const transitionMutation = useTransitionQuote();
  const deleteMutation = useDeleteQuote();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handlePost() {
    if (!docId || !quote) return;
    setActionError(null);
    try {
      await transitionMutation.mutateAsync({
        docId,
        transition: { newStatus: 'open' },
        orgId,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to post quote.');
    }
  }

  async function handleCancel() {
    if (!docId || !quote) return;
    setActionError(null);
    try {
      await transitionMutation.mutateAsync({
        docId,
        transition: { newStatus: 'cancelled', reason: 'Cancelled by user' },
        orgId,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel quote.');
    }
  }

  async function handleDelete() {
    if (!docId) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync({ docId, orgId });
      navigate('/sales/quotes');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete quote.');
      setShowDeleteModal(false);
    }
  }

  function handleConvertToSO() {
    if (!docId) return;
    navigate(`/sales/orders-v2/from-quote/${docId}`);
  }

  function getDocChainRoute(ref: DocumentLinkRef): string {
    switch (ref.docType) {
      case 'SO': return `/sales/orders-v2/${ref.docId}`;
      default: return '#';
    }
  }

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/quotes')}>← Back to Quotes</BackLink>
        <p style={{ color: theme.colors.textSecondary }}>Loading quote…</p>
      </Container>
    );
  }

  if (isError || !quote) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/quotes')}>← Back to Quotes</BackLink>
        <ErrorBanner>Quote not found or failed to load.</ErrorBanner>
      </Container>
    );
  }

  const isActionPending =
    transitionMutation.isPending || deleteMutation.isPending;

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/quotes')}>← Back to Quotes</BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>Sales Quote <DocNo>{quote.docNumber}</DocNo></Title>
          <StatusBadge $status={quote.status}>{statusLabel(quote.status)}</StatusBadge>
        </TitleGroup>

        <ActionBar>
          {quote.status === 'draft' && (
            <>
              <SecondaryButton
                onClick={() => navigate(`/sales/quotes/${docId}/edit`)}
                disabled={isActionPending}
              >
                Edit
              </SecondaryButton>
              <PrimaryButton onClick={handlePost} disabled={isActionPending}>
                {transitionMutation.isPending ? 'Posting…' : 'Post'}
              </PrimaryButton>
              <DangerButton
                onClick={() => setShowDeleteModal(true)}
                disabled={isActionPending}
              >
                Delete
              </DangerButton>
            </>
          )}

          {quote.status === 'open' && (
            <>
              <ConvertButton onClick={handleConvertToSO} disabled={isActionPending}>
                <ExternalLink size={14} />
                Convert to Sales Order
                <span className="tooltip">Sales Order UI lands in T-200.4</span>
              </ConvertButton>
              <DangerButton onClick={handleCancel} disabled={isActionPending}>
                {transitionMutation.isPending ? 'Cancelling…' : 'Cancel Quote'}
              </DangerButton>
            </>
          )}
          {/* T-200.x: Audit History — now wired to sales-side endpoint */}
          <GhostButton
            onClick={() => setShowAuditModal(true)}
            aria-label="Open audit history for this Quote"
          >
            Audit History
          </GhostButton>
        </ActionBar>
      </TitleRow>

      {(actionError || transitionMutation.error || deleteMutation.error) && (
        <ErrorBanner>
          {actionError ??
            (transitionMutation.error instanceof Error
              ? transitionMutation.error.message
              : deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : 'An error occurred.')}
        </ErrorBanner>
      )}

      {/* Info Grid */}
      <Card>
        <SectionTitle>Quote Details</SectionTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Customer</InfoLabel>
            <InfoValue>{quote.customerName}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>BP Ref No</InfoLabel>
            <InfoValue>{quote.bpRefNo ?? '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Quote Date</InfoLabel>
            <InfoValue>{formatDate(quote.docDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Valid Until</InfoLabel>
            <InfoValue>{formatDate(quote.validUntilDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Currency</InfoLabel>
            <InfoValue>{quote.currency}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Exchange Rate</InfoLabel>
            <InfoValue>{quote.exchangeRate}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Payment Terms</InfoLabel>
            <InfoValue>{quote.paymentTermsId ?? '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Total Gross</InfoLabel>
            <InfoValue style={{ fontWeight: 700, fontSize: 16 }}>
              {formatAmount(quote.totals.gross, quote.currency)}
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Status</InfoLabel>
            <InfoValue>
              <StatusBadge $status={quote.status}>{statusLabel(quote.status)}</StatusBadge>
            </InfoValue>
          </InfoItem>
          {quote.notes && (
            <InfoItem style={{ gridColumn: '1 / -1' }}>
              <InfoLabel>Notes</InfoLabel>
              <InfoValue>{quote.notes}</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </Card>

      {/* Lines table */}
      <Card>
        <SectionTitle>Quote Lines</SectionTitle>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Item Code</Th>
                <Th>Description</Th>
                <Th style={{ textAlign: 'right' }}>Qty</Th>
                <Th>UoM</Th>
                <Th style={{ textAlign: 'right' }}>Unit Price</Th>
                <Th style={{ textAlign: 'right' }}>Disc %</Th>
                <Th style={{ textAlign: 'right' }}>Tax %</Th>
                <Th style={{ textAlign: 'right' }}>Net</Th>
                <Th style={{ textAlign: 'right' }}>Tax</Th>
                <Th style={{ textAlign: 'right' }}>Gross</Th>
                <Th style={{ textAlign: 'right' }}>Ordered</Th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line: QuoteLine) => (
                <tr key={line.lineId}>
                  <Td style={{ textAlign: 'left' }}>{line.lineNumber}</Td>
                  <Td style={{ textAlign: 'left' }}>
                    <strong>{line.itemCode}</strong>
                    <br />
                    <span style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{line.itemName}</span>
                  </Td>
                  <Td style={{ textAlign: 'left' }}>{line.description || '—'}</Td>
                  <Td>{line.quantity.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</Td>
                  <Td style={{ textAlign: 'left' }}>{line.uom}</Td>
                  <Td>{line.unitPrice.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</Td>
                  <Td>{line.discountPercent.toLocaleString('en-AE', { minimumFractionDigits: 2 })}%</Td>
                  <Td>{line.taxPercent.toLocaleString('en-AE', { minimumFractionDigits: 2 })}%</Td>
                  <Td>{line.lineNet.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</Td>
                  <Td>{line.lineTax.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</Td>
                  <Td>{line.lineGross.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</Td>
                  <Td>
                    {/* orderedQty shows "X of Y ordered" progress when partial */}
                    {line.consumedQty > 0
                      ? `${line.consumedQty} / ${line.orderedQty}`
                      : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>

        {/* Totals */}
        <TotalsCard>
          <TotalsRow>
            <span>Net Total</span>
            <span>
              {quote.totals.net.toLocaleString('en-AE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </TotalsRow>
          <TotalsRow>
            <span>Tax Total</span>
            <span>
              {quote.totals.tax.toLocaleString('en-AE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </TotalsRow>
          <TotalsGross>
            <span>Gross Total</span>
            <span>{formatAmount(quote.totals.gross, quote.currency)}</span>
          </TotalsGross>
        </TotalsCard>
      </Card>

      {/* Document chain */}
      <Card>
        <SectionTitle>Document Chain</SectionTitle>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <DocChainCard style={{ flex: 1, minWidth: 200 }}>
            <DocChainTitle>Based On</DocChainTitle>
            <span style={{ fontSize: 14, color: theme.colors.textSecondary }}>
              Origin document — no base
            </span>
          </DocChainCard>

          <DocChainCard style={{ flex: 1, minWidth: 200 }}>
            <DocChainTitle>Resulting Sales Orders</DocChainTitle>
            {quote.targetDocRefs.length === 0 ? (
              <span style={{ fontSize: 14, color: theme.colors.textSecondary }}>
                No Sales Orders created yet
              </span>
            ) : (
              quote.targetDocRefs.map((ref) => (
                <DocChainLink
                  key={ref.docId}
                  onClick={() => navigate(getDocChainRoute(ref))}
                >
                  <ExternalLink size={12} />
                  {ref.docNumber}
                </DocChainLink>
              ))
            )}
          </DocChainCard>
        </div>
      </Card>

      {/* Attachments */}
      <Card>
        <SectionTitle>Attachments</SectionTitle>
        <AttachmentList
          docType="QUOTE"
          docId={docId!}
          organizationId={orgId}
        />
      </Card>

      {/* Delete confirmation modal — closes only via X button (project rule) */}
      {showDeleteModal && (
        <Overlay
          onClick={(e) => {
            // Do NOT close on overlay click — X button only.
            e.stopPropagation();
          }}
        >
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Delete Sales Quote</ModalTitle>
              <CloseBtn
                aria-label="Close modal"
                onClick={() => setShowDeleteModal(false)}
              >
                ×
              </CloseBtn>
            </ModalHeader>
            <ModalText>
              Are you sure you want to permanently delete <strong>{quote.docNumber}</strong>?
              This action cannot be undone. Only DRAFT quotes can be deleted.
            </ModalText>
            <ModalActions>
              <SecondaryButton onClick={() => setShowDeleteModal(false)}>
                Cancel
              </SecondaryButton>
              <DangerButton
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Quote'}
              </DangerButton>
            </ModalActions>
          </Modal>
        </Overlay>
      )}
      {/* T-200.x: Sales-side audit history modal */}
      {quote && (
        <SalesAuditHistoryModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          organizationId={orgId}
          docType="QUOTE"
          docEntry={quote.docEntry}
          docLabel={quote.docNumber}
          viewerRole={userRole}
        />
      )}
    </Container>
  );
}
