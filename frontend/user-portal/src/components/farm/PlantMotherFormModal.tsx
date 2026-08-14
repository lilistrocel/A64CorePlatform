/**
 * PlantMotherFormModal Component
 *
 * Small create/edit modal for a mother plant (product): plantName,
 * scientificName, plantType only — the detailed cultivation fields live on
 * varieties (PlantDataFormModal in variety mode), not here.
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
import { useCreatePlantMother, useUpdatePlantMother } from '../../hooks/queries/usePlantMothers';
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
const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  max-width: 480px;
  width: 100%;
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
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
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

  const createMother = useCreatePlantMother();
  const updateMother = useUpdatePlantMother();
  const submitting = createMother.isPending || updateMother.isPending;

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

  const onSubmit = async (data: PlantMotherFormData) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSuccessMessage(null);
    setErrorMessage(null);

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
      } else {
        const created = await createMother.mutateAsync({
          plantName: data.plantName,
          scientificName: data.scientificName,
          plantType: data.plantType,
        });
        setSuccessMessage(`"${created.plantName}" created successfully!`);
      }
      setTimeout(() => {
        if (!isEdit) reset();
        onSuccess?.();
        onClose();
      }, 1200);
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
    if (!submitting) {
      if (!isEdit) reset();
      setSuccessMessage(null);
      setErrorMessage(null);
      onClose();
    }
  };

  // Reason: Overlay click intentionally NOT wired to onClose — data-entry
  // modal must close via X button only (project rule).
  return (
    <Overlay $isOpen={isOpen}>
      <Modal>
        <ModalHeader>
          <div>
            <ModalTitle>{isEdit ? `Edit Plant: ${mother!.plantName}` : 'Create New Plant'}</ModalTitle>
            <ModalSubtitle>
              {isEdit
                ? 'Renaming cascades to every variety and any block referencing this product.'
                : 'A product/SKU that varieties (cultivation recipes) will belong to.'}
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
                  disabled={submitting}
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
                  disabled={submitting}
                  {...register('scientificName')}
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="motherPlantType">Plant Type *</Label>
                <Select
                  id="motherPlantType"
                  $hasError={!!errors.plantType}
                  disabled={submitting}
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
          </ModalBody>

          <ModalFooter>
            <div>
              {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
              {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
            </div>

            <FooterActions>
              <Button type="button" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" $variant="primary" disabled={submitting}>
                {isEdit ? (submitting ? 'Saving...' : 'Save Changes') : (submitting ? 'Creating...' : 'Create Plant')}
              </Button>
            </FooterActions>
          </ModalFooter>
        </Form>
      </Modal>
    </Overlay>
  );
}
