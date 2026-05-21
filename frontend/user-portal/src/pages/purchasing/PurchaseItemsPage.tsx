/**
 * PurchaseItemsPage
 *
 * Purchase item master data management page.
 * Paginated list with type-filter chips, search, create/edit modals, and soft-delete.
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState, useCallback } from 'react';
import styled from 'styled-components';
import {
  usePurchaseItems,
  useCreatePurchaseItem,
  useUpdatePurchaseItem,
  useDeletePurchaseItem,
} from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { PurchaseItem, PurchaseItemCreate, PurchaseItemUpdate, ItemType } from '../../services/purchasingApi';

// ─── Styled components ──────────────────────────────────────────────────────

const Container = styled.div`padding: 32px; max-width: 1440px; margin: 0 auto;`;
const Header = styled.div`display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;`;
const Title = styled.h1`font-size: 28px; font-weight: 600; color: ${({ theme }) => theme.colors.text.primary}; margin: 0;`;
const FilterRow = styled.div`display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; align-items: center;`;
const SearchInput = styled.input`
  flex: 1; min-width: 220px; padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle}; border-radius: 8px;
  font-size: 14px; background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &::placeholder { color: ${({ theme }) => theme.colors.text.tertiary}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;
const PrimaryButton = styled.button`
  padding: 10px 20px; background: ${({ theme }) => theme.colors.accent.sage}; color: white;
  border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageDeep}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const GhostButton = styled.button`
  padding: 6px 14px; background: transparent; color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle}; border-radius: 6px; font-size: 13px; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;
const DangerButton = styled.button`
  padding: 6px 14px; background: transparent; color: ${({ theme }) => theme.colors.status.danger};
  border: 1px solid ${({ theme }) => theme.colors.status.danger}; border-radius: 6px; font-size: 13px; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.status.danger}; }
`;
const ChipRow = styled.div`display: flex; gap: 8px; flex-wrap: wrap;`;
const Chip = styled.button<{ $active: boolean }>`
  padding: 6px 14px; border-radius: 99px; font-size: 13px; font-weight: 500; cursor: pointer;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.accent.sage : theme.colors.border.subtle)};
  background: ${({ $active, theme }) => ($active ? `${theme.colors.accent.sage}15` : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.accent.sage : theme.colors.text.secondary)};
  transition: all 150ms ease;
`;
const Table = styled.table`width: 100%; border-collapse: collapse; background: ${({ theme }) => theme.colors.surface.raised}; border-radius: 12px; overflow: hidden; box-shadow: ${({ theme }) => theme.shadows.sm};`;
const Th = styled.th`padding: 14px 16px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: ${({ theme }) => theme.colors.text.secondary}; background: ${({ theme }) => theme.colors.surface.canvas}; border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};`;
const Td = styled.td`padding: 14px 16px; font-size: 14px; color: ${({ theme }) => theme.colors.text.primary}; border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};`;
const Tr = styled.tr`cursor: pointer; transition: background 100ms ease; &:hover { background: ${({ theme }) => theme.colors.surface.canvas}; } &:last-child td { border-bottom: none; }`;
const Badge = styled.span<{ $active: boolean }>`
  display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 600;
  background: ${({ $active, theme }) => $active ? theme.colors.accent.sageSoft || '#ecfdf5' : theme.colors.surface.raised};
  color: ${({ $active, theme }) => $active ? theme.colors.status.success || '#0F6E56' : theme.colors.text.tertiary};
`;
const TypeBadge = styled.span`display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: ${({ theme }) => theme.colors.surface.sunken || 'rgba(15,110,86,0.05)'}; color: ${({ theme }) => theme.colors.status.info || '#0F6E56'};`;
const EmptyState = styled.div`text-align: center; padding: 64px 32px; color: ${({ theme }) => theme.colors.text.secondary}; font-size: 15px;`;
const Pagination = styled.div`display: flex; justify-content: space-between; align-items: center; padding: 16px 0; font-size: 14px; color: ${({ theme }) => theme.colors.text.secondary};`;
const PageButtons = styled.div`display: flex; gap: 8px;`;

// ─── Modal primitives ───────────────────────────────────────────────────────

const Overlay = styled.div`position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px;`;
const Modal = styled.div`background: ${({ theme }) => theme.colors.surface.raised}; border-radius: 16px; box-shadow: ${({ theme }) => theme.shadows.md}; width: 100%; max-width: 580px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column;`;
const ModalHeader = styled.div`display: flex; justify-content: space-between; align-items: center; padding: 24px 28px 16px; border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken}; flex-shrink: 0;`;
const ModalTitle = styled.h2`font-size: 20px; font-weight: 700; color: ${({ theme }) => theme.colors.text.primary}; margin: 0;`;
const CloseButton = styled.button`background: none; border: none; font-size: 20px; cursor: pointer; color: ${({ theme }) => theme.colors.text.secondary}; padding: 4px; border-radius: 6px; line-height: 1; &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }`;
const ModalBody = styled.div`padding: 24px 28px; display: flex; flex-direction: column; gap: 16px; flex: 1;`;
const ModalFooter = styled.div`padding: 16px 28px 24px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken}; flex-shrink: 0;`;
const FormRow = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 16px; @media (max-width: 600px) { grid-template-columns: 1fr; }`;
const Field = styled.div`display: flex; flex-direction: column; gap: 6px;`;
const Label = styled.label`font-size: 13px; font-weight: 600; color: ${({ theme }) => theme.colors.text.secondary};`;
const Input = styled.input`padding: 10px 14px; border: 1px solid ${({ theme }) => theme.colors.border.subtle}; border-radius: 8px; font-size: 14px; background: ${({ theme }) => theme.colors.surface.canvas}; color: ${({ theme }) => theme.colors.text.primary}; &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; } &[disabled] { opacity: 0.6; }`;
const SelectField = styled.select`padding: 10px 14px; border: 1px solid ${({ theme }) => theme.colors.border.subtle}; border-radius: 8px; font-size: 14px; background: ${({ theme }) => theme.colors.surface.canvas}; color: ${({ theme }) => theme.colors.text.primary}; &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }`;
const ErrorText = styled.p`color: ${({ theme }) => theme.colors.status.danger}; font-size: 13px; margin: 0;`;

const ITEM_TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'service', label: 'Service' },
  { value: 'fixed_asset_acquisition', label: 'Fixed Asset' },
];

const ITEM_TYPE_FILTER = [
  { value: '', label: 'All Types' },
  ...ITEM_TYPE_OPTIONS,
];

// ─── Item Form Modal ─────────────────────────────────────────────────────────

interface ItemFormModalProps {
  item?: PurchaseItem | null;
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}

function ItemFormModal({ item, organizationId, onClose, onSaved }: ItemFormModalProps) {
  const createMutation = useCreatePurchaseItem();
  const updateMutation = useUpdatePurchaseItem();
  const isEdit = !!item;

  const [form, setForm] = useState({
    itemCode: item?.itemCode ?? '',
    name: item?.name ?? '',
    itemType: item?.itemType ?? 'raw_material' as ItemType,
    uom: item?.uom ?? '',
    description: item?.description ?? '',
    defaultUnitCost: item?.defaultUnitCost != null ? String(item.defaultUnitCost) : '',
    barcode: item?.barcode ?? '',
    manufacturer: item?.manufacturer ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    setError(null);
    // Reason: refuse to submit when organizationId is missing. Empty-string org
    // would create a record the finance consumer can't process (UUID validation
    // fails downstream), leaving an orphan item + a failed outbox event.
    if (!isEdit && !organizationId) {
      setError(
        'No organisation assigned to your account. Log out and back in to refresh — if the problem persists, contact admin.'
      );
      return;
    }
    try {
      if (isEdit) {
        const update: PurchaseItemUpdate = {
          name: form.name || undefined,
          itemType: form.itemType || undefined,
          uom: form.uom || undefined,
          description: form.description || null,
          defaultUnitCost: form.defaultUnitCost ? Number(form.defaultUnitCost) : null,
          barcode: form.barcode || null,
          manufacturer: form.manufacturer || null,
        };
        await updateMutation.mutateAsync({ itemId: item!.itemId, data: update });
      } else {
        const create: PurchaseItemCreate = {
          organizationId,
          itemCode: form.itemCode || undefined,
          name: form.name,
          itemType: form.itemType,
          uom: form.uom,
          description: form.description || null,
          defaultUnitCost: form.defaultUnitCost ? Number(form.defaultUnitCost) : null,
          barcode: form.barcode || null,
          manufacturer: form.manufacturer || null,
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
          <ModalTitle>{isEdit ? 'Edit Purchase Item' : 'New Purchase Item'}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close">✕</CloseButton>
        </ModalHeader>
        <ModalBody>
          {error && <ErrorText>{error}</ErrorText>}
          <FormRow>
            <Field>
              <Label>Item Code</Label>
              <Input value={form.itemCode} onChange={set('itemCode')} placeholder="Auto-generated if blank" disabled={isEdit} />
            </Field>
            <Field>
              <Label>Name *</Label>
              <Input value={form.name} onChange={set('name')} placeholder="Item display name" />
            </Field>
          </FormRow>
          <FormRow>
            <Field>
              <Label>Item Type *</Label>
              <SelectField value={form.itemType} onChange={set('itemType')}>
                {ITEM_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectField>
            </Field>
            <Field>
              <Label>Unit of Measure *</Label>
              <Input value={form.uom} onChange={set('uom')} placeholder="kg, bag, L, each, hour" />
            </Field>
          </FormRow>
          <FormRow>
            <Field>
              <Label>Default Unit Cost (AED)</Label>
              <Input value={form.defaultUnitCost} onChange={set('defaultUnitCost')} type="number" min="0" step="0.01" placeholder="0.00" />
            </Field>
            <Field>
              <Label>Manufacturer</Label>
              <Input value={form.manufacturer} onChange={set('manufacturer')} placeholder="Optional" />
            </Field>
          </FormRow>
          <FormRow>
            <Field>
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={set('barcode')} placeholder="Optional barcode" />
            </Field>
            <Field>
              <Label>Description</Label>
              <Input value={form.description} onChange={set('description')} placeholder="Optional description" />
            </Field>
          </FormRow>
        </ModalBody>
        <ModalFooter>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSubmit} disabled={isLoading || !form.name || !form.uom}>
            {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Item'}
          </PrimaryButton>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function PurchaseItemsPage() {
  const { user } = useAuthStore();
  const organizationId = user?.organizationId ?? '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseItem | null>(null);
  const deleteMutation = useDeletePurchaseItem();

  const { data, isLoading, isError, refetch } = usePurchaseItems({
    organizationId,
    page,
    perPage: 20,
    search: search || undefined,
    itemType: typeFilter || undefined,
  });

  const handleDelete = useCallback(
    async (item: PurchaseItem, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm(`Soft-delete item "${item.name}"?`)) return;
      try {
        await deleteMutation.mutateAsync(item.itemId);
      } catch {
        alert('Failed to delete item.');
      }
    },
    [deleteMutation]
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <Container>
      <Header>
        <Title>Purchase Items</Title>
        <PrimaryButton onClick={() => { setEditingItem(null); setShowModal(true); }}>+ New Item</PrimaryButton>
      </Header>

      <FilterRow>
        <SearchInput
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </FilterRow>

      <ChipRow style={{ marginBottom: 20 }}>
        {ITEM_TYPE_FILTER.map((f) => (
          <Chip
            key={f.value}
            $active={typeFilter === f.value}
            onClick={() => { setTypeFilter(f.value); setPage(1); }}
          >
            {f.label}
          </Chip>
        ))}
      </ChipRow>

      {isLoading && <EmptyState>Loading purchase items...</EmptyState>}
      {isError && <EmptyState>Failed to load items. Please try again.</EmptyState>}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState>No purchase items found. Create your first item to get started.</EmptyState>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>UOM</Th>
                <Th>Default Cost</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Tr key={item.itemId} onClick={() => { setEditingItem(item); setShowModal(true); }}>
                  <Td><code style={{ fontSize: 12 }}>{item.itemCode}</code></Td>
                  <Td>{item.name}</Td>
                  <Td><TypeBadge>{item.itemType.replace(/_/g, ' ')}</TypeBadge></Td>
                  <Td>{item.uom}</Td>
                  <Td>{item.defaultUnitCost != null ? `AED ${Number(item.defaultUnitCost).toFixed(2)}` : '—'}</Td>
                  <Td><Badge $active={item.isActive}>{item.isActive ? 'Active' : 'Inactive'}</Badge></Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <DangerButton onClick={(e) => handleDelete(item, e)}>Delete</DangerButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination>
            <span>Showing {items.length} of {meta.total} items</span>
            <PageButtons>
              <GhostButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</GhostButton>
              <span style={{ padding: '6px 12px', fontSize: 13 }}>Page {meta.page} / {meta.totalPages}</span>
              <GhostButton onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages}>Next</GhostButton>
            </PageButtons>
          </Pagination>
        </>
      )}

      {showModal && (
        <ItemFormModal
          item={editingItem}
          organizationId={organizationId}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          onSaved={() => { setShowModal(false); setEditingItem(null); refetch(); }}
        />
      )}
    </Container>
  );
}
