/**
 * ApprovalInboxPage
 *
 * Shows pending approvals for the current user's role and a history tab.
 * Approve/Reject actions inline. Click row to navigate to detail.
 *
 * Modals do NOT close on overlay click — X button only.
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md):
 * visual reskin only — glass table/controls/modal, phase badges via
 * ./statusPhase for genuine PR/PO/AP lifecycle states (the pending-tab
 * "Urgency" column is NOT a lifecycle status — see the note above UrgencyText
 * — so it keeps plain token-sourced chrome instead of a phase badge).
 * Space Mono metadata, shared PageHeader/Button. Logic, routes, data-fetching
 * and props are unchanged.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { X } from 'lucide-react';
import { PageHeader, Button, glassPanel, monoLabel, phaseBadge } from '@a64core/shared';
import {
  usePendingApprovals,
  useApprovalHistory,
  useApprovePurchaseRequest,
  useRejectPurchaseRequest,
  useApprovePurchaseOrder,
  useRejectPurchaseOrder,
} from '../../hooks/queries/usePurchasing';
import {
  useApproveAPInvoice,
  useRejectAPInvoice,
} from '../../hooks/queries/useAPInvoices';
import { useAuthStore } from '../../stores/auth.store';
import type { PendingApprovalItem } from '../../services/purchasingApi';
import { purchasingStatusToPhase } from './statusPhase';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Tabs = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  margin-bottom: 24px;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 10px 24px;
  border: none;
  background: none;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: ${({ $active }) => ($active ? '700' : '500')};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.celeste : theme.colors.muted};
  border-bottom: 2px solid ${({ $active, theme }) =>
    $active ? theme.colors.celeste : 'transparent'};
  margin-bottom: -1px;
  cursor: pointer;
  transition: all 120ms ease;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const TableWrap = styled.div`
  ${glassPanel}
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 14px 16px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Tr = styled.tr`
  transition: background 100ms ease;
  &:hover td { background: rgba(180, 200, 220, 0.05); }
  &:last-child td { border-bottom: none; }
`;

/** Space Mono for document IDs, quantities, currency amounts, timestamps —
 * spec §2/instruction 6. */
const Mono = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const DocCode = styled(Mono)`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** Document-type tag (PR/PO/AP). This is a categorical label, not a
 * lifecycle status, so it deliberately does NOT route through the phase map
 * — it uses the chart/categorical "bright.*" palette instead (spec §4
 * Charts). The previous version tinted AP gold ("gold for AP invoices");
 * that violated the gold-discipline budget (spec §3: gold is not a badge
 * default) on any inbox with several AP items, so AP now uses bright.terra. */
const DocTypeBadge = styled.span<{ $type: string }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-right: 8px;
  color: ${({ $type, theme }) => {
    if ($type === 'PR') return theme.colors.bright.lapis;
    if ($type === 'PO') return theme.colors.bright.emerald;
    if ($type === 'AP') return theme.colors.bright.terra;
    return theme.colors.muted;
  }};
  background: ${({ $type, theme }) => {
    if ($type === 'PR') return 'rgba(107, 138, 224, 0.14)';
    if ($type === 'PO') return 'rgba(84, 211, 155, 0.14)';
    if ($type === 'AP') return 'rgba(232, 147, 95, 0.14)';
    return 'rgba(180, 200, 220, 0.1)';
  }};
`;

const FinalStateBadge = styled.span<{ $status: string }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
`;

/** Urgency is not a document-lifecycle status (the phase map only covers
 * draft/pending/open/.../cancelled — spec §5.2), so it is intentionally
 * plain text rather than a phase badge. Kept token-sourced (muted) only. */
const UrgencyText = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  text-transform: capitalize;
`;

const ActionCell = styled.td`
  padding: 10px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

/** No shared Button variant covers "success" (approve). Kept custom, fixed
 * to pair success (emerald) fill with onDark text — see report for the
 * onAccent -> onDark correction this required. */
const SuccessButton = styled.button`
  padding: 6px 14px;
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  margin-right: 8px;
  transition: all 120ms ease;
  &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(84, 211, 155, 0.3); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/** Destructive — coral-tinted glass, never solid red (spec §4 Buttons). */
const DangerButton = styled.button`
  padding: 6px 14px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 120ms ease;
  &:hover:not(:disabled) { background: rgba(240, 138, 112, 0.24); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const StatusMessage = styled.p`
  text-align: center;
  padding: 48px 32px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 15px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
`;

const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 1.4rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px;
`;

const EmptyText = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9rem;
  margin: 0;
`;

// ─── Reject Modal ─────────────────────────────────────────────────────────────

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
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 4px;
  border-radius: 6px;
  &:hover { background: rgba(180, 200, 220, 0.1); color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ModalBody = styled.div`
  padding: 20px 24px;
`;

const ModalFooter = styled.div`
  padding: 12px 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 11px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 90px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 13px;
  margin: 8px 0 0;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Reject Modal Component ───────────────────────────────────────────────────

interface RejectModalProps {
  item: PendingApprovalItem;
  onClose: () => void;
  onConfirm: (comment: string) => Promise<void>;
}

function RejectModal({ item, onClose, onConfirm }: RejectModalProps) {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Overlay>
      {/* Reason: modal must NOT close on overlay click — X button only */}
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Reject {item.docType}: {item.docNumber}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </CloseButton>
        </ModalHeader>
        <ModalBody>
          <EmptyText style={{ marginBottom: 12 }}>
            Please provide a reason for rejection.
          </EmptyText>
          <Textarea
            placeholder="Rejection reason (required)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <ErrorText>{error}</ErrorText>}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" size="small" onClick={onClose}>Cancel</Button>
          <DangerButton
            disabled={!comment.trim() || loading}
            onClick={async () => {
              setError(null);
              setLoading(true);
              try {
                await onConfirm(comment.trim());
                onClose();
              } catch (err: any) {
                setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to reject');
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Rejecting...' : 'Confirm Reject'}
          </DangerButton>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ApprovalInboxPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const orgId = user?.organizationId ?? '';

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [rejectingItem, setRejectingItem] = useState<PendingApprovalItem | null>(null);
  const [approveLoadingId, setApproveLoadingId] = useState<string | null>(null);

  const { data: pendingItems = [], isLoading: pendingLoading } = usePendingApprovals(orgId);
  const { data: historyData, isLoading: historyLoading } = useApprovalHistory({ organizationId: orgId });
  const historyItems = historyData?.data ?? [];

  const approvePR = useApprovePurchaseRequest();
  const rejectPR = useRejectPurchaseRequest();
  const approvePO = useApprovePurchaseOrder();
  const rejectPO = useRejectPurchaseOrder();
  const approveAP = useApproveAPInvoice();
  const rejectAP = useRejectAPInvoice();

  const handleApprove = async (item: PendingApprovalItem) => {
    setApproveLoadingId(item.docId);
    try {
      if (item.docType === 'PR') {
        await approvePR.mutateAsync({ docId: item.docId, organizationId: orgId });
      } else if (item.docType === 'AP') {
        await approveAP.mutateAsync({ docId: item.docId, organizationId: orgId });
      } else {
        await approvePO.mutateAsync({ docId: item.docId, organizationId: orgId });
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? err?.message ?? 'Failed to approve');
    } finally {
      setApproveLoadingId(null);
    }
  };

  const handleRejectConfirm = async (item: PendingApprovalItem, comment: string) => {
    if (item.docType === 'PR') {
      await rejectPR.mutateAsync({ docId: item.docId, comment, organizationId: orgId });
    } else if (item.docType === 'AP') {
      await rejectAP.mutateAsync({
        docId: item.docId,
        body: { comment },
        organizationId: orgId,
      });
    } else {
      await rejectPO.mutateAsync({ docId: item.docId, comment, organizationId: orgId });
    }
  };

  return (
    <Container>
      <PageHeader
        breadcrumb="— PURCHASING · APPROVALS"
        title="Approval Inbox"
        emphasizeLastWord
        description="Purchase requests, orders and vendor invoices awaiting your decision."
        stats={[
          { value: pendingItems.length, label: 'Pending', alive: pendingItems.length > 0 },
          { value: historyData?.meta?.total ?? historyItems.length, label: 'Decided' },
        ]}
      />

      <Tabs>
        <Tab $active={activeTab === 'pending'} onClick={() => setActiveTab('pending')}>
          Pending {pendingItems.length > 0 ? `(${pendingItems.length})` : ''}
        </Tab>
        <Tab $active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
          History
        </Tab>
      </Tabs>

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <>
          {pendingLoading && <StatusMessage>Loading pending approvals...</StatusMessage>}
          {!pendingLoading && pendingItems.length === 0 && (
            <EmptyState>
              <EmptyHeadline>Nothing waiting on you</EmptyHeadline>
              <EmptyText>There are no pending approvals for your role right now.</EmptyText>
            </EmptyState>
          )}
          {!pendingLoading && pendingItems.length > 0 && (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Document</Th>
                    <Th>Department / Vendor</Th>
                    <Th>Total (AED)</Th>
                    <Th>Submitted</Th>
                    <Th>Urgency</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {pendingItems.map((item) => (
                    <Tr key={item.docId}>
                      <Td
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          if (item.docType === 'PR') navigate(`/purchasing/pr/${item.docId}`);
                          else if (item.docType === 'AP') navigate(`/purchasing/ap/${item.docId}`);
                          else navigate(`/purchasing/po/${item.docId}`);
                        }}
                      >
                        <DocTypeBadge $type={item.docType}>{item.docType}</DocTypeBadge>
                        <DocCode>{item.docNumber}</DocCode>
                      </Td>
                      <Td>
                        {item.docType === 'PR' ? (item.department ?? '—') : (item.vendorName ?? '—')}
                      </Td>
                      <Td><Mono>{formatAmount(item.totalGross, item.currencyCode)}</Mono></Td>
                      <Td><Mono>{formatDate(item.approvalRequestedAt)}</Mono></Td>
                      <Td><UrgencyText>{item.urgency ?? '—'}</UrgencyText></Td>
                      <ActionCell>
                        <SuccessButton
                          disabled={approveLoadingId === item.docId}
                          onClick={() => handleApprove(item)}
                        >
                          {approveLoadingId === item.docId ? '...' : 'Approve'}
                        </SuccessButton>
                        <DangerButton onClick={() => setRejectingItem(item)}>
                          Reject
                        </DangerButton>
                      </ActionCell>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {historyLoading && <StatusMessage>Loading history...</StatusMessage>}
          {!historyLoading && historyItems.length === 0 && (
            <EmptyState>
              <EmptyHeadline>No decisions yet</EmptyHeadline>
              <EmptyText>Approved and rejected documents will appear here.</EmptyText>
            </EmptyState>
          )}
          {!historyLoading && historyItems.length > 0 && (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Document</Th>
                    <Th>Final State</Th>
                    <Th>Total (AED)</Th>
                    <Th>Decided At</Th>
                    <Th>Comment</Th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((item) => (
                    <Tr
                      key={item.docId}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (item.docType === 'PR') navigate(`/purchasing/pr/${item.docId}`);
                        else if (item.docType === 'AP') navigate(`/purchasing/ap/${item.docId}`);
                        else navigate(`/purchasing/po/${item.docId}`);
                      }}
                    >
                      <Td>
                        <DocTypeBadge $type={item.docType}>{item.docType}</DocTypeBadge>
                        <DocCode>{item.docNumber}</DocCode>
                      </Td>
                      <Td>
                        <FinalStateBadge $status={item.finalState}>{item.finalState}</FinalStateBadge>
                      </Td>
                      <Td><Mono>{formatAmount(item.totalGross, item.currencyCode)}</Mono></Td>
                      <Td><Mono>{formatDate(item.approvalDecidedAt)}</Mono></Td>
                      <Td>{item.approvalComment ?? '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </>
      )}

      {/* Reject Modal */}
      {rejectingItem && (
        <RejectModal
          item={rejectingItem}
          onClose={() => setRejectingItem(null)}
          onConfirm={(comment) => handleRejectConfirm(rejectingItem, comment)}
        />
      )}
    </Container>
  );
}
