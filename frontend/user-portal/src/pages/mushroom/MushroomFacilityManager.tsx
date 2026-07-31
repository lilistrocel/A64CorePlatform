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
import { Factory, Plus, X } from 'lucide-react';
import type { PhaseKey } from '@a64core/shared';
import { PageHeader as SharedPageHeader, glassPanel, glassOpaque, monoLabel, phaseBadge } from '@a64core/shared';
import { HelpButton } from '../../components/tutorials/HelpButton';
import { useFacilities, useCreateFacility } from '../../hooks/mushroom/useFacilityData';
import { useFacilityRooms, useCreateRoom } from '../../hooks/mushroom/useRoomData';
import { useDeleteFacility } from '../../hooks/mushroom/useFacilityData';
import { useRoomOccupancy } from '../../hooks/genetics/useGenetics';
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
  RoomType,
  SubstrateStatus as SubstrateStatusType,
} from '../../types/mushroom';
import {
  ROOM_TYPE_LABELS,
  isBatchRoom,
} from '../../types/mushroom';

// Substrate batch status mirrors the room-phase lifecycle closely enough to
// extrapolate directly onto it (spec §5.2) rather than inventing a parallel
// vocabulary — several names even match literally (colonizing, inoculating).
const SUBSTRATE_STATUS_TO_PHASE: Record<SubstrateStatusType, PhaseKey> = {
  mixing: 'preparing',
  sterilizing: 'cleaning',
  inoculating: 'inoculated',
  colonizing: 'colonizing',
  ready: 'fruiting',
  depleted: 'resting',
  discarded: 'quarantined',
};

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
  const [roomForm, setRoomForm] = useState<CreateRoomPayload>({ roomCode: '', roomType: 'lab' });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: facilities = [], isLoading: facilitiesLoading } = useFacilities();
  const createFacility = useCreateFacility();

  const { data: facilityRooms = [], isLoading: roomsLoading } = useFacilityRooms(
    selectedFacility?.id
  );
  const { data: substrates = [] } = useFacilitySubstrates(selectedFacility?.id);
  const createRoom = useCreateRoom(selectedFacility?.id ?? '');
  // What is physically held in each room, from the genetics repo — one request
  // annotates every room rather than one per room.
  const { data: roomOccupancy } = useRoomOccupancy(selectedFacility?.id);
  const deleteFacility = useDeleteFacility();

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
        roomType: roomForm.roomType ?? 'lab',
        name: roomForm.name?.trim() || undefined,
        notes: roomForm.notes?.trim() || undefined,
      });
      setRoomForm({ roomCode: '', roomType: 'lab' });
      setShowCreateRoom(false);
    } catch {
      // Error handled by global interceptor
    }
  };

  return (
    <Container>
      {/* Header */}
      <HeaderRow>
        <SharedPageHeader
          breadcrumb="Operations · Live"
          title="Facility Manager"
          emphasizeLastWord
          description="Manage your growing facilities, rooms, and substrate batches"
        />
        <HelpButton topic="mushroom.facilities" />
        <AddFacilityBtn onClick={() => setShowCreateFacility(true)}>
          <Plus size={15} strokeWidth={2} /> New Facility
        </AddFacilityBtn>
      </HeaderRow>

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
          <EmptyIcon><Factory size={40} strokeWidth={1.4} /></EmptyIcon>
          <EmptyTitle>No facilities yet</EmptyTitle>
          <EmptyText>Create your first growing facility to get started.</EmptyText>
          <AddFacilityBtn onClick={() => setShowCreateFacility(true)}>
            <Plus size={15} strokeWidth={2} /> Create Facility
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
              {/* Refused server-side while the facility still holds rooms or
                  substrate batches, so emptying it runs each room's own
                  dependency check rather than cascading past them. */}
              <DeleteFacilityBtn
                onClick={async () => {
                  try {
                    await deleteFacility.mutateAsync(selectedFacility.id);
                    setSelectedFacility(null);
                  } catch {
                    // The 409 explains what is still inside; the global
                    // interceptor surfaces it as a toast.
                  }
                }}
                disabled={deleteFacility.isPending}
                title="Delete this facility (only when empty)"
              >
                {deleteFacility.isPending ? 'Deleting…' : 'Delete'}
              </DeleteFacilityBtn>
              <CloseDetailBtn
                onClick={() => setSelectedFacility(null)}
                aria-label="Close facility detail"
              >
                <X size={16} strokeWidth={2} />
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
                occupancy={roomOccupancy}
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
        <Backdrop role="dialog" aria-modal="true">
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>New Growing Facility</ModalTitle>
              <CloseModalBtn
                onClick={() => setShowCreateFacility(false)}
                aria-label="Close create facility form"
              >
                <X size={16} strokeWidth={2} />
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
        <Backdrop role="dialog" aria-modal="true">
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Add Room to {selectedFacility.name}</ModalTitle>
              <CloseModalBtn
                onClick={() => setShowCreateRoom(false)}
                aria-label="Close add room form"
              >
                <X size={16} strokeWidth={2} />
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
                <Label htmlFor="room-type">
                  Room Type <Required>*</Required>
                </Label>
                <Select
                  id="room-type"
                  value={roomForm.roomType ?? 'lab'}
                  onChange={(e) =>
                    setRoomForm((p) => ({ ...p, roomType: e.target.value as RoomType }))
                  }
                >
                  {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((rt) => (
                    <option key={rt} value={rt}>
                      {ROOM_TYPE_LABELS[rt]}
                    </option>
                  ))}
                </Select>
                <FieldHint>
                  {isBatchRoom(roomForm.roomType)
                    ? 'Runs one crop at a time through the full phase lifecycle.'
                    : 'A container — holds many independently tracked items (dishes, jars, blocks) at once, so it has no crop phase of its own.'}
                </FieldHint>
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

// Transparent page container — the fixed sky shows through (spec §7).
const Container = styled.div`
  padding: 34px 40px 60px;
  max-width: 100%;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 24px;
`;

// Reused in two places at once (header + empty state) — kept as a glass
// secondary control rather than the gold primary CTA so a screen never shows
// two gold buttons for the same action at once (spec §3 one-CTA budget).
const AddFacilityBtn = styled.button`
  ${glassOpaque}
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  border-radius: 11px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms;
  white-space: nowrap;
  margin-top: 2px;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const FacilitiesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
  margin-bottom: 24px;
`;

const DetailPanel = styled.section`
  ${glassPanel}
  padding: 20px;
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
  font-size: 1.2rem;
  font-weight: 800;
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
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const CloseDetailBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 6px;
  border-radius: 8px;
  transition: all 150ms;

  &:hover {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
  }
`;

const DetailSection = styled.div`
  margin-bottom: 20px;
`;

const DetailSectionTitle = styled.h3`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const InlineSpinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
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
  background: ${({ theme }) => theme.colors.glass.base};
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  flex-wrap: wrap;
`;

const SubstrateBatchCode = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 80px;
`;

const SubstrateType = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: capitalize;
  flex: 1;
`;

// Substrate status routes through the phase map (SUBSTRATE_STATUS_TO_PHASE
// above) via the standard badge pattern — same vocabulary as room phases.
const SubstrateStatus = styled.span<{ $status: SubstrateStatusType }>`
  ${({ $status }) => phaseBadge(SUBSTRATE_STATUS_TO_PHASE[$status])}
`;

const SubstrateWeight = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
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
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
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

// Empty state — Fraunces italic celeste headline, muted sentence, one
// primary button (spec §4 "Empty states"). No dashed box, no emoji.
const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  max-width: 480px;
  margin: 48px auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`;

const EmptyIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
  opacity: 0.7;
  margin-bottom: 4px;
`;

const EmptyTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.4rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
`;

const EmptyText = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

// Modal styles — glassPanel at blur 24px over an rgba(10,14,36,.6) scrim,
// 20px radius (spec §4 "Modals/drawers").
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
`;

const ModalBox = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
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
  font-size: 1.3rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseModalBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 6px;
  border-radius: 8px;
  transition: background 150ms, color 150ms;

  &:hover {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
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
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
`;

const Input = styled.input`
  ${glassOpaque}
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  transition: border-color 150ms;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const SelectField = styled.select`
  ${glassOpaque}
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// Destructive: coral-tinted glass, never solid red (spec §4 "Buttons").
const DeleteFacilityBtn = styled.button`
  padding: 8px 14px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    background: ${({ theme }) => theme.colors.errorBg};
    border-color: ${({ theme }) => theme.colors.error};
    color: ${({ theme }) => theme.colors.error};
  }
`;

const Select = styled.select`
  ${glassOpaque}
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FieldHint = styled.span`
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`;

const TextArea = styled.textarea`
  ${glassOpaque}
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 150ms;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FormError = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error}66;
  border-radius: 10px;
  padding: 10px 12px;
`;

const FormActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

const CancelBtn = styled.button`
  padding: 10px 20px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

// The modal's one primary CTA — gold gradient fill (spec §3/§4 "Buttons").
// The page-level AddFacilityBtn stays a glass secondary specifically so this
// stays the only gold button visible while a modal is open.
const SubmitBtn = styled.button`
  padding: 10px 24px;
  border: none;
  border-radius: 11px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms, box-shadow 150ms;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;
