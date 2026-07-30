/**
 * ArCreditNoteDetailPage — Wave 3 (T-200.8)
 *
 * Shows an AR Credit Note header, lines table, allocations table (read-only,
 * rows clickable to AR Invoice), doc-chain card, and contextual action bar.
 *
 * Action bar logic:
 *   draft     → Edit, Post (DRAFT→OPEN), Delete
 *   open      → Cancel (super_admin only, OPEN→CANCELLED)
 *   partly_closed / closed / cancelled → read-only
 *
 * Doc-chain card shows:
 *   - baseDocRef (source AR Invoice this credits — always present after posting)
 *   - baseReturnDocRef (the RTN this financially completes, if return-driven)
 *   - targetDocRefs (refunds issued against this ARC — empty in v1)
 *
 * Allocations table: each row navigates to the credited AR Invoice.
 *
 * Delete modal closes via X button only — NOT on overlay click (project rule).
 * Audit History button (GhostButton) opens SalesAuditHistoryModal — visible on all statuses.
 *
 * Status badge colours (A20Core tokens — shared vocabulary across all
 * Wave 3 sales detail pages, see a20core-rebrand-spec.md):
 *   draft         → neutral      (neutral[100] / textSecondary)
 *   open          → emerald      (successBg / emerald[700])
 *   partly_closed → lapis        (infoBg / lapis[700])
 *   closed        → neutral (dark) (neutral[200] / neutral[800])
 *   cancelled     → terracotta   (errorBg / terracotta[700])
 *
 * Route: /sales/ar-credit-notes/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { ExternalLink } from 'lucide-react';
import { useArCreditNote, useTransitionArCreditNote, useDeleteArCreditNote } from '../../hooks/queries/useArCreditNotes';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { SalesAuditHistoryModal } from '../../components/sales/SalesAuditHistoryModal';
import type {
  ARCreditNoteStatus,
  ARCreditNoteLine,
  CreditNoteAllocation,
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

const StatusBadge = styled.span<{ $status: ARCreditNoteStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 5px 14px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'draft': return theme.colors.neutral[100];
      case 'open': return theme.colors.successBg;
      case 'partly_closed': return theme.colors.infoBg;
      case 'closed': return theme.colors.neutral[200];
      case 'cancelled': return theme.colors.errorBg;
      default: return theme.colors.neutral[100];
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'draft': return theme.colors.textSecondary;
      case 'open': return theme.colors.emerald[700];
      case 'partly_closed': return theme.colors.lapis[700];
      case 'closed': return theme.colors.neutral[800];
      case 'cancelled': return theme.colors.terracotta[700];
      default: return theme.colors.textSecondary;
    }
  }};
`;

const ActionBar = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const DangerButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.terracotta[600]};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.errorBg}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
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
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  @media (max-width: 1024px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 600px)  { grid-template-columns: 1fr; }
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  padding: 10px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const ThRight = styled(Th)`
  text-align: right;
`;

const Td = styled.td`
  padding: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const TdRight = styled(Td)`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const TotalsRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 48px;
  font-size: 14px;
  padding: 8px 12px;
`;

const TotalsLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 120px;
`;

const TotalsValue = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  min-width: 120px;
  text-align: right;
`;

const TotalsGross = styled(TotalsRow)`
  font-size: 16px;
  font-weight: 700;
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  margin-top: 4px;
  padding-top: 12px;
`;

const DocChainItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  &:last-child { border-bottom: none; }
`;

const DocChainType = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 140px;
`;

const DocChainLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  &:hover { text-decoration: underline; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  color: ${({ theme }) => theme.colors.terracotta[700]};
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

// ─── Modal (X-only close) ─────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  padding: 28px;
  max-width: 460px;
  width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ModalCloseButton = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1;
  padding: 2px;
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ModalBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 24px 0;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const AllocTr = styled.tr`
  cursor: pointer;
  &:hover td {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function statusLabel(status: ARCreditNoteStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'partly_closed': return 'Partly Closed';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function docTypeRoute(ref: DocumentLinkRef): string {
  switch (ref.docType) {
    case 'AR_INVOICE': return `/sales/ar-invoices/${ref.docId}`;
    case 'RETURN': return `/sales/returns-v2/${ref.docId}`;
    case 'RETURN_REQUEST': return `/sales/return-requests/${ref.docId}`;
    case 'DELIVERY': return `/sales/deliveries/${ref.docId}`;
    default: return '#';
  }
}

function docTypeLabel(docType: string): string {
  switch (docType) {
    case 'AR_INVOICE': return 'AR Invoice';
    case 'RETURN': return 'Return Note (RTN)';
    case 'RETURN_REQUEST': return 'Return Request (RR)';
    case 'DELIVERY': return 'Delivery Note';
    default: return docType;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ArCreditNoteDetailPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { docId } = useParams<{ docId: string }>();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';
  const userRole = (user as { role?: string } | null)?.role ?? '';
  const isSuperAdmin = userRole === 'super_admin';

  const { data: arc, isLoading, isError } = useArCreditNote(docId, orgId);
  const transitionMutation = useTransitionArCreditNote();
  const deleteMutation = useDeleteArCreditNote();

  const [actionError, setActionError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const handlePost = async () => {
    if (!arc) return;
    setActionError(null);
    setTransitioning(true);
    try {
      await transitionMutation.mutateAsync({
        docId: arc.docEntry,
        transition: { newStatus: 'open' },
        orgId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post credit note.';
      setActionError(msg);
    } finally {
      setTransitioning(false);
    }
  };

  const handleCancel = async () => {
    if (!arc) return;
    setActionError(null);
    setTransitioning(true);
    try {
      await transitionMutation.mutateAsync({
        docId: arc.docEntry,
        transition: { newStatus: 'cancelled', reason: 'Cancelled by super_admin' },
        orgId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel credit note.';
      setActionError(msg);
    } finally {
      setTransitioning(false);
    }
  };

  const handleDelete = async () => {
    if (!arc) return;
    try {
      await deleteMutation.mutateAsync({ docId: arc.docEntry, orgId });
      navigate('/sales/ar-credit-notes');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete credit note.';
      setActionError(msg);
      setShowDeleteModal(false);
    }
  };

  if (isLoading) {
    return (
      <Container>
        <EmptyState role="status">Loading AR Credit Note…</EmptyState>
      </Container>
    );
  }

  if (isError || !arc) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/ar-credit-notes')}>
          ← Back to AR Credit Notes
        </BackLink>
        <EmptyState role="alert">AR Credit Note not found.</EmptyState>
      </Container>
    );
  }

  const isDraft = arc.status === 'draft';
  const isOpen = arc.status === 'open';
  const isReadOnly = arc.status === 'partly_closed' || arc.status === 'closed' || arc.status === 'cancelled';

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/ar-credit-notes')}>
        ← Back to AR Credit Notes
      </BackLink>

      <TitleRow>
        <TitleGroup>
          <Title>AR Credit Note {arc.docNumber}</Title>
          <StatusBadge $status={arc.status}>{statusLabel(arc.status)}</StatusBadge>
        </TitleGroup>

        <ActionBar>
          {isDraft && (
            <>
              <SecondaryButton
                onClick={() => navigate(`/sales/ar-credit-notes/${arc.docEntry}/edit`)}
                aria-label="Edit this AR Credit Note"
              >
                Edit
              </SecondaryButton>
              <PrimaryButton
                onClick={handlePost}
                disabled={transitioning}
                aria-label="Post credit note (DRAFT → OPEN)"
              >
                {transitioning ? 'Posting…' : 'Post Credit Note'}
              </PrimaryButton>
              <DangerButton
                onClick={() => setShowDeleteModal(true)}
                aria-label="Delete this AR Credit Note"
              >
                Delete
              </DangerButton>
            </>
          )}
          {isOpen && isSuperAdmin && (
            <DangerButton
              onClick={handleCancel}
              disabled={transitioning}
              aria-label="Cancel this AR Credit Note (super_admin only)"
            >
              {transitioning ? 'Cancelling…' : 'Cancel Credit Note'}
            </DangerButton>
          )}
          <GhostButton onClick={() => setShowAuditModal(true)}>Audit History</GhostButton>
        </ActionBar>
      </TitleRow>

      {actionError && <ErrorBanner role="alert">{actionError}</ErrorBanner>}

      {/* ── Info Grid ── */}
      <Card>
        <CardTitle>Credit Note Details</CardTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Customer</InfoLabel>
            <InfoValue>{arc.customerName}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>BP Ref No</InfoLabel>
            <InfoValue>{arc.bpRefNo || '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Doc Date</InfoLabel>
            <InfoValue>{formatDate(arc.docDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Invoice Date</InfoLabel>
            <InfoValue>{formatDate(arc.invoiceDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Date of Supply</InfoLabel>
            <InfoValue>{formatDate(arc.dateOfSupply)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Tax Date</InfoLabel>
            <InfoValue>{formatDate(arc.taxDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Currency</InfoLabel>
            <InfoValue>{arc.currency}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Exchange Rate</InfoLabel>
            <InfoValue>{arc.exchangeRate}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Credit Reason</InfoLabel>
            <InfoValue style={{ textTransform: 'capitalize' }}>
              {arc.creditReason.replace('_', ' ')}
            </InfoValue>
          </InfoItem>
          {arc.creditReasonText && (
            <InfoItem>
              <InfoLabel>Reason Notes</InfoLabel>
              <InfoValue>{arc.creditReasonText}</InfoValue>
            </InfoItem>
          )}
          {arc.notes && (
            <InfoItem>
              <InfoLabel>Notes</InfoLabel>
              <InfoValue>{arc.notes}</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </Card>

      {/* ── Lines Table ── */}
      <Card>
        <CardTitle>Credit Note Lines</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Item</Th>
              <Th>Description</Th>
              <ThRight>Qty</ThRight>
              <Th>UOM</Th>
              <ThRight>Unit Price</ThRight>
              <ThRight>Disc %</ThRight>
              <ThRight>Net</ThRight>
              <ThRight>Tax</ThRight>
              <ThRight>Gross</ThRight>
            </tr>
          </thead>
          <tbody>
            {arc.lines.map((line: ARCreditNoteLine) => (
              <tr key={line.lineId}>
                <Td style={{ color: theme.colors.textDisabled }}>{line.lineNumber}</Td>
                <Td style={{ fontWeight: 500 }}>{line.itemCode}</Td>
                <Td>{line.description || line.itemName}</Td>
                <TdRight>{line.creditedQty}</TdRight>
                <Td>{line.uom}</Td>
                <TdRight>{formatAmount(line.unitPrice)}</TdRight>
                <TdRight>{line.discountPercent > 0 ? `${line.discountPercent}%` : '—'}</TdRight>
                <TdRight>{formatAmount(line.lineNet)}</TdRight>
                <TdRight>{formatAmount(line.lineTax)}</TdRight>
                <TdRight style={{ fontWeight: 600 }}>{formatAmount(line.lineGross)}</TdRight>
              </tr>
            ))}
          </tbody>
        </Table>

        {/* Totals */}
        <div style={{ marginTop: 16 }}>
          <TotalsRow>
            <TotalsLabel>Net Total</TotalsLabel>
            <TotalsValue>{formatAmount(arc.totals.net)} {arc.currency}</TotalsValue>
          </TotalsRow>
          <TotalsRow>
            <TotalsLabel>VAT / Tax</TotalsLabel>
            <TotalsValue>{formatAmount(arc.totals.tax)} {arc.currency}</TotalsValue>
          </TotalsRow>
          <TotalsGross>
            <TotalsLabel>Gross Total</TotalsLabel>
            <TotalsValue>{formatAmount(arc.totals.gross)} {arc.currency}</TotalsValue>
          </TotalsGross>
        </div>
      </Card>

      {/* ── Allocations Table ── */}
      <Card>
        <CardTitle>Invoice Allocations</CardTitle>
        <p style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 0, marginBottom: 16 }}>
          Click a row to open the credited AR Invoice.
        </p>
        {arc.allocations.length === 0 ? (
          <div style={{ color: theme.colors.textDisabled, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No allocations recorded.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>AR Invoice</Th>
                <ThRight>Amount Applied</ThRight>
              </tr>
            </thead>
            <tbody>
              {arc.allocations.map((alloc: CreditNoteAllocation) => (
                <AllocTr
                  key={alloc.allocationLineNumber}
                  onClick={() => navigate(`/sales/ar-invoices/${alloc.arInvoiceDocEntry}`)}
                  aria-label={`Open AR Invoice ${alloc.arInvoiceDocNumber}`}
                >
                  <Td style={{ color: theme.colors.textDisabled }}>{alloc.allocationLineNumber}</Td>
                  <Td>
                    <span style={{ color: theme.colors.primary[600], fontWeight: 500 }}>
                      {alloc.arInvoiceDocNumber}
                    </span>
                  </Td>
                  <TdRight style={{ fontWeight: 600 }}>
                    {formatAmount(alloc.amountApplied)} {arc.currency}
                  </TdRight>
                </AllocTr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ── Doc-chain Card ── */}
      <Card>
        <CardTitle>Document Chain</CardTitle>

        {/* Base AR Invoice (always present on posted ARC) */}
        {arc.baseDocRef ? (
          <DocChainItem>
            <DocChainType>Source Invoice</DocChainType>
            <DocChainLink
              onClick={() => navigate(docTypeRoute(arc.baseDocRef!))}
              aria-label={`Open ${docTypeLabel(arc.baseDocRef.docType)} ${arc.baseDocRef.docNumber}`}
            >
              {docTypeLabel(arc.baseDocRef.docType)}: {arc.baseDocRef.docNumber}
              <ExternalLink size={14} />
            </DocChainLink>
          </DocChainItem>
        ) : (
          <DocChainItem>
            <DocChainType>Source Invoice</DocChainType>
            <span style={{ color: theme.colors.textDisabled, fontSize: 13 }}>
              Not linked (check allocation rows above)
            </span>
          </DocChainItem>
        )}

        {/* RTN reference (set only for return-driven ARCs) */}
        <DocChainItem>
          <DocChainType>Return Note (RTN)</DocChainType>
          {arc.baseReturnDocRef ? (
            <DocChainLink
              onClick={() => navigate(docTypeRoute(arc.baseReturnDocRef!))}
              aria-label={`Open ${docTypeLabel(arc.baseReturnDocRef.docType)} ${arc.baseReturnDocRef.docNumber}`}
            >
              {docTypeLabel(arc.baseReturnDocRef.docType)}: {arc.baseReturnDocRef.docNumber}
              <ExternalLink size={14} />
            </DocChainLink>
          ) : (
            <span style={{ color: theme.colors.textDisabled, fontSize: 13 }}>
              Direct credit — no physical return
            </span>
          )}
        </DocChainItem>

        {/* Target refs (refunds issued against this ARC — future feature) */}
        {arc.targetDocRefs.length > 0 && (
          arc.targetDocRefs.map((ref, idx) => (
            <DocChainItem key={`${ref.docId}-${idx}`}>
              <DocChainType>Refund {idx + 1}</DocChainType>
              <DocChainLink
                onClick={() => navigate(docTypeRoute(ref))}
                aria-label={`Open ${docTypeLabel(ref.docType)} ${ref.docNumber}`}
              >
                {docTypeLabel(ref.docType)}: {ref.docNumber}
                <ExternalLink size={14} />
              </DocChainLink>
            </DocChainItem>
          ))
        )}
      </Card>

      {/* ── Attachments ── */}
      <AttachmentList
        docType="AR_CREDIT_NOTE"
        docId={arc.docEntry}
        readOnly={isReadOnly || isOpen}
      />

      <SalesAuditHistoryModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        organizationId={orgId}
        docType="AR_CREDIT_NOTE"
        docEntry={arc.docEntry}
        docLabel={arc.docNumber}
      />

      {/* ── Delete Confirmation Modal ── */}
      {/* Closes via X button only — NOT on overlay click (project rule) */}
      {showDeleteModal && (
        <ModalOverlay
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          onClick={e => e.stopPropagation()}
        >
          <ModalBox onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle id="delete-modal-title">Delete AR Credit Note</ModalTitle>
              <ModalCloseButton
                onClick={() => setShowDeleteModal(false)}
                aria-label="Close delete dialog"
              >
                ×
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody>
              Are you sure you want to permanently delete{' '}
              <strong>{arc.docNumber}</strong>? This action cannot be undone.
            </ModalBody>
            <ModalActions>
              <SecondaryButton onClick={() => setShowDeleteModal(false)}>
                Cancel
              </SecondaryButton>
              <DangerButton
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </DangerButton>
            </ModalActions>
          </ModalBox>
        </ModalOverlay>
      )}
    </Container>
  );
}

export default ArCreditNoteDetailPage;
