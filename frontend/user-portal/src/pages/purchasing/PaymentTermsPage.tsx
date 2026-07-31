/**
 * PaymentTermsPage
 *
 * Payment terms master data management page.
 * Admin-only write access. Simple list with create/edit modals.
 *
 * Modals do NOT close on overlay click — X button only.
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md):
 * visual reskin only — glass table/controls/modal, Space Mono metadata,
 * shared PageHeader/Button. Payment terms have no PR/PO/GR/AP lifecycle
 * status — the active/inactive toggle is extrapolated onto the phase map per
 * spec §5.2 as 'fruiting' (active) / 'decommissioned' (inactive), matching
 * VendorsPage / PurchaseItemsPage. Logic, routes, data-fetching and props
 * are unchanged.
 */

import { useState, useCallback } from 'react';
import styled from 'styled-components';
import { X } from 'lucide-react';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import {
  usePaymentTerms,
  useCreatePaymentTerms,
  useUpdatePaymentTerms,
  useDeletePaymentTerms,
} from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { PaymentTerms, PaymentTermsCreate, PaymentTermsUpdate } from '../../services/purchasingApi';

// ─── Styled components ──────────────────────────────────────────────────────

const Container = styled.div`padding: 32px; max-width: 900px; margin: 0 auto;`;
const HeaderRow = styled.div`display: flex; justify-content: flex-end; margin-bottom: 8px;`;
const AdminNote = styled.p`font-size: 13px; color: ${({ theme }) => theme.colors.muted}; margin: 0 0 24px;`;
const DangerButton = styled.button`
  padding: 6px 14px; background: ${({ theme }) => theme.colors.errorBg}; color: ${({ theme }) => theme.colors.error};
  border: 1px solid rgba(240, 138, 112, 0.4); border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 150ms ease;
  &:hover { background: rgba(240, 138, 112, 0.24); }
`;
const TableWrap = styled.div`
  ${glassPanel}
  overflow: hidden;
`;
const Table = styled.table`width: 100%; border-collapse: collapse;`;
const Th = styled.th`
  ${monoLabel}
  padding: 14px 16px; text-align: left; color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;
const Td = styled.td`padding: 14px 16px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary}; border-bottom: 1px solid ${({ theme }) => theme.colors.line};`;
const Tr = styled.tr`cursor: pointer; transition: background 100ms ease; &:hover td { background: rgba(180, 200, 220, 0.05); } &:last-child td { border-bottom: none; }`;
const Mono = styled.span`font-family: ${({ theme }) => theme.typography.fontFamily.mono};`;
const CodeCell = styled(Mono)`font-weight: 700; color: ${({ theme }) => theme.colors.textPrimary};`;

/** Active/inactive extrapolated onto the phase map — see file header note. */
const StatusBadge = styled.span<{ $active: boolean }>`
  ${({ $active }) => phaseBadge($active ? 'fruiting' : 'decommissioned')}
`;

const StatusMessage = styled.p`text-align: center; padding: 48px 32px; color: ${({ theme }) => theme.colors.muted}; font-size: 15px;`;
const EmptyState = styled.div`text-align: center; padding: 64px 32px;`;
const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic; font-size: 1.4rem; color: ${({ theme }) => theme.colors.celeste}; margin: 0 0 8px;
`;
const EmptyText = styled.p`color: ${({ theme }) => theme.colors.muted}; font-size: 0.9rem; margin: 0;`;

// ─── Modal primitives ───────────────────────────────────────────────────────

const Overlay = styled.div`position: fixed; inset: 0; background: rgba(10, 14, 36, 0.6); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px;`;
const Modal = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  width: 100%; max-width: 480px; display: flex; flex-direction: column;
`;
const ModalHeader = styled.div`display: flex; justify-content: space-between; align-items: center; padding: 24px 28px 16px; border-bottom: 1px solid ${({ theme }) => theme.colors.line};`;
const ModalTitle = styled.h2`font-size: 20px; font-weight: 700; color: ${({ theme }) => theme.colors.textPrimary}; margin: 0;`;
const CloseButton = styled.button`
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; color: ${({ theme }) => theme.colors.muted};
  padding: 4px; border-radius: 6px;
  &:hover { background: rgba(180, 200, 220, 0.1); color: ${({ theme }) => theme.colors.textPrimary}; }
`;
const ModalBody = styled.div`padding: 24px 28px; display: flex; flex-direction: column; gap: 16px;`;
const ModalFooter = styled.div`padding: 16px 28px 24px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid ${({ theme }) => theme.colors.line};`;
const Field = styled.div`display: flex; flex-direction: column; gap: 6px;`;
const Label = styled.label`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;
const Input = styled.input`
  ${glassControl}
  padding: 10px 14px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
  &[disabled] { opacity: 0.6; }
`;
const ErrorText = styled.p`color: ${({ theme }) => theme.colors.error}; font-size: 13px; margin: 0;`;

// ─── Terms Form Modal ────────────────────────────────────────────────────────

interface TermsFormModalProps {
  terms?: PaymentTerms | null;
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}

function TermsFormModal({ terms, organizationId, onClose, onSaved }: TermsFormModalProps) {
  const createMutation = useCreatePaymentTerms();
  const updateMutation = useUpdatePaymentTerms();
  const isEdit = !!terms;

  const [form, setForm] = useState({
    termsCode: terms?.termsCode ?? '',
    description: terms?.description ?? '',
    netDays: terms?.netDays != null ? String(terms.netDays) : '',
  });
  const [error, setError] = useState<string | null>(null);
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    setError(null);
    const netDays = parseInt(form.netDays, 10);
    if (isNaN(netDays) || netDays < 0) {
      setError('Net days must be a non-negative integer');
      return;
    }
    try {
      if (isEdit) {
        const update: PaymentTermsUpdate = {
          description: form.description || undefined,
          netDays,
        };
        await updateMutation.mutateAsync({ termsId: terms!.termsId, data: update });
      } else {
        const create: PaymentTermsCreate = {
          organizationId,
          termsCode: form.termsCode,
          description: form.description,
          netDays,
        };
        await createMutation.mutateAsync(create);
      }
      onSaved();
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'An error occurred';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  };

  return (
    <Overlay>
      {/* Modal does NOT close on overlay click */}
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{isEdit ? 'Edit Payment Terms' : 'New Payment Terms'}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </CloseButton>
        </ModalHeader>
        <ModalBody>
          {error && <ErrorText>{error}</ErrorText>}
          <Field>
            <Label>Terms Code *</Label>
            <Input
              value={form.termsCode}
              onChange={set('termsCode')}
              placeholder="e.g. NET30, COD"
              disabled={isEdit}
              maxLength={20}
            />
          </Field>
          <Field>
            <Label>Description *</Label>
            <Input value={form.description} onChange={set('description')} placeholder="Net 30 days" />
          </Field>
          <Field>
            <Label>Net Days *</Label>
            <Input
              value={form.netDays}
              onChange={set('netDays')}
              type="number"
              min="0"
              placeholder="0 for COD/Immediate"
            />
          </Field>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" size="small" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="small" onClick={handleSubmit} disabled={isLoading || !form.termsCode || !form.description}>
            {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Terms'}
          </Button>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function PaymentTermsPage() {
  const { user } = useAuthStore();
  const organizationId = user?.organizationId ?? '';

  // Admin-only write access check
  const canWrite = ['admin', 'super_admin', 'finance_admin'].includes(user?.role ?? '');

  const [showModal, setShowModal] = useState(false);
  const [editingTerms, setEditingTerms] = useState<PaymentTerms | null>(null);
  const deleteMutation = useDeletePaymentTerms();

  const { data: termsList, isLoading, isError, refetch } = usePaymentTerms({ organizationId });

  const handleDelete = useCallback(
    async (terms: PaymentTerms, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canWrite) return;
      if (!confirm(`Deactivate terms "${terms.termsCode}"?`)) return;
      try {
        await deleteMutation.mutateAsync(terms.termsId);
      } catch {
        alert('Failed to deactivate terms.');
      }
    },
    [deleteMutation, canWrite]
  );

  const terms = Array.isArray(termsList) ? termsList : [];
  const activeCount = terms.filter((t) => t.isActive).length;

  return (
    <Container>
      <PageHeader
        breadcrumb="— PURCHASING · TERMS"
        title="Payment Terms"
        description="Net-day terms available to vendors across the organisation."
        stats={[
          { value: terms.length, label: 'Total Terms' },
          { value: activeCount, label: 'Active' },
        ]}
      />
      <AdminNote>
        Payment terms are seeded automatically for your organisation. Admin and Finance Admin can add custom terms.
      </AdminNote>

      {canWrite && (
        <HeaderRow>
          <Button variant="primary" onClick={() => { setEditingTerms(null); setShowModal(true); }}>
            New Terms
          </Button>
        </HeaderRow>
      )}

      {isLoading && <StatusMessage>Loading payment terms...</StatusMessage>}
      {isError && <StatusMessage>Failed to load payment terms. Please try again.</StatusMessage>}
      {!isLoading && !isError && terms.length === 0 && (
        <EmptyState>
          <EmptyHeadline>No payment terms yet</EmptyHeadline>
          <EmptyText>{canWrite ? 'Add your first custom terms above.' : 'Terms are seeded automatically for your organisation.'}</EmptyText>
        </EmptyState>
      )}

      {!isLoading && !isError && terms.length > 0 && (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Description</Th>
                <Th>Net Days</Th>
                <Th>Status</Th>
                {canWrite && <Th></Th>}
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <Tr
                  key={t.termsId}
                  onClick={() => { if (canWrite) { setEditingTerms(t); setShowModal(true); } }}
                >
                  <Td><CodeCell>{t.termsCode}</CodeCell></Td>
                  <Td>{t.description}</Td>
                  <Td><Mono>{t.netDays === 0 ? 'Immediate / COD' : `${t.netDays} days`}</Mono></Td>
                  <Td><StatusBadge $active={t.isActive}>{t.isActive ? 'Active' : 'Inactive'}</StatusBadge></Td>
                  {canWrite && (
                    <Td onClick={(e) => e.stopPropagation()}>
                      <DangerButton onClick={(e) => handleDelete(t, e)}>Deactivate</DangerButton>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {showModal && canWrite && (
        <TermsFormModal
          terms={editingTerms}
          organizationId={organizationId}
          onClose={() => { setShowModal(false); setEditingTerms(null); }}
          onSaved={() => { setShowModal(false); setEditingTerms(null); refetch(); }}
        />
      )}
    </Container>
  );
}
