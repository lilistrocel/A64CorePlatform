/**
 * PaymentTermsPage
 *
 * Payment terms master data management page.
 * Admin-only write access. Simple list with create/edit modals.
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState, useCallback } from 'react';
import styled from 'styled-components';
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
const Header = styled.div`display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;`;
const Title = styled.h1`font-size: 28px; font-weight: 600; color: ${({ theme }) => theme.colors.textPrimary}; margin: 0;`;
const AdminNote = styled.p`font-size: 13px; color: ${({ theme }) => theme.colors.textSecondary}; margin: 0 0 24px;`;
const PrimaryButton = styled.button`padding: 10px 20px; background: ${({ theme }) => theme.colors.primary[500]}; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; &:hover { background: ${({ theme }) => theme.colors.primary[700]}; } &:disabled { opacity: 0.5; cursor: not-allowed; }`;
const GhostButton = styled.button`padding: 6px 14px; background: transparent; color: ${({ theme }) => theme.colors.textSecondary}; border: 1px solid ${({ theme }) => theme.colors.neutral[300]}; border-radius: 6px; font-size: 13px; cursor: pointer; &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }`;
const DangerButton = styled.button`padding: 6px 14px; background: transparent; color: ${({ theme }) => theme.colors.error}; border: 1px solid ${({ theme }) => theme.colors.error}; border-radius: 6px; font-size: 13px; cursor: pointer; &:hover { background: ${({ theme }) => theme.colors.errorBg}; }`;
const Table = styled.table`width: 100%; border-collapse: collapse; background: ${({ theme }) => theme.colors.surface}; border-radius: 12px; overflow: hidden; box-shadow: ${({ theme }) => theme.shadows.sm};`;
const Th = styled.th`padding: 14px 16px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: ${({ theme }) => theme.colors.textSecondary}; background: ${({ theme }) => theme.colors.neutral[50]}; border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};`;
const Td = styled.td`padding: 14px 16px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary}; border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};`;
const Tr = styled.tr`cursor: pointer; transition: background 100ms ease; &:hover { background: ${({ theme }) => theme.colors.neutral[50]}; } &:last-child td { border-bottom: none; }`;
const Badge = styled.span<{ $active: boolean }>`display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; background: ${({ $active, theme }) => $active ? theme.colors.successBg || '#ecfdf5' : theme.colors.neutral[100]}; color: ${({ $active, theme }) => $active ? theme.colors.success || '#10b981' : theme.colors.textDisabled};`;
const EmptyState = styled.div`text-align: center; padding: 64px 32px; color: ${({ theme }) => theme.colors.textSecondary}; font-size: 15px;`;
const AccessDenied = styled.div`text-align: center; padding: 80px 32px; color: ${({ theme }) => theme.colors.textSecondary};`;

// ─── Modal primitives ───────────────────────────────────────────────────────

const Overlay = styled.div`position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px;`;
const Modal = styled.div`background: ${({ theme }) => theme.colors.surface}; border-radius: 16px; box-shadow: ${({ theme }) => theme.shadows.xl}; width: 100%; max-width: 480px; display: flex; flex-direction: column;`;
const ModalHeader = styled.div`display: flex; justify-content: space-between; align-items: center; padding: 24px 28px 16px; border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};`;
const ModalTitle = styled.h2`font-size: 20px; font-weight: 700; color: ${({ theme }) => theme.colors.textPrimary}; margin: 0;`;
const CloseButton = styled.button`background: none; border: none; font-size: 20px; cursor: pointer; color: ${({ theme }) => theme.colors.textSecondary}; padding: 4px; border-radius: 6px; line-height: 1; &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }`;
const ModalBody = styled.div`padding: 24px 28px; display: flex; flex-direction: column; gap: 16px;`;
const ModalFooter = styled.div`padding: 16px 28px 24px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};`;
const Field = styled.div`display: flex; flex-direction: column; gap: 6px;`;
const Label = styled.label`font-size: 13px; font-weight: 600; color: ${({ theme }) => theme.colors.textSecondary};`;
const Input = styled.input`padding: 10px 14px; border: 1px solid ${({ theme }) => theme.colors.neutral[300]}; border-radius: 8px; font-size: 14px; background: ${({ theme }) => theme.colors.background}; color: ${({ theme }) => theme.colors.textPrimary}; &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; } &[disabled] { opacity: 0.6; }`;
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
          <CloseButton onClick={onClose} aria-label="Close">✕</CloseButton>
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
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSubmit} disabled={isLoading || !form.termsCode || !form.description}>
            {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Terms'}
          </PrimaryButton>
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

  return (
    <Container>
      <Header>
        <Title>Payment Terms</Title>
        {canWrite && (
          <PrimaryButton onClick={() => { setEditingTerms(null); setShowModal(true); }}>
            + New Terms
          </PrimaryButton>
        )}
      </Header>
      <AdminNote>
        Payment terms are seeded automatically for your organisation. Admin and Finance Admin can add custom terms.
      </AdminNote>

      {isLoading && <EmptyState>Loading payment terms...</EmptyState>}
      {isError && <EmptyState>Failed to load payment terms. Please try again.</EmptyState>}
      {!isLoading && !isError && terms.length === 0 && (
        <EmptyState>No payment terms found.</EmptyState>
      )}

      {!isLoading && !isError && terms.length > 0 && (
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
                <Td><strong>{t.termsCode}</strong></Td>
                <Td>{t.description}</Td>
                <Td>{t.netDays === 0 ? 'Immediate / COD' : `${t.netDays} days`}</Td>
                <Td><Badge $active={t.isActive}>{t.isActive ? 'Active' : 'Inactive'}</Badge></Td>
                {canWrite && (
                  <Td onClick={(e) => e.stopPropagation()}>
                    <DangerButton onClick={(e) => handleDelete(t, e)}>Deactivate</DangerButton>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
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
