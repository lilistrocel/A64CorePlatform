/**
 * ProductsEditor Component
 *
 * Shared products (yield picklist) editor for a plant mother — see
 * Docs/2-Working-Progress/plant-library-product-extension-design.md.
 * Used by both PlantMotherFormModal (create/edit — the primary home per the
 * user) and PlantMotherDetailModal (an already-open mother's full view).
 *
 * Two modes, chosen entirely by whether `motherId` is provided:
 *
 * - LIVE mode (`motherId` set): every action (add/rename/recategorise/
 *   deactivate/reactivate) goes straight to the four
 *   /plant-mothers/{id}/products endpoints via TanStack mutations. Used
 *   whenever the mother already exists — always in the detail modal, and in
 *   the create/edit modal whenever editing an existing mother OR once a
 *   brand-new mother has just been created.
 * - DRAFT mode (`motherId` undefined): the mother does not exist yet, so
 *   there is nothing to POST to. Products are held in the caller's own
 *   state (`draftProducts` / `onDraftProductsChange`, lifted so the parent
 *   form can read them at submit time) and only client-side validated
 *   (non-empty name, no duplicate name within the draft list — the server's
 *   case-insensitive 409 check doesn't exist yet for a mother that isn't
 *   created). The parent alone is responsible for POSTing each draft
 *   product once the mother is created, and for telling the user about any
 *   that fail — this component has no knowledge of that step.
 *
 * Modal-closing rules (backdrop click, X-only) belong to the parent modal;
 * this component owns no overlay of its own.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { Pencil, Plus, Check, Power, RotateCcw, X as RemoveIcon } from 'lucide-react';
import { glassControl, monoLabel } from '@a64core/shared';
import {
  useProductsForMother,
  useAddProduct,
  useUpdateProduct,
  useDeactivateProduct,
} from '../../hooks/queries/usePlantMothers';
import type { PlantProduct, PlantProductCreate, ProductCategory, ProductUnit } from '../../types/farm';

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  sellable: 'Sellable',
  process: 'Process',
  waste: 'Waste',
};

// Only member today — a real select so a future animal-husbandry unit slots
// in without UI rework (design doc §1, T-922). Create-only; never shown on edit.
const PRODUCT_UNITS: ProductUnit[] = ['kg'];

/**
 * Local-only product row before the mother exists. `draftId` is a client
 * key for React + edit/remove targeting — it is never sent to the server;
 * the POST body is just `{ name, unit, category }` (PlantProductCreate).
 */
export interface DraftProduct extends PlantProductCreate {
  draftId: string;
}

let draftIdCounter = 0;
export function makeDraftId(): string {
  draftIdCounter += 1;
  return `draft-${Date.now()}-${draftIdCounter}`;
}

export interface ProductsEditorProps {
  /** Live mode when set: CRUD goes straight to /plant-mothers/{motherId}/products. */
  motherId?: string;
  /** Draft mode (motherId omitted): controlled local list, lifted to the caller. */
  draftProducts?: DraftProduct[];
  onDraftProductsChange?: (products: DraftProduct[]) => void;
  /** Disables every control — e.g. while the parent form is submitting. */
  disabled?: boolean;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const ProductsSection = styled.div``;

const SectionTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const AddProductButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const DraftHint = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  margin: -8px 0 16px 0;
`;

// Draft-mode-only requirement meter (create flow, PlantMotherFormModal) —
// mirrors the server invariant locally since there is no server to consult
// yet. Numerator is capped at 1 on purpose: this counts whether the
// requirement is met, not how many sellable drafts exist (adding 2 or 3
// sellable products must still read "1/1", never "2/1"/"3/1"). Never
// rendered in live mode — the mother there already always has a sellable
// product (server-enforced), so a counter would be meaningless.
const SellableCounter = styled.span<{ $satisfied: boolean }>`
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-style: normal;
  padding: 2px 9px;
  border-radius: 9999px;

  ${({ $satisfied, theme }) =>
    $satisfied
      ? `background: ${theme.colors.successBg}; color: ${theme.colors.success};`
      : `background: ${theme.colors.warningBg}; color: ${theme.colors.warning};`}
`;

const ProductRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(180, 200, 220, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const ProductInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
`;

const ProductName = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const UnitTag = styled.span`
  ${monoLabel}
  font-size: 0.65rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const InactiveTag = styled.span`
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(180, 200, 220, 0.12);
  color: ${({ theme }) => theme.colors.muted};
`;

const LockedHint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  flex-basis: 100%;
`;

const CategoryBadge = styled.span<{ $category: ProductCategory }>`
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 9px;
  border-radius: 9999px;
  white-space: nowrap;

  ${({ $category, theme }) => {
    if ($category === 'sellable') {
      return `background: ${theme.colors.successBg}; color: ${theme.colors.success};`;
    }
    if ($category === 'process') {
      return `background: ${theme.colors.infoBg}; color: ${theme.colors.info};`;
    }
    return `background: ${theme.colors.warningBg}; color: ${theme.colors.warning};`;
  }}
`;

const RowButton = styled.button<{ $variant?: 'edit' | 'delete' }>`
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 150ms ease-in-out;

  ${({ $variant, theme }) => {
    if ($variant === 'delete') {
      return `
        background: ${theme.colors.errorBg};
        color: ${theme.colors.error};
        border: 1px solid ${theme.colors.error};
        &:hover:not(:disabled) { filter: brightness(1.15); }
      `;
    }
    return `
      background: ${theme.colors.glass.base};
      color: ${theme.colors.textPrimary};
      border: 1px solid ${theme.colors.glass.border};
      &:hover:not(:disabled) { background: ${theme.colors.glass.hi}; }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ProductRowActions = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
`;

const EditProductForm = styled.form`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
`;

const AddProductForm = styled.form`
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px 16px;
  background: rgba(180, 200, 220, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  margin-bottom: 12px;
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.label`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const ProductInput = styled.input`
  ${glassControl}
  padding: 9px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 160px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ProductSelect = styled.select`
  ${glassControl}
  padding: 9px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ProductFormActions = styled.div`
  display: flex;
  gap: 6px;
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
  flex-basis: 100%;
`;

const ErrorBanner = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
`;

const EmptyText = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  font-size: 14px;
  text-align: center;
  padding: 32px 16px;
`;

const LoadingText = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  text-align: center;
  padding: 32px 16px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface DisplayRow {
  id: string;
  name: string;
  unit: ProductUnit;
  category: ProductCategory;
  isActive: boolean;
  isDraft: boolean;
}

export function ProductsEditor({ motherId, draftProducts, onDraftProductsChange, disabled }: ProductsEditorProps) {
  const isDraftMode = !motherId;

  // Live-mode data/mutations. Safe to call unconditionally even in draft
  // mode: the query hook no-ops (enabled: !!motherId), the mutations don't
  // fetch on mount, and draft mode never calls their mutateAsync.
  const { data: liveProducts, isLoading: liveLoading, error: liveError } = useProductsForMother(motherId);
  const addProduct = useAddProduct();
  const updateProduct = useUpdateProduct();
  const deactivateProduct = useDeactivateProduct();

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCategory, setAddCategory] = useState<ProductCategory>('sellable');
  const [addUnit, setAddUnit] = useState<ProductUnit>('kg');
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<ProductCategory>('sellable');
  const [editError, setEditError] = useState<string | null>(null);

  const [productActionError, setProductActionError] = useState<string | null>(null);

  // Server invariant (T-922): every mother must always keep >=1 active
  // sellable product. Deactivating or recategorising the last one away from
  // sellable now 409s server-side. This is only a courtesy — the client's
  // view can be stale (another tab, another user) — so the 409 handling
  // below stays in place regardless; this just avoids inviting a click that
  // is (as far as this client currently knows) guaranteed to fail.
  const activeSellableIds = new Set(
    (liveProducts || []).filter((p) => p.isActive && p.category === 'sellable').map((p) => p.productId)
  );
  const isLastActiveSellable = (productId: string): boolean =>
    activeSellableIds.has(productId) && activeSellableIds.size === 1;

  // Draft mode has no server to consult, so the same rule is mirrored
  // locally: purely informational, never blocks removing the only sellable
  // draft row — the pre-submit confirmation (PlantMotherFormModal) is what
  // actually explains the outcome before it happens.
  const draftHasSellable = isDraftMode && (draftProducts || []).some((p) => p.category === 'sellable');

  // Surfaces the backend's 409 (case-insensitive name clash within this
  // mother) and 404 messages verbatim — same pattern as PlantMotherFormModal.
  const extractProductErrorMessage = (err: unknown, fallback: string): string => {
    const axiosError = err as { response?: { data?: { detail?: unknown } } };
    const detail = axiosError.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
  };

  const resetAddForm = () => {
    setAddName('');
    setAddCategory('sellable');
    setAddUnit('kg');
    setAddError(null);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addName.trim();
    if (!trimmed) {
      setAddError('Product name is required.');
      return;
    }
    setAddError(null);

    if (isDraftMode) {
      const clash = (draftProducts || []).some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
      if (clash) {
        setAddError(`A product named "${trimmed}" is already in this list.`);
        return;
      }
      onDraftProductsChange?.([
        ...(draftProducts || []),
        { draftId: makeDraftId(), name: trimmed, unit: addUnit, category: addCategory },
      ]);
      resetAddForm();
      setShowAddProduct(false);
      return;
    }

    try {
      await addProduct.mutateAsync({
        motherId: motherId!,
        data: { name: trimmed, unit: addUnit, category: addCategory },
      });
      resetAddForm();
      setShowAddProduct(false);
    } catch (err) {
      setAddError(extractProductErrorMessage(err, 'Failed to add product. Please try again.'));
    }
  };

  const handleStartEdit = (row: DisplayRow) => {
    setEditingId(row.id);
    setEditName(row.name);
    setEditCategory(row.category);
    setEditError(null);
    setProductActionError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = async (row: DisplayRow, e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError('Product name is required.');
      return;
    }
    setEditError(null);

    if (isDraftMode) {
      const clash = (draftProducts || []).some(
        (p) => p.draftId !== row.id && p.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (clash) {
        setEditError(`A product named "${trimmed}" is already in this list.`);
        return;
      }
      onDraftProductsChange?.(
        (draftProducts || []).map((p) => (p.draftId === row.id ? { ...p, name: trimmed, category: editCategory } : p))
      );
      setEditingId(null);
      return;
    }

    try {
      await updateProduct.mutateAsync({
        motherId: motherId!,
        productId: row.id,
        data: { name: trimmed, category: editCategory },
      });
      setEditingId(null);
    } catch (err) {
      setEditError(extractProductErrorMessage(err, 'Failed to update product. Please try again.'));
    }
  };

  const handleRemoveDraft = (draftId: string) => {
    onDraftProductsChange?.((draftProducts || []).filter((p) => p.draftId !== draftId));
  };

  const handleToggleActive = async (product: PlantProduct) => {
    setProductActionError(null);
    try {
      if (product.isActive) {
        await deactivateProduct.mutateAsync({ motherId: motherId!, productId: product.productId });
      } else {
        await updateProduct.mutateAsync({
          motherId: motherId!,
          productId: product.productId,
          data: { isActive: true },
        });
      }
    } catch (err) {
      setProductActionError(
        extractProductErrorMessage(
          err,
          `Failed to ${product.isActive ? 'deactivate' : 'reactivate'} product. Please try again.`
        )
      );
    }
  };

  // Unified display rows: draft entries are always "active" (no persisted
  // inactive state exists before the mother is created); live entries carry
  // the server's isActive, including deactivated ones — deactivation is
  // never deletion, so they stay visible, clearly marked (design doc §4.1).
  const rows: DisplayRow[] = isDraftMode
    ? (draftProducts || []).map((p) => ({
        id: p.draftId,
        name: p.name,
        unit: p.unit,
        category: p.category,
        isActive: true,
        isDraft: true,
      }))
    : (liveProducts || []).map((p) => ({
        id: p.productId,
        name: p.name,
        unit: p.unit,
        category: p.category,
        isActive: p.isActive,
        isDraft: false,
      }));

  const isLoading = !isDraftMode && liveLoading;
  const loadError = !isDraftMode && !!liveError;

  return (
    <ProductsSection>
      <SectionTitleRow>
        <SectionTitle>Products</SectionTitle>
        <AddProductButton
          type="button"
          disabled={disabled}
          onClick={() => {
            setShowAddProduct((v) => !v);
            setAddError(null);
          }}
        >
          <Plus size={14} strokeWidth={2} /> Add Product
        </AddProductButton>
      </SectionTitleRow>

      {isDraftMode && (
        <DraftHint>
          <SellableCounter $satisfied={draftHasSellable}>
            {draftHasSellable ? '1/1' : '0/1'} sellable required
          </SellableCounter>
          <span>
            Products are saved right after this plant is created.
            {!draftHasSellable &&
              " This plant needs at least one active sellable product — if you don't add one, it will be created automatically using the plant's name when you save."}
          </span>
        </DraftHint>
      )}

      {productActionError && <ErrorBanner>{productActionError}</ErrorBanner>}

      {showAddProduct && (
        <AddProductForm onSubmit={handleAddProduct}>
          <FieldGroup>
            <FieldLabel htmlFor="newProductName">Name *</FieldLabel>
            <ProductInput
              id="newProductName"
              type="text"
              placeholder="e.g., Green Capsicum"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              disabled={disabled || addProduct.isPending}
              autoFocus
            />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel htmlFor="newProductCategory">Category *</FieldLabel>
            <ProductSelect
              id="newProductCategory"
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value as ProductCategory)}
              disabled={disabled || addProduct.isPending}
            >
              {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </ProductSelect>
          </FieldGroup>
          <FieldGroup>
            <FieldLabel htmlFor="newProductUnit">Unit *</FieldLabel>
            <ProductSelect
              id="newProductUnit"
              value={addUnit}
              onChange={(e) => setAddUnit(e.target.value as ProductUnit)}
              disabled={disabled || addProduct.isPending}
            >
              {PRODUCT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </ProductSelect>
          </FieldGroup>
          <ProductFormActions>
            <RowButton type="submit" $variant="edit" disabled={disabled || addProduct.isPending}>
              <Check size={12} strokeWidth={1.8} /> {addProduct.isPending ? 'Adding…' : 'Add'}
            </RowButton>
            <RowButton
              type="button"
              onClick={() => {
                resetAddForm();
                setShowAddProduct(false);
              }}
              disabled={disabled || addProduct.isPending}
            >
              Cancel
            </RowButton>
          </ProductFormActions>
          {addError && <ErrorText role="alert">{addError}</ErrorText>}
        </AddProductForm>
      )}

      {isLoading && <LoadingText>Loading products…</LoadingText>}
      {!isLoading && loadError && <ErrorBanner>Failed to load products. Please try again.</ErrorBanner>}
      {!isLoading && !loadError && rows.length === 0 && (
        <EmptyText>No products yet. Click "Add Product" to define the first yield.</EmptyText>
      )}
      {!isLoading && rows.length > 0 && (
        <div>
          {rows.map((row) => {
            const isEditingThis = editingId === row.id;
            const isBusy =
              !row.isDraft &&
              ((updateProduct.isPending && updateProduct.variables?.productId === row.id) ||
                (deactivateProduct.isPending && deactivateProduct.variables?.productId === row.id));
            // Only meaningful for live, active rows — implies row.category
            // === 'sellable' since activeSellableIds only holds active
            // sellable productIds.
            const rowIsLastActiveSellable = !row.isDraft && row.isActive && isLastActiveSellable(row.id);

            return (
              <ProductRow key={row.id}>
                {isEditingThis ? (
                  <EditProductForm onSubmit={(e) => handleSaveEdit(row, e)}>
                    <ProductInput
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={disabled || updateProduct.isPending}
                      aria-label="Product name"
                      autoFocus
                    />
                    <ProductSelect
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as ProductCategory)}
                      disabled={disabled || updateProduct.isPending}
                      aria-label="Product category"
                    >
                      {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((cat) => (
                        <option key={cat} value={cat} disabled={rowIsLastActiveSellable && cat !== 'sellable'}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </ProductSelect>
                    <UnitTag>{row.unit} (fixed)</UnitTag>
                    <ProductFormActions>
                      <RowButton type="submit" $variant="edit" disabled={disabled || updateProduct.isPending}>
                        <Check size={12} strokeWidth={1.8} /> Save
                      </RowButton>
                      <RowButton type="button" onClick={handleCancelEdit} disabled={disabled || updateProduct.isPending}>
                        Cancel
                      </RowButton>
                    </ProductFormActions>
                    {rowIsLastActiveSellable && (
                      <LockedHint>
                        This is the only active sellable product — category is locked to keep at least one. Make
                        another product sellable first if you want to change this one.
                      </LockedHint>
                    )}
                    {editError && <ErrorText role="alert">{editError}</ErrorText>}
                  </EditProductForm>
                ) : (
                  <>
                    <ProductInfo>
                      <ProductName>{row.name}</ProductName>
                      <CategoryBadge $category={row.category}>{CATEGORY_LABELS[row.category]}</CategoryBadge>
                      <UnitTag>{row.unit}</UnitTag>
                      {!row.isActive && <InactiveTag>Inactive</InactiveTag>}
                    </ProductInfo>
                    <ProductRowActions>
                      <RowButton $variant="edit" onClick={() => handleStartEdit(row)} disabled={disabled || isBusy}>
                        <Pencil size={12} strokeWidth={1.6} /> Rename
                      </RowButton>
                      {row.isDraft ? (
                        <RowButton
                          $variant="delete"
                          type="button"
                          onClick={() => handleRemoveDraft(row.id)}
                          disabled={disabled}
                        >
                          <RemoveIcon size={12} strokeWidth={1.6} /> Remove
                        </RowButton>
                      ) : (
                        <RowButton
                          onClick={() => {
                            const product = (liveProducts || []).find((p) => p.productId === row.id);
                            if (product) handleToggleActive(product);
                          }}
                          disabled={disabled || isBusy || rowIsLastActiveSellable}
                          title={
                            rowIsLastActiveSellable
                              ? 'This is the only active sellable product — the plant must keep at least one. Make another product sellable first.'
                              : undefined
                          }
                        >
                          {row.isActive ? (
                            <>
                              <Power size={12} strokeWidth={1.6} /> Deactivate
                            </>
                          ) : (
                            <>
                              <RotateCcw size={12} strokeWidth={1.6} /> Reactivate
                            </>
                          )}
                        </RowButton>
                      )}
                    </ProductRowActions>
                  </>
                )}
              </ProductRow>
            );
          })}
        </div>
      )}
    </ProductsSection>
  );
}
