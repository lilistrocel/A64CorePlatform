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
 * Variance > 0 (invoice exceeds PO) — row is coral-tinted, value in coral.
 * Variance < 0 (invoice below PO)   — value in muted emerald.
 *
 * Role gating: procurement_officer, procurement_manager, accountant,
 *   finance_admin, auditor, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 *
 * Route: /purchasing/ap/:docId
 *
 * Night Observatory (T-901 Phase 3): status badge colour is routed through
 * the single canonical purchasingStatusToPhase() map in ./statusPhase.ts.
 * The line-variance row highlight previously used gold[50] (amber) as a
 * generic "has variance" flag — gold is reserved for the Harvesting phase /
 * primary CTA / breadcrumb per spec §3, so it has been swapped for a subtle
 * coral-tinted flag instead (a CSS-only change; the underlying
 * `hasLineVariance` boolean and its computation are untouched).
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { X, HelpCircle } from 'lucide-react';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import {
  useAPInvoice,
  useSubmitAPInvoice,
  useApproveAPInvoice,
  useRejectAPInvoice,
  useDeleteAPInvoice,
} from '../../hooks/queries/useAPInvoices';
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

// A quiet non-interactive status chip (e.g. "Read-only (Approved)") — glass,
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

/** Line row gets a subtle coral-tinted flag when a price variance exists.
 * Previously used gold[50] (amber) — replaced because gold is reserved for
 * the Harvesting phase / primary CTA / breadcrumb (spec §3); coral already
 * carries "needs attention" meaning elsewhere in this file (VarianceValue).
 * CSS-only change — `$hasVariance` is computed exactly as before. */
const LineRow = styled.tr<{ $hasVariance: boolean }>`
  background: ${({ $hasVariance }) => ($hasVariance ? 'rgba(240, 138, 112, 0.05)' : 'transparent')};
  transition: background 100ms ease;
  &:last-child td { border-bottom: none; }
`;

// Night Observatory (T-901 Phase 3): was a per-status switch statement over
// neutral/warningBg/emerald/terracotta tokens. Now routes the AP Invoice's
// own status field through the single canonical purchasingStatusToPhase()
// map + the shared phaseBadge mixin, matching PR/PO/GR.
const StatusBadge = styled.span<{ $status: string }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
`;

/** Inline variance value, coloured by sign — bright.coral (unfavourable),
 * bright.emerald (favourable), muted (zero). */
const VarianceValue = styled.span<{ $sign: 'positive' | 'negative' | 'zero' }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  font-weight: ${({ $sign }) => ($sign === 'zero' ? '400' : '600')};
  font-size: 13px;
  color: ${({ $sign, theme }) => {
    if ($sign === 'positive') return theme.colors.bright.coral;
    if ($sign === 'negative') return theme.colors.bright.emerald;
    return theme.colors.muted;
  }};
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.bright.coral};
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
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const TotalsRow = styled.div`
  display: flex;
  gap: 24px;
  align-items: baseline;
  font-size: 14px;
`;

const TotalsLabel = styled.span`
  color: ${({ theme }) => theme.colors.celeste};
  min-width: 140px;
  text-align: right;
`;

const TotalsValue = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  min-width: 120px;
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** JE link banner — appears when the AP Invoice is Approved. Emerald-tinted
 * glass, never gold (spec §5.2 "approved/posted -> fruiting"). */
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

/** Variance tooltip trigger — glass "?" badge with title hover. Swapped the
 * bare "?" glyph for a lucide HelpCircle icon (not an emoji replacement —
 * this glyph never matched the spec §6 emoji table — but a low-risk visual
 * polish consistent with the rest of the icon system; the title attribute
 * (the actual tooltip) is unchanged.) */
const VarianceTooltip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
  cursor: help;
  margin-left: 6px;
  vertical-align: middle;
`;

/** Modal plumbing — glassPanel at blur 24px over a rgba(10,14,36,.6) scrim,
 * 20px radius (spec §4 "Modals/drawers"). Retinted from the previous
 * rgba(0,0,0,.5)-style scrim. */
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
  max-width: 480px;
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

// Inputs/selects/textareas — glassControl, 11px radius, cream-hi text, muted
// placeholder, gold-hi focus ring (spec §4 "Inputs/selects/textareas").
const ModalTextarea = styled.textarea`
  ${glassControl}
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
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
  const theme = useTheme();

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

  // T-811: gating now compares against the stored backend vocabulary — AP's
  // 'Approved' collapsed into the shared 'open' value. 'Rejected' was never
  // touched by the migration. See statusPhase.ts.
  const isDraft = ap?.status === 'draft';
  const isPending = ap?.status === 'pending_approval';
  const isApproved = ap?.status === 'open';
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

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/purchasing/ap')}>&larr; Back to AP Invoices</BackLink>
        <StateWrap>
          <StateHeadline>Loading invoice…</StateHeadline>
          <StateBody>Fetching the latest details.</StateBody>
        </StateWrap>
      </Container>
    );
  }

  if (isError || !ap) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/purchasing/ap')}>&larr; Back to AP Invoices</BackLink>
        <StateWrap>
          <StateHeadline>AP Invoice not found</StateHeadline>
          <StateBody>It may have been deleted, or the link is out of date.</StateBody>
          <PrimaryButton onClick={() => navigate('/purchasing/ap')}>Back to AP Invoices</PrimaryButton>
        </StateWrap>
      </Container>
    );
  }

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

      <PageHeader
        breadcrumb={`— PURCHASING · ${ap.docNumber}`}
        title="AP Invoice"
        emphasizeLastWord
        description={`${ap.vendorName ?? ap.vendorCode ?? 'No vendor'} · Vendor Invoice: ${ap.invoiceNumber}`}
        stats={[
          { value: formatAmount(ap.totalGross, currency), label: `Total Gross · ${ap.lines.length} Lines` },
        ]}
      />

      {(ap.grDocNumber || (ap.poDocId && ap.poDocNumber)) && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20, fontSize: 14 }}>
          {ap.grDocNumber && (
            <span>
              <InfoLabel style={{ display: 'inline', marginBottom: 0, marginRight: 6 }}>Source GR</InfoLabel>
              <InfoLink onClick={() => navigate(`/purchasing/gr/${ap.grDocId}`)}>{ap.grDocNumber}</InfoLink>
            </span>
          )}
          {ap.poDocId && ap.poDocNumber && (
            <span>
              <InfoLabel style={{ display: 'inline', marginBottom: 0, marginRight: 6 }}>Source PO</InfoLabel>
              <InfoLink onClick={() => navigate(`/purchasing/po/${ap.poDocId}`)}>{ap.poDocNumber}</InfoLink>
            </span>
          )}
        </div>
      )}

      <HeaderActionsRow>
        <ActionBar>
          {isDraft && (
            <>
              <SecondaryButton onClick={() => navigate(`/purchasing/ap/${docId}/edit`)}>
                Edit
              </SecondaryButton>
              <PrimaryButton
                onClick={() => setConfirmSubmit(true)}
                disabled={submitMutation.isPending}
              >
                Submit
              </PrimaryButton>
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
              <PrimaryButton
                onClick={() => setConfirmApprove(true)}
                disabled={approveMutation.isPending}
              >
                Approve
              </PrimaryButton>
              <DangerButton
                onClick={() => setShowRejectModal(true)}
                disabled={rejectMutation.isPending}
              >
                Reject
              </DangerButton>
            </>
          )}

          {(isApproved || isRejected) && <ReadOnlyTag>Read-only ({statusDisplayLabel(ap.status, 'AP')})</ReadOnlyTag>}
        </ActionBar>
      </HeaderActionsRow>

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
              <StatusBadge $status={ap.status}>{statusDisplayLabel(ap.status, 'AP')}</StatusBadge>
            </InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Vendor</InfoLabel>
            <InfoValue>{ap.vendorName ?? ap.vendorCode ?? '—'}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Source GR</InfoLabel>
            <InfoValue>
              <InfoLink onClick={() => navigate(`/purchasing/gr/${ap.grDocId}`)}>
                {ap.grDocNumber ?? ap.grDocId}
              </InfoLink>
            </InfoValue>
          </InfoItem>
          {ap.poDocId && (
            <InfoItem>
              <InfoLabel>Source PO</InfoLabel>
              <InfoValue>
                <InfoLink onClick={() => navigate(`/purchasing/po/${ap.poDocId}`)}>
                  {ap.poDocNumber ?? ap.poDocId}
                </InfoLink>
              </InfoValue>
            </InfoItem>
          )}
          <InfoItem>
            <InfoLabel>Vendor Invoice #</InfoLabel>
            <InfoValueMono>{ap.invoiceNumber}</InfoValueMono>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Invoice Date</InfoLabel>
            <InfoValueMono>{formatDate(ap.invoiceDate)}</InfoValueMono>
          </InfoItem>
          <InfoItem>
            <InfoLabel>Due Date</InfoLabel>
            <InfoValueMono>{formatDate(ap.dueDate)}</InfoValueMono>
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
            <InfoValueMono><strong>{formatAmount(ap.totalGross, currency)}</strong></InfoValueMono>
          </InfoItem>
          <InfoItem>
            <InfoLabel>
              Total Variance
              <VarianceTooltip
                title="Total difference between PO prices and vendor invoice prices. Posted to Purchase Price Variance account at approval."
              >
                <HelpCircle size={13} strokeWidth={1.6} />
              </VarianceTooltip>
            </InfoLabel>
            <InfoValue>
              <VarianceValue $sign={totalVarianceSign}>
                <strong>{totalVarianceLabel}</strong>
              </VarianceValue>
              {totalVarianceSign !== 'zero' && (
                <div style={{ fontSize: 11, color: theme.colors.muted, marginTop: 2 }}>
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
                  <InfoValue style={{ color: theme.colors.bright.coral }}>{ap.rejectionComment}</InfoValue>
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
                      <TdMono>{line.lineNumber}</TdMono>
                      <Td>
                        <div style={{ fontWeight: 600, fontFamily: theme.typography.fontFamily.mono }}>{line.itemCode}</div>
                        <div style={{ fontSize: 12, color: theme.colors.textSecondary }}>{line.itemName}</div>
                      </Td>
                      <TdMono>{line.quantity}</TdMono>
                      <Td>{line.uom}</Td>
                      <TdMono style={{ color: theme.colors.muted }}>{formatAmount(line.poUnitPrice, currency)}</TdMono>
                      <TdMono><strong>{formatAmount(line.invoiceUnitPrice, currency)}</strong></TdMono>
                      <Td>
                        <VarianceValue $sign={lineVarianceSign}>
                          {lineVarianceLabel}
                        </VarianceValue>
                      </Td>
                      <Td>{line.taxCode}</Td>
                      <TdMono>{formatAmount(line.lineNet, currency)}</TdMono>
                      <TdMono><strong>{formatAmount(line.lineGross, currency)}</strong></TdMono>
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
                      <HelpCircle size={13} strokeWidth={1.6} />
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
          readOnly={ap.status !== 'draft'}
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
                <X size={16} strokeWidth={1.8} />
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
              <PrimaryButton
                disabled={submitMutation.isPending}
                onClick={handleSubmit}
              >
                {submitMutation.isPending ? 'Submitting...' : 'Confirm Submit'}
              </PrimaryButton>
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
                <X size={16} strokeWidth={1.8} />
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
              <PrimaryButton
                disabled={approveMutation.isPending}
                onClick={handleApprove}
              >
                {approveMutation.isPending ? 'Approving...' : 'Confirm Approve'}
              </PrimaryButton>
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
                <X size={16} strokeWidth={1.8} />
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
                <X size={16} strokeWidth={1.8} />
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
