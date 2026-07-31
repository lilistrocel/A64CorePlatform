/**
 * PurchaseItemsPage
 *
 * Purchase item master data management page.
 * Paginated list with type-filter chips, search, create/edit modals, and soft-delete.
 *
 * Modals do NOT close on overlay click — X button only.
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md):
 * visual reskin only — glass table/controls/modal, Space Mono metadata,
 * shared PageHeader/Button. Items have no PR/PO/GR/AP lifecycle status — the
 * active/inactive toggle is extrapolated onto the phase map per spec §5.2 as
 * 'fruiting' (active) / 'decommissioned' (inactive), matching VendorsPage's
 * choice. Item TYPE (raw material/consumable/service/fixed asset) is a
 * categorical label, not a status, so it intentionally stays a single flat
 * glass tag rather than inventing a new per-type colour vocabulary (spec:
 * "do not invent per-module variants"). Logic, routes, data-fetching and
 * props are unchanged.
 */

import { useState, useCallback } from 'react';
import styled, { css } from 'styled-components';
import { X } from 'lucide-react';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
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
const FilterRow = styled.div`display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; align-items: center;`;
const SearchInput = styled.input`
  ${glassControl}
  flex: 1; min-width: 220px; padding: 10px 14px;
  font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
`;
const DangerButton = styled.button`
  padding: 6px 14px; background: ${({ theme }) => theme.colors.errorBg}; color: ${({ theme }) => theme.colors.error};
  border: 1px solid rgba(240, 138, 112, 0.4); border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 150ms ease;
  &:hover { background: rgba(240, 138, 112, 0.24); }
`;
const ChipRow = styled.div`display: flex; gap: 8px; flex-wrap: wrap;`;
const Chip = styled.button<{ $active: boolean }>`
  ${glassControl}
  padding: 6px 14px; border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem; letter-spacing: 0.04em; cursor: pointer; transition: all 150ms ease;
  color: ${({ theme }) => theme.colors.muted};
  &:hover { border-color: rgba(180, 200, 220, 0.4); color: ${({ theme }) => theme.colors.textPrimary}; }
  ${({ $active, theme }) => $active && css`
    color: ${theme.colors.celeste};
    border-color: ${theme.colors.celeste};
    background: rgba(180, 200, 220, 0.14);
  `}
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

/** Active/inactive extrapolated onto the phase map — see file header note. */
const StatusBadge = styled.span<{ $active: boolean }>`
  ${({ $active }) => phaseBadge($active ? 'fruiting' : 'decommissioned')}
`;

/** Item type — categorical, not a status. Single flat glass tag, no
 * per-type colour vocabulary (see file header note). */
const TypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: capitalize;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
`;

const StatusMessage = styled.p`text-align: center; padding: 48px 32px; color: ${({ theme }) => theme.colors.muted}; font-size: 15px;`;
const EmptyState = styled.div`text-align: center; padding: 64px 32px;`;
const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic; font-size: 1.4rem; color: ${({ theme }) => theme.colors.celeste}; margin: 0 0 8px;
`;
const EmptyText = styled.p`color: ${({ theme }) => theme.colors.muted}; font-size: 0.9rem; margin: 0 0 20px;`;
const Pagination = styled.div`display: flex; justify-content: space-between; align-items: center; padding: 16px 0; font-size: 14px; color: ${({ theme }) => theme.colors.muted};`;
const PageButtons = styled.div`display: flex; align-items: center; gap: 8px;`;
const PageIndicator = styled.span`
  ${monoLabel}
  padding: 6px 12px; color: ${({ theme }) => theme.colors.celeste};
`;

// ─── Modal primitives ───────────────────────────────────────────────────────

const Overlay = styled.div`position: fixed; inset: 0; background: rgba(10, 14, 36, 0.6); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px;`;
const Modal = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  width: 100%; max-width: 580px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column;
`;
const ModalHeader = styled.div`display: flex; justify-content: space-between; align-items: center; padding: 24px 28px 16px; border-bottom: 1px solid ${({ theme }) => theme.colors.line}; flex-shrink: 0;`;
const ModalTitle = styled.h2`font-size: 20px; font-weight: 700; color: ${({ theme }) => theme.colors.textPrimary}; margin: 0;`;
const CloseButton = styled.button`
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; color: ${({ theme }) => theme.colors.muted};
  padding: 4px; border-radius: 6px;
  &:hover { background: rgba(180, 200, 220, 0.1); color: ${({ theme }) => theme.colors.textPrimary}; }
`;
const ModalBody = styled.div`padding: 24px 28px; display: flex; flex-direction: column; gap: 16px; flex: 1;`;
const ModalFooter = styled.div`padding: 16px 28px 24px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid ${({ theme }) => theme.colors.line}; flex-shrink: 0;`;
const FormRow = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 16px; @media (max-width: 600px) { grid-template-columns: 1fr; }`;
const Field = styled.div`display: flex; flex-direction: column; gap: 6px;`;
const Label = styled.label`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;
const inputChrome = css`
  ${glassControl}
  padding: 10px 14px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
  &[disabled] { opacity: 0.6; }
`;
const Input = styled.input`${inputChrome}`;
const SelectField = styled.select`${inputChrome} cursor: pointer;`;
const ErrorText = styled.p`color: ${({ theme }) => theme.colors.error}; font-size: 13px; margin: 0;`;

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
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </CloseButton>
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
          <Button variant="outline" size="small" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="small" onClick={handleSubmit} disabled={isLoading || !form.name || !form.uom}>
            {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Item'}
          </Button>
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
      <PageHeader
        breadcrumb="— PURCHASING · ITEMS"
        title="Purchase Items"
        description="Item master data used across purchase requests, orders and receipts."
        stats={[
          { value: meta.total, label: 'Total Items' },
          { value: items.length, label: 'This Page' },
        ]}
      />

      <FilterRow>
        <SearchInput
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Button variant="primary" onClick={() => { setEditingItem(null); setShowModal(true); }}>New Item</Button>
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

      {isLoading && <StatusMessage>Loading purchase items...</StatusMessage>}
      {isError && <StatusMessage>Failed to load items. Please try again.</StatusMessage>}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState>
          <EmptyHeadline>No purchase items yet</EmptyHeadline>
          {/* Reason: no separate CTA — "New Item" above in FilterRow already
              covers this action; a second gold primary button here would
              breach the spec §3 ≤4-gold-per-view budget. */}
          <EmptyText style={{ marginBottom: 0 }}>Create your first item above to get started.</EmptyText>
        </EmptyState>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          <TableWrap>
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
                    <Td><Mono style={{ fontSize: 12 }}>{item.itemCode}</Mono></Td>
                    <Td>{item.name}</Td>
                    <Td><TypeBadge>{item.itemType.replace(/_/g, ' ')}</TypeBadge></Td>
                    <Td>{item.uom}</Td>
                    <Td><Mono>{item.defaultUnitCost != null ? `AED ${Number(item.defaultUnitCost).toFixed(2)}` : '—'}</Mono></Td>
                    <Td><StatusBadge $active={item.isActive}>{item.isActive ? 'Active' : 'Inactive'}</StatusBadge></Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <DangerButton onClick={(e) => handleDelete(item, e)}>Delete</DangerButton>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination>
            <span>Showing {items.length} of {meta.total} items</span>
            <PageButtons>
              <Button variant="outline" size="small" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
              <PageIndicator>Page {meta.page} / {meta.totalPages}</PageIndicator>
              <Button variant="outline" size="small" onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages}>Next</Button>
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
