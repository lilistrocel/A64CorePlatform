/**
 * EditFarmModal Component
 *
 * Modal dialog for editing farm details including GPS coordinates.
 * Focuses on location fields needed for weather data integration.
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';
import type { Farm, FarmUpdate, Manager } from '../../types/farm';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const farmUpdateSchema = z.object({
  name: z.string().min(1, 'Farm name is required').max(100, 'Name too long'),
  owner: z.string().max(200, 'Owner name too long').optional().nullable(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  latitude: z.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude').optional().nullable(),
  longitude: z.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude').optional().nullable(),
  totalArea: z.number().min(0.1, 'Area must be greater than 0'),
  numberOfStaff: z.number().min(0, 'Number of staff must be 0 or greater').optional().nullable(),
  managerId: z.string().min(1, 'Manager is required'),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof farmUpdateSchema>;

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
`;

const Modal = styled.div`
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #616161;
  padding: 4px 8px;
  transition: color 150ms ease-in-out;

  &:hover {
    color: #212121;
  }
`;

const ModalBody = styled.div`
  padding: 24px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: #3B82F6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e0e0;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const Input = styled.input<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#EF4444' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#EF4444' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  transition: all 150ms ease-in-out;
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: #EF4444;
`;

const GridRow = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const CheckboxContainer = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 12px;
  border-radius: 8px;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
`;

const CheckboxLabel = styled.div`
  font-size: 14px;
  color: #212121;
`;

const ModalFooter = styled.div`
  padding: 24px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        &:hover:not(:disabled) {
          background: #1976d2;
        }
      `;
    }
    return `
      background: transparent;
      color: #616161;
      border: 1px solid #e0e0e0;
      &:hover:not(:disabled) {
        background: #f5f5f5;
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const CoordinatesHelp = styled.div`
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 8px;

  p {
    font-size: 13px;
    color: #1E40AF;
    margin: 0;
    line-height: 1.5;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export interface EditFarmModalProps {
  farm: Farm;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditFarmModal({ farm, isOpen, onClose, onSuccess }: EditFarmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [managersError, setManagersError] = useState<string | null>(null);

  // Get current latitude/longitude from farm location
  const getCurrentLatitude = (): number | null => {
    if (farm.location?.latitude !== undefined) return farm.location.latitude;
    if (farm.location?.coordinates?.latitude !== undefined) return farm.location.coordinates.latitude;
    if (farm.boundary?.center?.latitude !== undefined) return farm.boundary.center.latitude;
    return null;
  };

  const getCurrentLongitude = (): number | null => {
    if (farm.location?.longitude !== undefined) return farm.location.longitude;
    if (farm.location?.coordinates?.longitude !== undefined) return farm.location.coordinates.longitude;
    if (farm.boundary?.center?.longitude !== undefined) return farm.boundary.center.longitude;
    return null;
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(farmUpdateSchema),
    defaultValues: {
      name: farm.name,
      owner: farm.owner || '',
      city: farm.location?.city || '',
      state: farm.location?.state || '',
      country: farm.location?.country || '',
      latitude: getCurrentLatitude(),
      longitude: getCurrentLongitude(),
      totalArea: farm.totalArea,
      numberOfStaff: farm.numberOfStaff || 0,
      managerId: farm.managerId,
      isActive: farm.isActive,
    },
  });

  // Fetch managers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchManagers();
      // Reset form with current farm values
      reset({
        name: farm.name,
        owner: farm.owner || '',
        city: farm.location?.city || '',
        state: farm.location?.state || '',
        country: farm.location?.country || '',
        latitude: getCurrentLatitude(),
        longitude: getCurrentLongitude(),
        totalArea: farm.totalArea,
        numberOfStaff: farm.numberOfStaff || 0,
        managerId: farm.managerId,
        isActive: farm.isActive,
      });
    }
  }, [isOpen, farm]);

  const fetchManagers = async () => {
    try {
      setLoadingManagers(true);
      setManagersError(null);
      const response = await farmApi.getManagers();
      const managersData = response.data?.managers || [];
      setManagers(managersData);
    } catch (error) {
      console.error('Error fetching managers:', error);
      setManagersError('Failed to load managers. Please try again.');
      setManagers([]);
    } finally {
      setLoadingManagers(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      setSubmitting(true);

      const updateData: FarmUpdate = {
        name: data.name,
        owner: data.owner || undefined,
        location: {
          city: data.city,
          state: data.state,
          country: data.country,
          latitude: data.latitude ?? undefined,
          longitude: data.longitude ?? undefined,
        },
        totalArea: data.totalArea,
        numberOfStaff: data.numberOfStaff ?? undefined,
        managerId: data.managerId,
        isActive: data.isActive,
      };

      await farmApi.updateFarm(farm.farmId, updateData);

      showSuccessToast('Farm updated successfully');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error updating farm:', error);
      showErrorToast('Failed to update farm. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      reset();
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <Overlay $isOpen={isOpen} onClick={handleOverlayClick}>
      <Modal>
        <ModalHeader>
          <ModalTitle>Edit Farm</ModalTitle>
          <CloseButton onClick={handleClose} disabled={submitting}>
            ✕
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <Form onSubmit={handleSubmit(onSubmit)}>
            {/* Basic Information */}
            <SectionTitle>Basic Information</SectionTitle>

            <FormGroup>
              <Label htmlFor="name">Farm Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter farm name"
                $hasError={!!errors.name}
                disabled={submitting}
                {...register('name')}
              />
              {errors.name && <ErrorText>{errors.name.message}</ErrorText>}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                type="text"
                placeholder="Farm owner name"
                $hasError={!!errors.owner}
                disabled={submitting}
                {...register('owner')}
              />
              {errors.owner && <ErrorText>{errors.owner.message}</ErrorText>}
            </FormGroup>

            {/* Location Section */}
            <SectionTitle>Location</SectionTitle>

            <GridRow>
              <FormGroup>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  type="text"
                  placeholder="City"
                  $hasError={!!errors.city}
                  disabled={submitting}
                  {...register('city')}
                />
                {errors.city && <ErrorText>{errors.city.message}</ErrorText>}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="state">State/Province *</Label>
                <Input
                  id="state"
                  type="text"
                  placeholder="State"
                  $hasError={!!errors.state}
                  disabled={submitting}
                  {...register('state')}
                />
                {errors.state && <ErrorText>{errors.state.message}</ErrorText>}
              </FormGroup>
            </GridRow>

            <FormGroup>
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                type="text"
                placeholder="Country"
                $hasError={!!errors.country}
                disabled={submitting}
                {...register('country')}
              />
              {errors.country && <ErrorText>{errors.country.message}</ErrorText>}
            </FormGroup>

            {/* GPS Coordinates Section */}
            <SectionTitle>GPS Coordinates (for Weather Data)</SectionTitle>

            <GridRow>
              <FormGroup>
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="0.000001"
                  placeholder="e.g., 24.4539"
                  $hasError={!!errors.latitude}
                  disabled={submitting}
                  {...register('latitude', { valueAsNumber: true })}
                />
                {errors.latitude && <ErrorText>{errors.latitude.message}</ErrorText>}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  placeholder="e.g., 54.3773"
                  $hasError={!!errors.longitude}
                  disabled={submitting}
                  {...register('longitude', { valueAsNumber: true })}
                />
                {errors.longitude && <ErrorText>{errors.longitude.message}</ErrorText>}
              </FormGroup>
            </GridRow>

            <CoordinatesHelp>
              <p>
                GPS coordinates are required to display weather and agricultural data in the AgriData tab.
                You can find coordinates using Google Maps: right-click on your farm location and copy the coordinates.
              </p>
            </CoordinatesHelp>

            {/* Farm Details Section */}
            <SectionTitle>Farm Details</SectionTitle>

            <GridRow>
              <FormGroup>
                <Label htmlFor="totalArea">Total Area (hectares) *</Label>
                <Input
                  id="totalArea"
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  $hasError={!!errors.totalArea}
                  disabled={submitting}
                  {...register('totalArea', { valueAsNumber: true })}
                />
                {errors.totalArea && <ErrorText>{errors.totalArea.message}</ErrorText>}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="numberOfStaff">Number of Staff</Label>
                <Input
                  id="numberOfStaff"
                  type="number"
                  step="1"
                  placeholder="0"
                  $hasError={!!errors.numberOfStaff}
                  disabled={submitting}
                  {...register('numberOfStaff', { valueAsNumber: true })}
                />
                {errors.numberOfStaff && <ErrorText>{errors.numberOfStaff.message}</ErrorText>}
              </FormGroup>
            </GridRow>

            <FormGroup>
              <Label htmlFor="managerId">Farm Manager *</Label>
              {managersError && <ErrorText>{managersError}</ErrorText>}
              <Select
                id="managerId"
                $hasError={!!errors.managerId}
                disabled={submitting || loadingManagers}
                {...register('managerId')}
              >
                <option value="">
                  {loadingManagers ? 'Loading managers...' : 'Select a manager...'}
                </option>
                {managers.map((manager) => (
                  <option key={manager.userId} value={manager.userId}>
                    {manager.name} ({manager.email})
                  </option>
                ))}
              </Select>
              {errors.managerId && <ErrorText>{errors.managerId.message}</ErrorText>}
            </FormGroup>

            <FormGroup>
              <CheckboxContainer>
                <Checkbox
                  type="checkbox"
                  id="isActive"
                  disabled={submitting}
                  {...register('isActive')}
                />
                <CheckboxLabel>Mark farm as active</CheckboxLabel>
              </CheckboxContainer>
            </FormGroup>
          </Form>
        </ModalBody>

        <ModalFooter>
          <Button type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            $variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
}
