/**
 * PlantMotherFormModal Component
 *
 * Create/edit modal for a mother plant (product): plantName, scientificName,
 * plantType. The detailed cultivation fields still live on varieties
 * (PlantDataFormModal in variety mode), not here.
 *
 * CREATE mode only (`mother` prop omitted) also embeds ProductsEditor,
 * because create is the one moment a mother has nowhere else to get
 * products defined. There is no plantMotherId to POST to until the mother
 * exists, so ProductsEditor runs in its DRAFT mode (local state,
 * `draftProducts`/`setDraftProducts` below) until submit. On submit: the
 * mother is created first, then each draft product is POSTed to the new
 * mother's id in turn. The mother is never rolled back if a product POST
 * fails — the mother now exists regardless, and the modal switches
 * ProductsEditor to LIVE mode against it (so anything that *did* succeed is
 * visible) while listing which ones failed and why, so the user can retry
 * them right there instead of discovering a silent gap later.
 *
 * EDIT mode (`mother` prop set) does NOT render ProductsEditor — it's just
 * the small form over the mother's own three fields. Products on an
 * existing mother are managed exclusively via PlantMotherDetailModal's own
 * (live-mode) ProductsEditor, so there is exactly one place to do it rather
 * than two UIs offering subtly different behaviour for the same action.
 *
 * Pass `mother` to enter edit mode; omit it (or pass null) for create mode.
 * Modal closes ONLY via the X button, never on backdrop click (project rule).
 */

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { X } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { useCreatePlantMother, useUpdatePlantMother, useAddProduct } from '../../hooks/queries/usePlantMothers';
import { ProductsEditor, type DraftProduct } from './ProductsEditor';
import { Modal as ConfirmDialogShell } from '../genetics/Modal';
import { Button as ConfirmButton, Banner as ConfirmBanner, Hint as ConfirmHint } from '../genetics/styled';
import type { PlantMother, PlantTypeEnum } from '../../types/farm';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const motherSchema = z.object({
  plantName: z.string().min(1, 'Plant name is required').max(200, 'Name too long'),
  scientificName: z.string().optional(),
  plantType: z.enum(['crop', 'tree', 'herb', 'fruit', 'vegetable', 'ornamental', 'medicinal']),
});

type PlantMotherFormData = z.infer<typeof motherSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PlantMotherFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  mother?: PlantMother | null;
}

// ============================================================================
// STYLED COMPONENTS (mirrors PlantDataFormModal's Night Observatory recipe)
// ============================================================================

const Overlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
`;

// Modal closes only via the X button, never on backdrop click — unchanged
// project rule (see PlantDataFormModal's Overlay for the same convention).
// $wide: create mode only — the wider size exists purely to fit
// ProductsEditor; edit mode stays at the original compact width since it
// goes back to being just the three-field form (products are managed from
// PlantMotherDetailModal instead — see file header).
const Modal = styled.div<{ $wide?: boolean }>`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  max-width: ${({ $wide }) => ($wide ? '640px' : '480px')};
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const ModalTitle = styled.h2`
  font-size: 22px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const ModalSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 6px 0 0 0;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 6px;
  border-radius: 8px;
  transition: all 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    background: rgba(180, 200, 220, 0.07);
  }
`;

const ModalBody = styled.div`
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => $hasError && theme.colors.error};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => $hasError && theme.colors.error};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
`;

const ProductsDivider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.line};
  margin: 8px 0 20px 0;
`;

const ModalFooter = styled.div`
  padding: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`;

const SuccessMessage = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.successBg};
  color: ${({ theme }) => theme.colors.success};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
`;

const ErrorMessage = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
`;

const FooterActions = styled.div`
  display: flex;
  gap: 12px;
  margin-left: auto;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant, theme }) => {
    if ($variant === 'primary') {
      return `
        background: linear-gradient(145deg, ${theme.colors.secondary[300]}, ${theme.colors.secondary[500]});
        color: ${theme.colors.onAccent};
        font-weight: 700;
        &:hover:not(:disabled) {
          filter: brightness(1.05);
        }
      `;
    }
    return `
      background: ${theme.colors.glass.base};
      color: ${theme.colors.textPrimary};
      border: 1px solid ${theme.colors.glass.border};
      &:hover:not(:disabled) {
        background: ${theme.colors.glass.hi};
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PlantMotherFormModal({ isOpen, onClose, onSuccess, mother }: PlantMotherFormModalProps) {
  const isEdit = !!mother;
  const submittingRef = useRef(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create-flow products: the mother doesn't exist yet, so ProductsEditor
  // runs in draft mode against this local list (see the file header for the
  // full create-then-flush design). `createdMother` flips on once the
  // create POST succeeds — from that point ProductsEditor switches itself
  // to live mode against the real id, same as edit mode always is.
  const [draftProducts, setDraftProducts] = useState<DraftProduct[]>([]);
  const [createdMother, setCreatedMother] = useState<PlantMother | null>(null);
  const [productFailures, setProductFailures] = useState<{ name: string; error: string }[]>([]);
  const [flushingProducts, setFlushingProducts] = useState(false);

  // Server invariant (T-922 stage 3): every mother must always have at least
  // one ACTIVE sellable product. If the draft list has none — no products at
  // all, or only process/waste — the server auto-creates one named after the
  // mother on create. Rather than let that happen silently, submit is
  // intercepted here so the user is told before it happens; confirming
  // proceeds with the held-back form data, cancelling just closes the dialog
  // and leaves the form (and draft products) exactly as they were.
  const [showDefaultProductConfirm, setShowDefaultProductConfirm] = useState(false);
  const [pendingCreateData, setPendingCreateData] = useState<PlantMotherFormData | null>(null);

  const createMother = useCreatePlantMother();
  const updateMother = useUpdatePlantMother();
  const addProduct = useAddProduct();
  const submitting = createMother.isPending || updateMother.isPending || flushingProducts;

  // True once nothing left to submit for THIS modal session: edit mode
  // never reaches it (its form stays live/re-submittable), create mode
  // reaches it the instant the mother is created — never rolled back
  // regardless of whether any product POST subsequently failed.
  const createdThisSession = !isEdit && !!createdMother;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PlantMotherFormData>({
    resolver: zodResolver(motherSchema),
    defaultValues: {
      plantName: mother?.plantName || '',
      scientificName: mother?.scientificName || '',
      plantType: (mother?.plantType as PlantTypeEnum) || 'vegetable',
    },
  });

  const extractDetailMessage = (err: unknown, fallback: string): string => {
    const axiosError = err as { response?: { data?: { detail?: unknown } } };
    const detail = axiosError.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
  };

  // True when the draft list has no active sellable product — none at all,
  // or only process/waste. Mirrors the server invariant locally so the user
  // is told before the auto-create happens, not after (design doc: every
  // mother must always have >=1 active sellable product).
  const draftHasNoSellable = (): boolean => !draftProducts.some((p) => p.category === 'sellable');

  const onSubmit = async (data: PlantMotherFormData) => {
    if (submittingRef.current || createdThisSession) return;

    if (!isEdit && draftHasNoSellable()) {
      setPendingCreateData(data);
      setShowDefaultProductConfirm(true);
      return;
    }

    await submitMother(data);
  };

  const handleConfirmDefaultProduct = () => {
    setShowDefaultProductConfirm(false);
    const data = pendingCreateData;
    setPendingCreateData(null);
    if (data) void submitMother(data);
  };

  const handleCancelDefaultProduct = () => {
    setShowDefaultProductConfirm(false);
    setPendingCreateData(null);
  };

  const submitMother = async (data: PlantMotherFormData) => {
    submittingRef.current = true;
    setSuccessMessage(null);
    setErrorMessage(null);
    setProductFailures([]);

    try {
      if (isEdit && mother) {
        const updated = await updateMother.mutateAsync({
          motherId: mother.plantMotherId,
          data: {
            plantName: data.plantName,
            scientificName: data.scientificName,
            plantType: data.plantType,
          },
        });
        setSuccessMessage(`"${updated.plantName}" updated successfully!`);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1200);
      } else {
        const created = await createMother.mutateAsync({
          plantName: data.plantName,
          scientificName: data.scientificName,
          plantType: data.plantType,
        });
        setCreatedMother(created);

        // Mother now exists. POST each draft product to it in turn — not
        // Promise.all: keeps which-one-failed attribution unambiguous and
        // avoids a duplicate-name race between two of the user's own rows.
        // The mother is NEVER rolled back if some of these fail; any
        // failure is surfaced by name+reason and the editor below switches
        // to live mode so the user can see what did land and retry the rest.
        const failures: { name: string; error: string }[] = [];
        if (draftProducts.length > 0) {
          setFlushingProducts(true);
          for (const draft of draftProducts) {
            try {
              await addProduct.mutateAsync({
                motherId: created.plantMotherId,
                data: { name: draft.name, unit: draft.unit, category: draft.category },
              });
            } catch (err) {
              failures.push({ name: draft.name, error: extractDetailMessage(err, 'failed to add') });
            }
          }
          setFlushingProducts(false);
        }
        setDraftProducts([]);

        if (failures.length > 0) {
          setProductFailures(failures);
          setSuccessMessage(
            `"${created.plantName}" created — ${draftProducts.length - failures.length}/${draftProducts.length} products added.`
          );
          // Deliberately NOT auto-closing: the user must see which products
          // failed and gets a chance to retry them via the now-live editor.
        } else {
          setSuccessMessage(`"${created.plantName}" created successfully!`);
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 1200);
        }
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: unknown; message?: string } } };
      const detail = axiosError.response?.data?.detail;
      const errorMsg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: { loc?: string[]; msg?: string }) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
          : axiosError.response?.data?.message ||
            `Failed to ${isEdit ? 'update' : 'create'} plant. Please try again.`;
      setErrorMessage(errorMsg);
    } finally {
      submittingRef.current = false;
    }
  };

  const handleClose = () => {
    if (submitting) return;
    // Mother was created this session (with or without product failures) —
    // the caller's list must refresh even when dismissing via Cancel/X
    // rather than the auto-close path, since the mother is real either way.
    if (createdThisSession) {
      onSuccess?.();
    }
    if (!isEdit) reset();
    setSuccessMessage(null);
    setErrorMessage(null);
    setProductFailures([]);
    setDraftProducts([]);
    setCreatedMother(null);
    onClose();
  };

  // Reason: Overlay click intentionally NOT wired to onClose — data-entry
  // modal must close via X button only (project rule).
  return (
    <>
    <Overlay $isOpen={isOpen}>
      <Modal $wide={!isEdit}>
        <ModalHeader>
          <div>
            <ModalTitle>
              {isEdit
                ? `Edit Plant: ${mother!.plantName}`
                : createdMother
                  ? `Plant Created: ${createdMother.plantName}`
                  : 'Create New Plant'}
            </ModalTitle>
            <ModalSubtitle>
              {isEdit
                ? 'Renaming cascades to every variety and any block referencing this product.'
                : createdMother
                  ? 'Review the products below — retry anything that failed, then close.'
                  : 'A product/SKU that varieties (cultivation recipes) will belong to. Its products are saved right after you create it.'}
            </ModalSubtitle>
          </div>
          <CloseButton onClick={handleClose} disabled={submitting} aria-label="Close">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </ModalHeader>

        <Form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <FieldStack>
              <FormGroup>
                <Label htmlFor="motherPlantName">Plant Name *</Label>
                <Input
                  id="motherPlantName"
                  type="text"
                  placeholder="e.g., Tomato, Lettuce"
                  $hasError={!!errors.plantName}
                  disabled={submitting || createdThisSession}
                  {...register('plantName')}
                />
                {errors.plantName && <ErrorText>{errors.plantName.message}</ErrorText>}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="motherScientificName">Scientific Name (Optional)</Label>
                <Input
                  id="motherScientificName"
                  type="text"
                  placeholder="e.g., Solanum lycopersicum"
                  disabled={submitting || createdThisSession}
                  {...register('scientificName')}
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="motherPlantType">Plant Type *</Label>
                <Select
                  id="motherPlantType"
                  $hasError={!!errors.plantType}
                  disabled={submitting || createdThisSession}
                  {...register('plantType')}
                >
                  <option value="vegetable">Vegetable</option>
                  <option value="fruit">Fruit</option>
                  <option value="herb">Herb</option>
                  <option value="crop">Crop</option>
                  <option value="tree">Tree</option>
                  <option value="ornamental">Ornamental</option>
                  <option value="medicinal">Medicinal</option>
                </Select>
                {errors.plantType && <ErrorText>{errors.plantType.message}</ErrorText>}
              </FormGroup>
            </FieldStack>

            {/* Create mode only — see file header. Editing an existing
                mother's products happens exclusively in
                PlantMotherDetailModal, so this section never renders when
                `mother` is set. */}
            {!isEdit && (
              <>
                <ProductsDivider />
                <ProductsEditor
                  motherId={createdMother?.plantMotherId}
                  draftProducts={draftProducts}
                  onDraftProductsChange={setDraftProducts}
                  disabled={submitting}
                />
              </>
            )}
          </ModalBody>

          <ModalFooter>
            <div>
              {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
              {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
              {productFailures.length > 0 && (
                <ErrorMessage>
                  Could not add: {productFailures.map((f) => `"${f.name}" (${f.error})`).join(', ')} — add
                  {productFailures.length === 1 ? ' it' : ' them'} again above.
                </ErrorMessage>
              )}
            </div>

            <FooterActions>
              {createdThisSession ? (
                <Button type="button" $variant="primary" onClick={handleClose} disabled={submitting}>
                  {flushingProducts ? 'Adding products...' : 'Done'}
                </Button>
              ) : (
                <>
                  <Button type="button" onClick={handleClose} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" $variant="primary" disabled={submitting}>
                    {isEdit
                      ? submitting
                        ? 'Saving...'
                        : 'Save Changes'
                      : flushingProducts
                        ? 'Adding products...'
                        : submitting
                          ? 'Creating...'
                          : 'Create Plant'}
                  </Button>
                </>
              )}
            </FooterActions>
          </ModalFooter>
        </Form>
      </Modal>
    </Overlay>

    {/* Server invariant confirmation (T-922 stage 2/3): fires on save when
        the draft list has no active sellable product. Tells the user what
        will happen BEFORE it happens, naming the product and its category,
        rather than silently creating it and reporting afterwards. Uses the
        genetics Modal shell (already reused outside genetics/ — mushroom,
        protocols, tutorials) rather than a bespoke Overlay, since it already
        never closes on backdrop click and traps focus. Confirming proceeds
        with the held-back form data; cancelling just closes this dialog and
        returns to the form, which still has every field/draft product
        exactly as the user left it. */}
    {showDefaultProductConfirm && pendingCreateData && (
      <ConfirmDialogShell
        title="Create a default sellable product?"
        onClose={handleCancelDefaultProduct}
        footer={
          <>
            <ConfirmButton type="button" $variant="ghost" onClick={handleCancelDefaultProduct}>
              Go back
            </ConfirmButton>
            <ConfirmButton type="button" $variant="primary" onClick={handleConfirmDefaultProduct}>
              Create Plant
            </ConfirmButton>
          </>
        }
      >
        <ConfirmBanner $tone="warning">
          "{pendingCreateData.plantName}" has no sellable product yet, and every plant
          needs at least one so it can be tracked for harvest and sale. If you continue,
          the system will automatically create a sellable product named{' '}
          "{pendingCreateData.plantName}" (unit: kg).
        </ConfirmBanner>
        <ConfirmHint>
          You can rename it, add more products, or add a different sellable product
          yourself at any time after the plant is created.
        </ConfirmHint>
      </ConfirmDialogShell>
    )}
    </>
  );
}
