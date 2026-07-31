/**
 * CreateFarmModal Component
 *
 * Modal dialog for creating a new farm with optional geo-fencing boundary.
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import maplibregl from 'maplibre-gl';
import { X, Map as MapIconGlyph } from 'lucide-react';
import { glassPanel, glassControl, glassOpaque, monoLabel } from '@a64core/shared';
import { farmApi } from '../../services/farmApi';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';
import type { CreateFarmFormData, Manager, GeoJSONPolygon, FarmBoundary } from '../../types/farm';
import { useMapDrawing } from '../../hooks/map/useMapDrawing';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  LOCATIONS,
  OTHER_VALUE,
  getStatesForCountry,
} from '../../data/locations';

// Lazy load map components for better performance
const MapContainer = lazy(() => import('../map/MapContainer').then(m => ({ default: m.MapContainer })));
const DrawingControls = lazy(() => import('../map/DrawingControls').then(m => ({ default: m.DrawingControls })));

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const farmSchema = z.object({
  name: z.string().min(1, 'Farm name is required').max(100, 'Name too long'),
  owner: z.string().max(200, 'Owner name too long').optional(),
  state: z.string().min(1, 'State/Province is required'),
  country: z.string().min(1, 'Country is required'),
  totalArea: z.preprocess(
    (val) => (val === '' || val === undefined || Number.isNaN(Number(val)) ? undefined : Number(val)),
    z.number({ required_error: 'Area is required', invalid_type_error: 'Area must be a valid number' })
      .gt(0, 'Area must be greater than 0')
  ),
  numberOfStaff: z.preprocess(
    (val) => (val === '' || val === undefined || Number.isNaN(Number(val)) ? undefined : Number(val)),
    z.number({ invalid_type_error: 'Must be a valid number' })
      .min(0, 'Number of staff must be 0 or greater')
      .optional()
  ),
  managerId: z.string().min(1, 'Manager ID is required'),
  isActive: z.boolean(),
});

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface CreateFarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers").
const Overlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: 16px;
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 4px 8px;
  border-radius: 8px;
  display: flex;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
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

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  ${monoLabel}
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.glass.border)};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.secondary[500])};
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
  transition: all 150ms ease-in-out;
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.glass.border)};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
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
  border-radius: 10px;
  transition: background 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.secondary[500]};
`;

const CheckboxLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Map Section Styles
const MapSection = styled.div`
  margin-top: 8px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
  overflow: hidden;
`;

const MapToggleButton = styled.button<{ $active: boolean }>`
  ${glassControl}
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  width: 100%;
  border-color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.glass.border)};
  color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.textPrimary)};
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  svg {
    flex-shrink: 0;
  }
`;

// A map placeholder sitting inside an already-glass Modal — two-glass-layer
// rule (spec §2) — drops to glassOpaque rather than stacking a third layer.
const MapLoadingFallback = styled.div`
  ${glassOpaque}
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

const MapHint = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 8px 0 0 0;
`;

const MapIcon = () => <MapIconGlyph size={20} strokeWidth={1.8} />;

const ModalFooter = styled.div`
  padding: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

// Primary: the one gold-gradient CTA on this view (spec §3). Secondary: glass
// ghost text (spec §4 "Buttons").
const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
  border: 1px solid transparent;

  ${({ $variant, theme }) => {
    if ($variant === 'primary') {
      return `
        background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
        color: ${theme.colors.onAccent};
        box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
        &:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.celeste};
      border-color: ${theme.colors.glass.border};
      &:hover:not(:disabled) {
        background: rgba(180, 200, 220, 0.07);
        color: ${theme.colors.textPrimary};
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function CreateFarmModal({ isOpen, onClose, onSuccess }: CreateFarmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [managersError, setManagersError] = useState<string | null>(null);

  // Map-related state
  const [showMap, setShowMap] = useState(false);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const { polygon, areaHectares, setPolygon, clearPolygon, getBoundary } = useMapDrawing();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setValue,
    watch,
  } = useForm<CreateFarmFormData>({
    resolver: zodResolver(farmSchema),
    defaultValues: {
      isActive: true,
      country: 'UAE',
      state: '',
    },
  });

  // Watch location fields to drive cascading dropdown state
  const watchedCountry = watch('country');
  const watchedState = watch('state');
  // Local state for "Other" free-text fallback inputs
  const [countryOtherText, setCountryOtherText] = useState('');
  const [stateOtherText, setStateOtherText] = useState('');

  // Warn user on page refresh if form has unsaved changes
  useUnsavedChanges(isOpen && isDirty);

  // Watch totalArea to sync with polygon
  const watchedTotalArea = watch('totalArea');

  // Derived list for cascading dropdown
  const availableStates = getStatesForCountry(watchedCountry ?? '');

  /**
   * When country changes, reset state and city selections.
   * If the new country is "Other" we also store the text in the form value.
   */
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

  // Handle polygon change from drawing controls
  const handlePolygonChange = useCallback((newPolygon: GeoJSONPolygon | null, areaSquareMeters: number) => {
    setPolygon(newPolygon, areaSquareMeters);
    // Auto-update totalArea if polygon is drawn
    if (newPolygon && areaSquareMeters > 0) {
      const hectares = areaSquareMeters / 10000;
      setValue('totalArea', Number(hectares.toFixed(2)));
    }
  }, [setPolygon, setValue]);

  // Fetch managers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchManagers();
    }
  }, [isOpen]);

  const fetchManagers = async () => {
    try {
      setLoadingManagers(true);
      setManagersError(null);
      const response = await farmApi.getManagers();
      // Response structure: { data: { managers: [...] }, message: "..." }
      // apiClient.get() returns response.data, so we access it as response.data.managers
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

  const onSubmit = async (data: CreateFarmFormData) => {
    // Synchronous ref guard prevents concurrent submissions
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setSubmitting(true);

      // Get boundary if polygon was drawn
      const boundary = getBoundary();

      await farmApi.createFarm({
        name: data.name,
        owner: data.owner,
        location: {
          city: data.state,
          state: data.state,
          country: data.country,
        },
        totalArea: data.totalArea,
        numberOfStaff: data.numberOfStaff,
        managerId: data.managerId,
        isActive: data.isActive,
        boundary: boundary || undefined,
      });

      // Reset form and map state
      reset();
      clearPolygon();
      setShowMap(false);
      setCountryOtherText('');
      setStateOtherText('');
      showSuccessToast('Farm created successfully');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error creating farm:', error);
      showErrorToast('Failed to create farm. Please try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      submittingRef.current = false;
      reset();
      clearPolygon();
      setShowMap(false);
      setCountryOtherText('');
      setStateOtherText('');
      onClose();
    }
  };

  return (
    <Overlay $isOpen={isOpen}>
      <Modal>
        <ModalHeader>
          <ModalTitle>Create New Farm</ModalTitle>
          <CloseButton onClick={handleClose} disabled={submitting} aria-label="Close modal">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <Form onSubmit={handleSubmit(onSubmit)}>
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

            {/* Map Boundary Section */}
            <FormGroup>
              <Label>Farm Boundary (Optional)</Label>
              <MapToggleButton
                type="button"
                $active={showMap}
                onClick={() => setShowMap(!showMap)}
                disabled={submitting}
              >
                <MapIcon />
                {showMap ? 'Hide Map' : 'Draw Farm Boundary on Map'}
              </MapToggleButton>

              {showMap && (
                <MapSection>
                  <Suspense fallback={<MapLoadingFallback>Loading map...</MapLoadingFallback>}>
                    <MapContainer
                      height="400px"
                      onMapRef={setMapInstance}
                      showFullscreen={true}
                    >
                      <DrawingControls
                        map={mapInstance}
                        onPolygonChange={handlePolygonChange}
                        disabled={submitting}
                      />
                    </MapContainer>
                  </Suspense>
                </MapSection>
              )}
              <MapHint>
                {polygon
                  ? `Boundary drawn: ${areaHectares.toFixed(2)} hectares`
                  : 'You can optionally draw the farm boundary on a satellite map'}
              </MapHint>
            </FormGroup>

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
            {submitting ? 'Creating...' : 'Create Farm'}
          </Button>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
}
