/**
 * EditFarmModal Component
 *
 * Modal dialog for editing farm details including GPS coordinates.
 * Focuses on location fields needed for weather data integration.
 */

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import { useUpdateFarm } from '../../hooks/queries/useFarms';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';
import type { Farm, FarmUpdate, Manager } from '../../types/farm';
import {
  LOCATIONS,
  OTHER_VALUE,
  getStatesForCountry,
  resolveDropdownValue,
} from '../../data/locations';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const farmUpdateSchema = z.object({
  name: z.string().min(1, 'Farm name is required').max(100, 'Name too long'),
  owner: z.string().max(200, 'Owner name too long').optional().nullable(),
  state: z.string().min(1, 'State/Province is required'),
  country: z.string().min(1, 'Country is required'),
  latitude: z.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude').optional().nullable(),
  longitude: z.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude').optional().nullable(),
  totalArea: z.preprocess(
    (val) => (val === '' || val === undefined || val === null || Number.isNaN(Number(val)) ? undefined : Number(val)),
    z.number({ required_error: 'Area is required', invalid_type_error: 'Area must be a valid number' })
      .gt(0, 'Area must be greater than 0')
  ),
  numberOfStaff: z.preprocess(
    (val) => (val === '' || val === undefined || val === null || Number.isNaN(Number(val)) ? undefined : Number(val)),
    z.number({ invalid_type_error: 'Must be a valid number' })
      .min(0, 'Number of staff must be 0 or greater')
      .optional()
      .nullable()
  ),
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
  background: ${({ theme }) => theme.colors.background};
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px 8px;
  transition: color 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
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
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 8px;
  font-size: 14px;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 8px;
  font-size: 14px;
  transition: all 150ms ease-in-out;
  background: ${({ theme }) => theme.colors.background};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
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
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
`;

const CheckboxLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ModalFooter = styled.div`
  padding: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
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

  ${({ $variant, theme }) => {
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
      color: ${theme.colors.textSecondary};
      border: 1px solid ${theme.colors.neutral[300]};
      &:hover:not(:disabled) {
        background: ${theme.colors.surface};
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
  const submittingRef = useRef(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [managersError, setManagersError] = useState<string | null>(null);

  // Use mutation hook for proper cache invalidation
  const updateFarmMutation = useUpdateFarm();

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

  // ---- Location dropdown helpers ----
  // Resolve the initial dropdown values: known values are used directly,
  // unknown values map to "Other" so the free-text fallback is pre-shown.
  const knownCountryValues = LOCATIONS.map((c) => c.value);
  const initialCountryDropdown = resolveDropdownValue(knownCountryValues, farm.location?.country);
  const initialStateDropdown = resolveDropdownValue(
    getStatesForCountry(initialCountryDropdown).map((s) => s.value),
    farm.location?.state,
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(farmUpdateSchema),
    defaultValues: {
      name: farm.name,
      owner: farm.owner || '',
      // Store the raw string as the form value; dropdowns will read it via watch
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

  // Watch location fields to drive cascading dropdown state
  const watchedCountry = watch('country');
  const watchedState = watch('state');
  // "Other" free-text fallback values — initialised from existing farm data
  // when the stored value is not in our known lists.
  const [countryOtherText, setCountryOtherText] = useState<string>(
    initialCountryDropdown === OTHER_VALUE ? (farm.location?.country ?? '') : '',
  );
  const [stateOtherText, setStateOtherText] = useState<string>(
    initialStateDropdown === OTHER_VALUE ? (farm.location?.state ?? '') : '',
  );

  // Fetch managers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchManagers();

      // Re-resolve location dropdown values from the (potentially changed) farm prop
      const freshKnownCountries = LOCATIONS.map((c) => c.value);
      const freshCountryDropdown = resolveDropdownValue(freshKnownCountries, farm.location?.country);
      const freshStateDropdown = resolveDropdownValue(
        getStatesForCountry(freshCountryDropdown).map((s) => s.value),
        farm.location?.state,
      );

      // Pre-fill "Other" text boxes if the stored value is not in the known lists
      setCountryOtherText(freshCountryDropdown === OTHER_VALUE ? (farm.location?.country ?? '') : '');
      setStateOtherText(freshStateDropdown === OTHER_VALUE ? (farm.location?.state ?? '') : '');

      // Reset form with current farm values (raw strings, selects derive display from watch)
      reset({
        name: farm.name,
        owner: farm.owner || '',
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

  // Derived list for cascading dropdown
  const availableStates = getStatesForCountry(watchedCountry ?? '');

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value;
    setValue('country', newCountry === OTHER_VALUE ? countryOtherText || OTHER_VALUE : newCountry);
    setValue('state', '');
    setStateOtherText('');
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    setValue('state', newState === OTHER_VALUE ? stateOtherText || OTHER_VALUE : newState);
  };

  const onSubmit = async (data: FormData) => {
    // Synchronous ref guard prevents concurrent submissions (double-click protection)
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setSubmitting(true);

      const updateData: FarmUpdate = {
        name: data.name,
        owner: data.owner || undefined,
        location: {
          city: data.state,
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

      await updateFarmMutation.mutateAsync({ farmId: farm.farmId, data: updateData });

      showSuccessToast('Farm updated successfully');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error updating farm:', error);
      showErrorToast('Failed to update farm. Please try again.');
    } finally {
      submittingRef.current = false;
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

            {/* Country → State → City cascading dropdowns */}
            <FormGroup>
              <Label htmlFor="country">Country *</Label>
              <Select
                id="country"
                $hasError={!!errors.country}
                disabled={submitting}
                value={watchedCountry === OTHER_VALUE ? OTHER_VALUE : (watchedCountry ?? '')}
                onChange={handleCountryChange}
              >
                <option value="">Select a country...</option>
                {LOCATIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              {watchedCountry === OTHER_VALUE && (
                <Input
                  type="text"
                  placeholder="Enter country name"
                  value={countryOtherText}
                  $hasError={!!errors.country}
                  disabled={submitting}
                  onChange={(e) => {
                    setCountryOtherText(e.target.value);
                    setValue('country', e.target.value);
                  }}
                />
              )}
              {errors.country && <ErrorText>{errors.country.message}</ErrorText>}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="state">State/Province *</Label>
              <Select
                id="state"
                $hasError={!!errors.state}
                disabled={submitting || !watchedCountry || watchedCountry === OTHER_VALUE}
                value={watchedState === OTHER_VALUE ? OTHER_VALUE : (watchedState ?? '')}
                onChange={handleStateChange}
              >
                <option value="">
                  {!watchedCountry || watchedCountry === OTHER_VALUE
                    ? 'Select a country first'
                    : 'Select a state/province...'}
                </option>
                {availableStates.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              {watchedState === OTHER_VALUE && (
                <Input
                  type="text"
                  placeholder="Enter state/province name"
                  value={stateOtherText}
                  $hasError={!!errors.state}
                  disabled={submitting}
                  onChange={(e) => {
                    setStateOtherText(e.target.value);
                    setValue('state', e.target.value);
                  }}
                />
              )}
              {errors.state && <ErrorText>{errors.state.message}</ErrorText>}
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
