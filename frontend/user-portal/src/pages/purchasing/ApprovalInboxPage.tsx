/**
 * ApprovalInboxPage
 *
 * Shows pending approvals for the current user's role and a history tab.
 * Approve/Reject actions inline. Click row to navigate to detail.
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
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

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 24px;
`;

const Tabs = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  margin-bottom: 24px;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 10px 24px;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? '700' : '400')};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[600] : theme.colors.textSecondary};
  border-bottom: 2px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : 'transparent'};
  margin-bottom: -2px;
  cursor: pointer;
  transition: all 120ms ease;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Th = styled.th`
  padding: 14px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
`;

const Tr = styled.tr`
  &:hover { background: ${({ theme }) => theme.colors.neutral[50]}; }
  &:last-child td { border-bottom: none; }
`;

const DocTypeBadge = styled.span<{ $type: string }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  background: ${({ $type, theme }) => {
    if ($type === 'PR') return theme.colors.primary[100];
    if ($type === 'PO') return theme.colors.emerald[100];
    if ($type === 'AP') return theme.colors.warningBg;  // gold for AP invoices
    return theme.colors.neutral[100];
  }};
  color: ${({ $type, theme }) => {
    if ($type === 'PR') return theme.colors.primary[700];
    if ($type === 'PO') return theme.colors.emerald[700];
    if ($type === 'AP') return theme.colors.gold[800];  // gold-dark for AP invoices
    return theme.colors.textSecondary;
  }};
  margin-right: 6px;
`;

const ActionCell = styled.td`
  padding: 10px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  white-space: nowrap;
`;

const SuccessButton = styled.button`
  padding: 6px 14px;
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-right: 8px;
  transition: background 120ms ease;
  &:hover { background: ${({ theme }) => theme.colors.emerald[600]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DangerButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 120ms ease;
  &:hover { background: ${({ theme }) => theme.colors.errorBg}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

// ─── Reject Modal ─────────────────────────────────────────────────────────────

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
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows.xl};
  width: 100%;
  max-width: 480px;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
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
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px;
  border-radius: 6px;
  line-height: 1;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const ModalBody = styled.div`
  padding: 20px 24px;
`;

const ModalFooter = styled.div`
  padding: 12px 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const GhostButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 90px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
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
  const theme = useTheme();

  return (
    <Overlay>
      {/* Reason: modal must NOT close on overlay click — X button only */}
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Reject {item.docType}: {item.docNumber}</ModalTitle>
          <CloseButton onClick={onClose}>✕</CloseButton>
        </ModalHeader>
        <ModalBody>
          <p style={{ fontSize: 14, color: theme.colors.textSecondary, marginTop: 0 }}>
            Please provide a reason for rejection.
          </p>
          <Textarea
            placeholder="Rejection reason (required)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <ErrorText>{error}</ErrorText>}
        </ModalBody>
        <ModalFooter>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
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
  const theme = useTheme();

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
      <Title>Approval Inbox</Title>

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
          {pendingLoading && <EmptyState>Loading pending approvals...</EmptyState>}
          {!pendingLoading && pendingItems.length === 0 && (
            <EmptyState>No pending approvals for your role.</EmptyState>
          )}
          {!pendingLoading && pendingItems.length > 0 && (
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
                      <code style={{ fontSize: 13, fontWeight: 600 }}>{item.docNumber}</code>
                    </Td>
                    <Td>
                      {item.docType === 'PR' ? (item.department ?? '—') : (item.vendorName ?? '—')}
                    </Td>
                    <Td>{formatAmount(item.totalGross, item.currencyCode)}</Td>
                    <Td>{formatDate(item.approvalRequestedAt)}</Td>
                    <Td>{item.urgency ?? '—'}</Td>
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
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {historyLoading && <EmptyState>Loading history...</EmptyState>}
          {!historyLoading && historyItems.length === 0 && (
            <EmptyState>No approval decisions found.</EmptyState>
          )}
          {!historyLoading && historyItems.length > 0 && (
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
                      <code style={{ fontSize: 13, fontWeight: 600 }}>{item.docNumber}</code>
                    </Td>
                    <Td>
                      <span style={{
                        color: item.finalState === 'Approved' ? theme.colors.emerald[600] : theme.colors.terracotta[600],
                        fontWeight: 600,
                      }}>
                        {item.finalState}
                      </span>
                    </Td>
                    <Td>{formatAmount(item.totalGross, item.currencyCode)}</Td>
                    <Td>{formatDate(item.approvalDecidedAt)}</Td>
                    <Td>{item.approvalComment ?? '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
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
