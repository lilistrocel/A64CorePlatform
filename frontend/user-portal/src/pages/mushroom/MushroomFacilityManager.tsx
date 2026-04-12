/**
 * MushroomFacilityManager
 *
 * Facility management page with:
 * - Cards for all facilities
 * - Create new facility button and inline modal form
 * - Click a facility to expand room list and substrate batches
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useFacilities, useCreateFacility } from '../../hooks/mushroom/useFacilityData';
import { useFacilityRooms, useCreateRoom } from '../../hooks/mushroom/useRoomData';
import { useFacilitySubstrates } from '../../hooks/mushroom/useSubstrateBatches';
import { FacilityCard } from '../../components/mushroom/FacilityCard';
import { GrowingRoomGrid } from '../../components/mushroom/GrowingRoomGrid';
import { RoomDetailsModal } from '../../components/mushroom/RoomDetailsModal';
import type {
  Facility,
  GrowingRoom,
  FacilityType,
  FacilityStatus,
  CreateFacilityPayload,
  CreateRoomPayload,
} from '../../types/mushroom';

// ============================================================================
// CREATE FACILITY FORM STATE
// ============================================================================

interface FacilityFormState {
  name: string;
  location: string;
  facilityType: FacilityType;
  status: FacilityStatus;
  description: string;
}

const defaultFacilityForm: FacilityFormState = {
  name: '',
  location: '',
  facilityType: 'indoor',
  status: 'active',
  description: '',
};

// ============================================================================
// MAIN PAGE
// ============================================================================

export function MushroomFacilityManager() {
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<GrowingRoom | null>(null);
  const [showCreateFacility, setShowCreateFacility] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [facilityForm, setFacilityForm] = useState<FacilityFormState>(defaultFacilityForm);
  const [roomForm, setRoomForm] = useState<CreateRoomPayload>({ roomCode: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: facilities = [], isLoading: facilitiesLoading } = useFacilities();
  const createFacility = useCreateFacility();

  const { data: facilityRooms = [], isLoading: roomsLoading } = useFacilityRooms(
    selectedFacility?.id
  );
  const { data: substrates = [] } = useFacilitySubstrates(selectedFacility?.id);
  const createRoom = useCreateRoom(selectedFacility?.id ?? '');

  const handleFacilitySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!facilityForm.name.trim()) {
      setFormError('Facility name is required.');
      return;
    }

    const payload: CreateFacilityPayload = {
      name: facilityForm.name.trim(),
      location: facilityForm.location.trim() || undefined,
      facilityType: facilityForm.facilityType,
      status: facilityForm.status,
      description: facilityForm.description.trim() || undefined,
    };

    try {
      await createFacility.mutateAsync(payload);
      setFacilityForm(defaultFacilityForm);
      setShowCreateFacility(false);
    } catch {
      // Error handled by global interceptor
    }
  };

  const handleRoomSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!roomForm.roomCode.trim()) {
      setFormError('Room code is required.');
      return;
    }
    if (!selectedFacility) return;

    try {
      await createRoom.mutateAsync({
        roomCode: roomForm.roomCode.trim(),
        name: roomForm.name?.trim() || undefined,
        notes: roomForm.notes?.trim() || undefined,
      });
      setRoomForm({ roomCode: '' });
      setShowCreateRoom(false);
    } catch {
      // Error handled by global interceptor
    }
  };

  return (
    <Container>
      {/* Header */}
      <PageHeader>
        <TitleSection>
          <PageTitle>Facility Manager</PageTitle>
          <PageSubtitle>
            Manage your growing facilities, rooms, and substrate batches
          </PageSubtitle>
        </TitleSection>
        <AddFacilityBtn onClick={() => setShowCreateFacility(true)}>
          + New Facility
        </AddFacilityBtn>
      </PageHeader>

      {/* Loading */}
      {facilitiesLoading && (
        <LoadingContainer>
          <Spinner />
          <LoadingText>Loading facilities...</LoadingText>
        </LoadingContainer>
      )}

      {/* Empty state */}
      {!facilitiesLoading && facilities.length === 0 && (
        <EmptyState>
          <EmptyIcon>🏭</EmptyIcon>
          <EmptyTitle>No Facilities Yet</EmptyTitle>
          <EmptyText>Create your first growing facility to get started.</EmptyText>
          <AddFacilityBtn onClick={() => setShowCreateFacility(true)}>
            + Create Facility
          </AddFacilityBtn>
        </EmptyState>
      )}

      {/* Facilities Grid */}
      {!facilitiesLoading && facilities.length > 0 && (
        <FacilitiesGrid>
          {facilities.map((facility) => (
            <FacilityCard
              key={facility.id}
              facility={facility}
              onClick={() =>
                setSelectedFacility(
                  selectedFacility?.id === facility.id ? null : facility
                )
              }
              selected={selectedFacility?.id === facility.id}
            />
          ))}
        </FacilitiesGrid>
      )}

      {/* Selected Facility Detail Panel */}
      {selectedFacility && (
        <DetailPanel>
          <DetailPanelHeader>
            <DetailPanelTitle>
              {selectedFacility.name}
            </DetailPanelTitle>
            <DetailActions>
              <AddRoomBtn onClick={() => setShowCreateRoom(true)}>
                + Add Room
              </AddRoomBtn>
              <CloseDetailBtn
                onClick={() => setSelectedFacility(null)}
                aria-label="Close facility detail"
              >
                &#10005;
              </CloseDetailBtn>
            </DetailActions>
          </DetailPanelHeader>

          {/* Rooms Section */}
          <DetailSection>
            <DetailSectionTitle>
              Rooms
              {roomsLoading && <InlineSpinner />}
            </DetailSectionTitle>

            {roomsLoading ? (
              <LoadingText>Loading rooms...</LoadingText>
            ) : (
              <GrowingRoomGrid
                rooms={facilityRooms}
                onRoomClick={setSelectedRoom}
              />
            )}
          </DetailSection>

          {/* Substrates Section */}
          {substrates.length > 0 && (
            <DetailSection>
              <DetailSectionTitle>Substrate Batches</DetailSectionTitle>
              <SubstrateList>
                {substrates.map((s) => (
                  <SubstrateRow key={s.id}>
                    <SubstrateBatchCode>{s.batchCode}</SubstrateBatchCode>
                    <SubstrateType>{s.substrateType.replace(/_/g, ' ')}</SubstrateType>
                    <SubstrateStatus $status={s.status}>{s.status}</SubstrateStatus>
                    {s.remainingWeightKg != null && (
                      <SubstrateWeight>
                        {s.remainingWeightKg.toFixed(1)} kg remaining
                      </SubstrateWeight>
                    )}
                  </SubstrateRow>
                ))}
              </SubstrateList>
            </DetailSection>
          )}
        </DetailPanel>
      )}

      {/* ── CREATE FACILITY MODAL ── */}
      {showCreateFacility && (
        <Backdrop onClick={() => setShowCreateFacility(false)} role="dialog" aria-modal="true">
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>New Growing Facility</ModalTitle>
              <CloseModalBtn
                onClick={() => setShowCreateFacility(false)}
                aria-label="Close create facility form"
              >
                &#10005;
              </CloseModalBtn>
            </ModalHeader>

            <Form onSubmit={handleFacilitySubmit} noValidate>
              <FormGroup>
                <Label htmlFor="fac-name">
                  Facility Name <Required>*</Required>
                </Label>
                <Input
                  id="fac-name"
                  type="text"
                  value={facilityForm.name}
                  onChange={(e) =>
                    setFacilityForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Main Grow House"
                  required
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="fac-location">Location</Label>
                <Input
                  id="fac-location"
                  type="text"
                  value={facilityForm.location}
                  onChange={(e) =>
                    setFacilityForm((p) => ({ ...p, location: e.target.value }))
                  }
                  placeholder="e.g. Building A, Section 2"
                />
              </FormGroup>

              <TwoColForm>
                <FormGroup>
                  <Label htmlFor="fac-type">Facility Type</Label>
                  <SelectField
                    id="fac-type"
                    value={facilityForm.facilityType}
                    onChange={(e) =>
                      setFacilityForm((p) => ({
                        ...p,
                        facilityType: e.target.value as FacilityType,
                      }))
                    }
                  >
                    <option value="indoor">Indoor</option>
                    <option value="greenhouse">Greenhouse</option>
                    <option value="outdoor">Outdoor</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="container">Container</option>
                    <option value="cave">Cave</option>
                  </SelectField>
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="fac-status">Status</Label>
                  <SelectField
                    id="fac-status"
                    value={facilityForm.status}
                    onChange={(e) =>
                      setFacilityForm((p) => ({
                        ...p,
                        status: e.target.value as FacilityStatus,
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="construction">Under Construction</option>
                  </SelectField>
                </FormGroup>
              </TwoColForm>

              <FormGroup>
                <Label htmlFor="fac-desc">Description</Label>
                <TextArea
                  id="fac-desc"
                  rows={2}
                  value={facilityForm.description}
                  onChange={(e) =>
                    setFacilityForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Optional description..."
                />
              </FormGroup>

              {formError && <FormError role="alert">{formError}</FormError>}

              <FormActions>
                <CancelBtn type="button" onClick={() => setShowCreateFacility(false)}>
                  Cancel
                </CancelBtn>
                <SubmitBtn type="submit" disabled={createFacility.isPending}>
                  {createFacility.isPending ? 'Creating...' : 'Create Facility'}
                </SubmitBtn>
              </FormActions>
            </Form>
          </ModalBox>
        </Backdrop>
      )}

      {/* ── CREATE ROOM MODAL ── */}
      {showCreateRoom && selectedFacility && (
        <Backdrop onClick={() => setShowCreateRoom(false)} role="dialog" aria-modal="true">
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Add Room to {selectedFacility.name}</ModalTitle>
              <CloseModalBtn
                onClick={() => setShowCreateRoom(false)}
                aria-label="Close add room form"
              >
                &#10005;
              </CloseModalBtn>
            </ModalHeader>

            <Form onSubmit={handleRoomSubmit} noValidate>
              <FormGroup>
                <Label htmlFor="room-code">
                  Room Code <Required>*</Required>
                </Label>
                <Input
                  id="room-code"
                  type="text"
                  value={roomForm.roomCode}
                  onChange={(e) =>
                    setRoomForm((p) => ({ ...p, roomCode: e.target.value }))
                  }
                  placeholder="e.g. A1, B3, ROOM-01"
                  required
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="room-name">Room Name (optional)</Label>
                <Input
                  id="room-name"
                  type="text"
                  value={roomForm.name ?? ''}
                  onChange={(e) =>
                    setRoomForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Fruiting Chamber Alpha"
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="room-notes">Notes (optional)</Label>
                <TextArea
                  id="room-notes"
                  rows={2}
                  value={roomForm.notes ?? ''}
                  onChange={(e) =>
                    setRoomForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  placeholder="Any additional notes..."
                />
              </FormGroup>

              {formError && <FormError role="alert">{formError}</FormError>}

              <FormActions>
                <CancelBtn type="button" onClick={() => setShowCreateRoom(false)}>
                  Cancel
                </CancelBtn>
                <SubmitBtn type="submit" disabled={createRoom.isPending}>
                  {createRoom.isPending ? 'Adding...' : 'Add Room'}
                </SubmitBtn>
              </FormActions>
            </Form>
          </ModalBox>
        </Backdrop>
      )}

      {/* Room Details Modal */}
      {selectedRoom && (
        <RoomDetailsModal
          isOpen={!!selectedRoom}
          room={selectedRoom}
          facilityId={selectedRoom.facilityId}
          onClose={() => setSelectedRoom(null)}
        />
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 24px;
  max-width: 100%;
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.surface};
`;

const PageHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
`;

const TitleSection = styled.div``;

const PageTitle = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const PageSubtitle = styled.p`
  font-size: 14px;
  color: #757575;
  margin: 0;
`;

const AddFacilityBtn = styled.button`
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  background: #10B981;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms;
  white-space: nowrap;

  &:hover {
    background: #059669;
  }
  &:focus-visible {
    outline: 2px solid #10B981;
    outline-offset: 2px;
  }
`;

const FacilitiesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const DetailPanel = styled.section`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border: 2px solid #e3f2fd;
  margin-top: 8px;
`;

const DetailPanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
`;

const DetailPanelTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const DetailActions = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const AddRoomBtn = styled.button`
  padding: 8px 14px;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: #3b82f6;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: #dbeafe;
  }
  &:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
`;

const CloseDetailBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textDisabled};
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
  }
`;

const DetailSection = styled.div`
  margin-bottom: 20px;
`;

const DetailSectionTitle = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const InlineSpinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const SubstrateList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SubstrateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-wrap: wrap;
`;

const SubstrateBatchCode = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 80px;
`;

const SubstrateType = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
  flex: 1;
`;

interface SubstrateStatusProps {
  $status: string;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  ready: '#10B981',
  colonizing: '#F59E0B',
  sterilizing: '#3B82F6',
  mixing: '#8B5CF6',
  depleted: '#9E9E9E',
  discarded: '#EF4444',
  inoculating: '#6366F1',
};

const SubstrateStatus = styled.span<SubstrateStatusProps>`
  font-size: 11px;
  font-weight: 600;
  color: white;
  background: ${({ $status }) => STATUS_COLOR_MAP[$status] ?? '#9e9e9e'};
  border-radius: 20px;
  padding: 2px 8px;
  text-transform: capitalize;
`;

const SubstrateWeight = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

// Shared form elements
const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 12px;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
  max-width: 480px;
  margin: 48px auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`;

const EmptyIcon = styled.div`
  font-size: 56px;
  opacity: 0.6;
`;

const EmptyTitle = styled.h3`
  font-size: 22px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const EmptyText = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

// Modal styles
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const ModalTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseModalBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const TwoColForm = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Required = styled.span`
  color: #ef5350;
  margin-left: 2px;
`;

const Input = styled.input`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const SelectField = styled.select`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  cursor: pointer;
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const TextArea = styled.textarea`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const FormError = styled.div`
  font-size: 13px;
  color: #ef5350;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
`;

const FormActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

const CancelBtn = styled.button`
  padding: 10px 20px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
  }
`;

const SubmitBtn = styled.button`
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #10B981;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms;

  &:hover:not(:disabled) {
    background: #059669;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid #10B981;
    outline-offset: 2px;
  }
`;
