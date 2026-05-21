/**
 * APInvoiceDetailPage
 *
 * Shows AP Invoice header + lines + totals + variance summary.
 * Actions are role-gated by status:
 *   Draft            — Edit, Submit, Delete
 *   Pending Approval — Approve (approval role), Reject (approval role)
 *   Approved/Rejected — read-only
 *
 * On Approved, shows a green banner linking to the finance JE list.
 * Variance > 0 (invoice exceeds PO) — row is amber-highlighted, value in red.
 * Variance < 0 (invoice below PO)   — value in muted green.
 *
 * Role gating: procurement_officer, procurement_manager, accountant,
 *   finance_admin, auditor, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 *
 * Route: /purchasing/ap/:docId
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  useAPInvoice,
  useSubmitAPInvoice,
  useApproveAPInvoice,
  useRejectAPInvoice,
  useDeleteAPInvoice,
} from '../../hooks/queries/useAPInvoices';
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
  background: ${({ theme }) => theme.colors.status.success || '#0F6E56'};
  &:hover { background: #0B5644; }
`;

const DangerButton = styled(PrimaryButton)`
  background: ${({ theme }) => theme.colors.status.danger || '#9E2A2A'};
  &:hover { background: #9E2A2A; }
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

/** Line row is amber-tinted when variance exists */
const LineRow = styled.tr<{ $hasVariance: boolean }>`
  background: ${({ $hasVariance }) => ($hasVariance ? 'rgba(184,132,42,0.06)' : 'transparent')};
  transition: background 100ms ease;
  &:last-child td { border-bottom: none; }
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status }) => {
    switch ($status) {
      case 'Draft':            return '#DCD8CF';
      case 'Pending Approval': return 'rgba(184,132,42,0.10)';
      case 'Approved':         return 'rgba(15,110,86,0.10)';
      case 'Rejected':         return 'rgba(158,42,42,0.08)';
      default:                 return '#DCD8CF';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'Draft':            return '#4B4844';
      case 'Pending Approval': return '#B8842A';
      case 'Approved':         return '#0B5644';
      case 'Rejected':         return '#9E2A2A';
      default:                 return '#4B4844';
    }
  }};
`;

/** Inline variance value, coloured by sign */
const VarianceValue = styled.span<{ $sign: 'positive' | 'negative' | 'zero' }>`
  font-weight: ${({ $sign }) => ($sign === 'zero' ? '400' : '600')};
  font-size: 13px;
  color: ${({ $sign }) => {
    if ($sign === 'positive') return '#9E2A2A';
    if ($sign === 'negative') return '#0B5644';
    return '#4B4844';
  }};
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.status.danger || '#9E2A2A'};
  font-size: 13px;
  margin: 8px 0 0;
`;

/** Totals block — right-aligned summary */
const TotalsBlock = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const TotalsRow = styled.div`
  display: flex;
  gap: 24px;
  align-items: baseline;
  font-size: 14px;
`;

const TotalsLabel = styled.span`
  color: ${({ theme }) => theme.colors.text.secondary};
  min-width: 140px;
  text-align: right;
`;

const TotalsValue = styled.span`
  font-weight: 500;
  min-width: 120px;
  text-align: right;
  color: ${({ theme }) => theme.colors.text.primary};
`;

/** JE link banner — appears when the AP Invoice is Approved */
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
  color: #0B5644;
  font-weight: 500;
`;

const JELinkButton = styled.a`
  font-size: 13px;
  color: #0B5644;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid #6ee7b7;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  &:hover { background: rgba(15,110,86,0.10); }
`;

/** Variance tooltip trigger — "?" badge with title hover */
const VarianceTooltip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.border.subtle};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 10px;
  font-weight: 700;
  cursor: help;
  margin-left: 6px;
  vertical-align: middle;
`;

/** Modal plumbing — mirrors GoodsReceiptDetailPage */
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
  max-width: 480px;
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

const ModalTextarea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
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

function getVarianceSign(amount: number): 'positive' | 'negative' | 'zero' {
  if (amount > 0) return 'positive';
  if (amount < 0) return 'negative';
  return 'zero';
}

function formatVarianceLabel(amount: number, currency: string): string {
  if (amount === 0) return '—';
  const abs = new Intl.NumberFormat('en-AE', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount > 0 ? `+${abs}` : `(${abs})`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function APInvoiceDetailPage() {
  const { docId } = useParams<{ docId: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const orgId = user?.organizationId ?? '';
  const userRole = (user as { role?: string })?.role ?? '';
  const canApprove = ['accountant', 'finance_admin', 'admin', 'super_admin'].includes(userRole);

  const { data: ap, isLoading, isError } = useAPInvoice(docId, orgId);
  const submitMutation = useSubmitAPInvoice();
  const approveMutation = useApproveAPInvoice();
  const rejectMutation = useRejectAPInvoice();
  const deleteMutation = useDeleteAPInvoice();

  // Modal state
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const isDraft = ap?.status === 'Draft';
  const isPending = ap?.status === 'Pending Approval';
  const isApproved = ap?.status === 'Approved';
  const isRejected = ap?.status === 'Rejected';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setActionError(null);
    try {
      await submitMutation.mutateAsync({ docId: docId!, organizationId: orgId });
      setConfirmSubmit(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setActionError(axiosErr?.response?.data?.detail ?? axiosErr?.message ?? 'Failed to submit.');
    }
  };

  const handleApprove = async () => {
    setActionError(null);
    try {
      await approveMutation.mutateAsync({ docId: docId!, organizationId: orgId });
      setConfirmApprove(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setActionError(axiosErr?.response?.data?.detail ?? axiosErr?.message ?? 'Failed to approve.');
    }
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) return;
    setActionError(null);
    try {
      await rejectMutation.mutateAsync({
        docId: docId!,
        body: { comment: rejectComment.trim() },
        organizationId: orgId,
      });
      setShowRejectModal(false);
      setRejectComment('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setActionError(axiosErr?.response?.data?.detail ?? axiosErr?.message ?? 'Failed to reject.');
    }
  };

  const handleDelete = async () => {
    setActionError(null);
    try {
      await deleteMutation.mutateAsync({ docId: docId!, organizationId: orgId });
      navigate('/purchasing/ap');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setActionError(axiosErr?.response?.data?.detail ?? axiosErr?.message ?? 'Failed to delete.');
    }
  };

  if (isLoading) return <Container><p>Loading...</p></Container>;
  if (isError || !ap) return <Container><p>AP Invoice not found.</p></Container>;

  const currency = ap.currencyCode;
  const totalVarianceSign = getVarianceSign(ap.totalPriceVariance);
  const totalVarianceLabel = formatVarianceLabel(ap.totalPriceVariance, currency);

  return (
    <Container>
      <BackLink onClick={() => navigate('/purchasing/ap')}>
        &larr; Back to AP Invoices
      </BackLink>

      {/* Approved banner — links to JE list */}
      {isApproved && (
        <JELinkBanner>
          <JELinkText>
            AP Invoice posted. A journal entry has been created on the finance side.
          </JELinkText>
          <JELinkButton
            href={`/finance/journal-entries?search=${encodeURIComponent(ap.docNumber)}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/finance/journal-entries?search=${encodeURIComponent(ap.docNumber)}`);
            }}
          >
            View Journal Entry &rarr;
          </JELinkButton>
        </JELinkBanner>
      )}

      <TitleRow>
        <div>
          <Title>{ap.docNumber}</Title>
          <div style={{ fontSize: 14, color: '#4B4844', marginTop: 4 }}>
            {ap.vendorName ?? ap.vendorCode ?? 'No vendor'} &bull;{' '}
            Vendor Invoice: <strong>{ap.invoiceNumber}</strong>
            {ap.grDocNumber && (
              <>
                {' '}&bull;{' '}
                <span
                  style={{ color: '#0B5644', cursor: 'pointer' }}
                  onClick={() => navigate(`/purchasing/gr/${ap.grDocId}`)}
                >
                  GR: {ap.grDocNumber}
                </span>
              </>
            )}
            {ap.poDocId && ap.poDocNumber && (
              <>
                {' '}&bull;{' '}
                <span
                  style={{ color: '#0B5644', cursor: 'pointer' }}
                  onClick={() => navigate(`/purchasing/po/${ap.poDocId}`)}
                >
                  PO: {ap.poDocNumber}
                </span>
              </>
            )}
          </div>
        </div>

        <ActionBar>
          {isDraft && (
            <>
              <GhostButton onClick={() => navigate(`/purchasing/ap/${docId}/edit`)}>
                Edit
              </GhostButton>
              <SuccessButton
                onClick={() => setConfirmSubmit(true)}
                disabled={submitMutation.isPending}
              >
                Submit
              </SuccessButton>
              <DangerButton
                onClick={() => setConfirmDelete(true)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </DangerButton>
            </>
          )}

          {isPending && canApprove && (
            <>
              <SuccessButton
                onClick={() => setConfirmApprove(true)}
                disabled={approveMutation.isPending}
              >
                Approve
              </SuccessButton>
              <DangerButton
                onClick={() => setShowRejectModal(true)}
                disabled={rejectMutation.isPending}
              >
                Reject
              </DangerButton>
            </>
          )}

          {(isApproved || isRejected) && (
            <span style={{
              fontSize: 13, color: '#4B4844',
              padding: '8px 12px',
              background: '#DCD8CF',
              borderRadius: 8,
            }}>
              Read-only ({ap.status})
            </span>
          )}
        </ActionBar>
      </TitleRow>

      {actionError && (
        <ErrorText style={{ marginBottom: 16 }}>{actionError}</ErrorText>
      )}

      {/* Header Info */}
      <Card>
        <CardTitle>Header Details</CardTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Status</InfoLabel>
            <InfoValue>
              <StatusBadge $status={ap.status}>{ap.status}</StatusBadge>
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Vendor</InfoLabel>
            <InfoValue>{ap.vendorName ?? ap.vendorCode ?? '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Source GR</InfoLabel>
            <InfoValue>
              <span
                style={{ color: '#0B5644', cursor: 'pointer' }}
                onClick={() => navigate(`/purchasing/gr/${ap.grDocId}`)}
              >
                {ap.grDocNumber ?? ap.grDocId}
              </span>
            </InfoValue>
          </InfoItem>
          {ap.poDocId && (
            <InfoItem>
              <InfoLabel>Source PO</InfoLabel>
              <InfoValue>
                <span
                  style={{ color: '#0B5644', cursor: 'pointer' }}
                  onClick={() => navigate(`/purchasing/po/${ap.poDocId}`)}
                >
                  {ap.poDocNumber ?? ap.poDocId}
                </span>
              </InfoValue>
            </InfoItem>
          )}
          <InfoItem>
            <InfoLabel>Vendor Invoice #</InfoLabel>
            <InfoValue>{ap.invoiceNumber}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Invoice Date</InfoLabel>
            <InfoValue>{formatDate(ap.invoiceDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Due Date</InfoLabel>
            <InfoValue>{formatDate(ap.dueDate)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Payment Terms</InfoLabel>
            <InfoValue>{ap.paymentTermsCode ?? '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Currency</InfoLabel>
            <InfoValue>{currency}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Total Gross</InfoLabel>
            <InfoValue><strong>{formatAmount(ap.totalGross, currency)}</strong></InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>
              Total Variance
              <VarianceTooltip
                title="Total difference between PO prices and vendor invoice prices. Posted to Purchase Price Variance account at approval."
              >
                ?
              </VarianceTooltip>
            </InfoLabel>
            <InfoValue>
              <VarianceValue $sign={totalVarianceSign}>
                <strong>{totalVarianceLabel}</strong>
              </VarianceValue>
              {totalVarianceSign !== 'zero' && (
                <div style={{ fontSize: 11, color: '#4B4844', marginTop: 2 }}>
                  {totalVarianceSign === 'positive'
                    ? 'Vendor invoiced more than agreed.'
                    : 'Vendor invoiced less than agreed.'}
                  {' '}Difference posts to Purchase Price Variance at approval.
                </div>
              )}
            </InfoValue>
          </InfoItem>
          {ap.approvedBy && (
            <InfoItem>
              <InfoLabel>Approved By / At</InfoLabel>
              <InfoValue>
                {ap.approvedBy}{ap.approvedAt ? ` · ${formatDateTime(ap.approvedAt)}` : ''}
              </InfoValue>
            </InfoItem>
          )}
          {ap.rejectedBy && (
            <>
              <InfoItem>
                <InfoLabel>Rejected By / At</InfoLabel>
                <InfoValue>
                  {ap.rejectedBy}{ap.rejectedAt ? ` · ${formatDateTime(ap.rejectedAt)}` : ''}
                </InfoValue>
              </InfoItem>
              {ap.rejectionComment && (
                <InfoItem style={{ gridColumn: '1/-1' }}>
                  <InfoLabel>Rejection Reason</InfoLabel>
                  <InfoValue style={{ color: '#9E2A2A' }}>{ap.rejectionComment}</InfoValue>
                </InfoItem>
              )}
            </>
          )}
          {ap.notes && (
            <InfoItem style={{ gridColumn: '1/-1' }}>
              <InfoLabel>Notes</InfoLabel>
              <InfoValue>{ap.notes}</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </Card>

      {/* Lines */}
      <Card>
        <CardTitle>Lines ({ap.lines.length})</CardTitle>
        {ap.lines.length > 0 && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Item</Th>
                  <Th>Qty</Th>
                  <Th>UoM</Th>
                  <Th>PO Unit Price</Th>
                  <Th>Invoice Unit Price</Th>
                  <Th>Variance</Th>
                  <Th>Tax Code</Th>
                  <Th>Line Net</Th>
                  <Th>Line Gross</Th>
                </tr>
              </thead>
              <tbody>
                {ap.lines.map((line) => {
                  const lineVarianceSign = getVarianceSign(line.priceVarianceAmount);
                  const lineVarianceLabel = formatVarianceLabel(
                    line.priceVarianceAmount * line.quantity,
                    currency
                  );
                  const hasLineVariance = line.priceVarianceAmount !== 0;
                  return (
                    <LineRow key={line.apLineId} $hasVariance={hasLineVariance}>
                      <Td>{line.lineNumber}</Td>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{line.itemCode}</div>
                        <div style={{ fontSize: 12, color: '#4B4844' }}>{line.itemName}</div>
                      </Td>
                      <Td>{line.quantity}</Td>
                      <Td>{line.uom}</Td>
                      <Td style={{ color: '#4B4844' }}>{formatAmount(line.poUnitPrice, currency)}</Td>
                      <Td><strong>{formatAmount(line.invoiceUnitPrice, currency)}</strong></Td>
                      <Td>
                        <VarianceValue $sign={lineVarianceSign}>
                          {lineVarianceLabel}
                        </VarianceValue>
                      </Td>
                      <Td>{line.taxCode}</Td>
                      <Td>{formatAmount(line.lineNet, currency)}</Td>
                      <Td><strong>{formatAmount(line.lineGross, currency)}</strong></Td>
                    </LineRow>
                  );
                })}
              </tbody>
            </Table>

            {/* Totals */}
            <TotalsBlock>
              <TotalsRow>
                <TotalsLabel>Subtotal Net</TotalsLabel>
                <TotalsValue>{formatAmount(ap.subtotalNet, currency)}</TotalsValue>
              </TotalsRow>
              <TotalsRow>
                <TotalsLabel>Total Tax</TotalsLabel>
                <TotalsValue>{formatAmount(ap.totalTax, currency)}</TotalsValue>
              </TotalsRow>
              <TotalsRow>
                <TotalsLabel>Total Gross</TotalsLabel>
                <TotalsValue style={{ fontWeight: 700, fontSize: 16 }}>
                  {formatAmount(ap.totalGross, currency)}
                </TotalsValue>
              </TotalsRow>
              {totalVarianceSign !== 'zero' && (
                <TotalsRow>
                  <TotalsLabel>
                    Total Variance
                    <VarianceTooltip
                      title="Total difference between PO prices and vendor invoice prices. Posted to Purchase Price Variance account at approval."
                    >
                      ?
                    </VarianceTooltip>
                  </TotalsLabel>
                  <TotalsValue>
                    <VarianceValue $sign={totalVarianceSign}>
                      <strong>{totalVarianceLabel}</strong>
                    </VarianceValue>
                  </TotalsValue>
                </TotalsRow>
              )}
            </TotalsBlock>
          </>
        )}
      </Card>

      {/* Attachments — readOnly when status is not Draft */}
      <Card>
        <AttachmentList
          docType="AP"
          docId={docId!}
          organizationId={orgId}
          readOnly={ap.status !== 'Draft'}
        />
      </Card>

      {/* ── Confirm Submit Modal ───────────────────────────────────────────────── */}
      {confirmSubmit && (
        <Overlay>
          {/* Modal does NOT close on overlay click — X button only */}
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Submit for Approval</ModalTitle>
              <CloseButton
                onClick={() => { setConfirmSubmit(false); setActionError(null); }}
                aria-label="Close"
              >
                ✕
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p style={{ margin: '0 0 8px' }}>
                Submit <strong>{ap.docNumber}</strong> for approval?
              </p>
              <p style={{ margin: 0 }}>
                The invoice will move to Pending Approval and the approver will be notified.
              </p>
              {actionError && <ErrorText>{actionError}</ErrorText>}
            </ModalBody>
            <ModalFooter>
              <GhostButton onClick={() => { setConfirmSubmit(false); setActionError(null); }}>
                Cancel
              </GhostButton>
              <SuccessButton
                disabled={submitMutation.isPending}
                onClick={handleSubmit}
              >
                {submitMutation.isPending ? 'Submitting...' : 'Confirm Submit'}
              </SuccessButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}

      {/* ── Confirm Approve Modal ──────────────────────────────────────────────── */}
      {confirmApprove && (
        <Overlay>
          {/* Modal does NOT close on overlay click — X button only */}
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Approve AP Invoice</ModalTitle>
              <CloseButton
                onClick={() => { setConfirmApprove(false); setActionError(null); }}
                aria-label="Close"
              >
                ✕
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p style={{ margin: '0 0 8px' }}>
                Approve <strong>{ap.docNumber}</strong>?
              </p>
              <p style={{ margin: 0 }}>
                This will post the AP Invoice and trigger a journal entry on the finance side
                (DR GR/IR Clearing / CR AP-Vendor
                {ap.totalPriceVariance !== 0 ? ' / DR/CR Purchase Price Variance' : ''}).
                This action cannot be undone.
              </p>
              {actionError && <ErrorText>{actionError}</ErrorText>}
            </ModalBody>
            <ModalFooter>
              <GhostButton onClick={() => { setConfirmApprove(false); setActionError(null); }}>
                Cancel
              </GhostButton>
              <SuccessButton
                disabled={approveMutation.isPending}
                onClick={handleApprove}
              >
                {approveMutation.isPending ? 'Approving...' : 'Confirm Approve'}
              </SuccessButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}

      {/* ── Reject Modal ──────────────────────────────────────────────────────── */}
      {showRejectModal && (
        <Overlay>
          {/* Modal does NOT close on overlay click — X button only */}
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Reject AP Invoice</ModalTitle>
              <CloseButton
                onClick={() => { setShowRejectModal(false); setActionError(null); setRejectComment(''); }}
                aria-label="Close"
              >
                ✕
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p style={{ margin: '0 0 12px' }}>
                Please provide a reason for rejecting <strong>{ap.docNumber}</strong>.
              </p>
              <ModalTextarea
                placeholder="Rejection reason (required)..."
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
              />
              {actionError && <ErrorText>{actionError}</ErrorText>}
            </ModalBody>
            <ModalFooter>
              <GhostButton onClick={() => { setShowRejectModal(false); setActionError(null); setRejectComment(''); }}>
                Cancel
              </GhostButton>
              <DangerButton
                disabled={!rejectComment.trim() || rejectMutation.isPending}
                onClick={handleReject}
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Reject'}
              </DangerButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}

      {/* ── Confirm Delete Modal ──────────────────────────────────────────────── */}
      {confirmDelete && (
        <Overlay>
          {/* Modal does NOT close on overlay click — X button only */}
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Delete AP Invoice</ModalTitle>
              <CloseButton
                onClick={() => { setConfirmDelete(false); setActionError(null); }}
                aria-label="Close"
              >
                ✕
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              Are you sure you want to permanently delete{' '}
              <strong>{ap.docNumber}</strong>? This cannot be undone.
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
