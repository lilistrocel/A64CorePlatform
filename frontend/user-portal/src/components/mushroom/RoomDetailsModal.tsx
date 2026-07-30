/**
 * RoomDetailsModal Component
 *
 * Which tabs appear depends on what the room is for.
 *
 * A **batch room** (fruiting) runs one crop, so it gets the full set: overview
 * with phase/strain/substrate and the crop lifecycle, harvests, environment and
 * contamination.
 *
 * A **container room** (lab, spawn, incubation, storage) holds many
 * independently tracked items at once. Strain, substrate, flush and the crop
 * phase machine are all meaningless there — it has no single crop. Instead it
 * opens on Contents: the actual dishes, jars and blocks in the room, which is
 * what someone clicking a room holding "18 items" is looking for.
 */

import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import type { Theme } from '@a64core/shared';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { GrowingRoom, RoomPhase } from '../../types/mushroom';
import { ROOM_TYPE_ICONS, ROOM_TYPE_LABELS, OPERATIONAL_PHASES, isBatchRoom } from '../../types/mushroom';
import {
  PHASE_COLORS,
  PHASE_LABELS,
  PHASE_TEXT_COLORS,
  QUALITY_GRADE_COLORS,
  QUALITY_GRADE_LABELS,
} from '../../types/mushroom';
import { useRoomHarvests } from '../../hooks/mushroom/useMushroomHarvests';
import { useRoomEnvironmentHistory, useLatestEnvironmentReading } from '../../hooks/mushroom/useRoomEnvironment';
import { useRoomContaminations, useResolveContamination } from '../../hooks/mushroom/useContamination';
import { useRoom, useAdvancePhase, useUpdateRoom } from '../../hooks/mushroom/useRoomData';
import { useMushroomStrains } from '../../hooks/mushroom/useMushroomStrains';
import { useFacilitySubstrates } from '../../hooks/mushroom/useSubstrateBatches';
import { BiologicalEfficiencyGauge } from './BiologicalEfficiencyGauge';
import { HarvestEntryModal } from './HarvestEntryModal';
import { DeleteRoomDialog } from './DeleteRoomDialog';
import { useAccessions } from '../../hooks/genetics/useGenetics';
import { VESSEL_LABELS, STATUS_LABELS } from '../../types/genetics';
import { useNavigate } from 'react-router-dom';

// Valid phase transitions — mirrors backend VALID_TRANSITIONS
const VALID_TRANSITIONS: Record<RoomPhase, RoomPhase[]> = {
  empty: ['preparing', 'maintenance', 'decommissioned'],
  preparing: ['inoculated', 'quarantined', 'empty'],
  inoculated: ['colonizing', 'quarantined'],
  colonizing: ['fruiting_initiation', 'quarantined'],
  fruiting_initiation: ['fruiting', 'quarantined'],
  fruiting: ['harvesting', 'quarantined'],
  harvesting: ['resting', 'quarantined'],
  resting: ['fruiting_initiation', 'cleaning', 'quarantined'],
  cleaning: ['empty', 'quarantined'],
  quarantined: ['cleaning', 'decommissioned'],
  maintenance: ['empty', 'decommissioned'],
  decommissioned: [],
};

// Phases where strain/substrate assignment makes sense
const ASSIGNMENT_PHASES: RoomPhase[] = ['preparing', 'inoculated'];

type TabType = 'contents' | 'overview' | 'environment' | 'harvests' | 'contamination';

interface RoomDetailsModalProps {
  isOpen: boolean;
  room: GrowingRoom;
  facilityId: string;
  onClose: () => void;
}

export function RoomDetailsModal({
  isOpen,
  room: roomProp,
  facilityId,
  onClose,
}: RoomDetailsModalProps) {
  // Fetch fresh room data so the modal updates after phase advances
  const { data: freshRoom } = useRoom(facilityId, roomProp.id);
  const room = freshRoom ?? roomProp;

  const navigate = useNavigate();
  const batchRoom = isBatchRoom(room.roomType);

  // Container rooms open on their contents; that is the question being asked
  // when you click a room showing "18 items".
  const [activeTab, setActiveTab] = useState<TabType>(
    batchRoom ? 'overview' : 'contents'
  );

  // What is physically in this room, from the genetics repo.
  const { data: contentsPage, isLoading: contentsLoading } = useAccessions({
    roomId: room.id,
    perPage: 100,
  });
  const contents = contentsPage?.data ?? [];
  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<RoomPhase | null>(null);
  const [selectedStrainId, setSelectedStrainId] = useState<string>('');
  const [selectedSubstrateId, setSelectedSubstrateId] = useState<string>('');
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const { data: harvests = [], isLoading: harvestsLoading } = useRoomHarvests(
    facilityId,
    room.id
  );
  const { data: envHistory = [], isLoading: envLoading } = useRoomEnvironmentHistory(
    facilityId,
    room.id
  );
  const { data: latestEnv } = useLatestEnvironmentReading(facilityId, room.id);
  const { data: contaminations = [], isLoading: contamLoading } = useRoomContaminations(
    facilityId,
    room.id
  );
  const resolveContamination = useResolveContamination();

  // Advance phase hooks
  const advancePhase = useAdvancePhase(facilityId, room.id);
  const updateRoom = useUpdateRoom(facilityId, room.id);
  const { data: allStrains = [] } = useMushroomStrains();
  const { data: substrates = [] } = useFacilitySubstrates(facilityId);

  const validTargets = VALID_TRANSITIONS[room.currentPhase] ?? [];
  const activeStrains = allStrains.filter((s) => s.isActive);
  const readySubstrates = substrates.filter((s) => s.status === 'ready');

  // Show strain/substrate selectors when advancing to a phase that needs them
  const showAssignmentFields =
    selectedPhase != null && ASSIGNMENT_PHASES.includes(selectedPhase);

  // Resolve display names from local data (backend doesn't always denormalize)
  const resolvedStrainName =
    room.strainName ??
    allStrains.find((s) => s.id === room.strainId)?.commonName ??
    null;
  const resolvedSubstrateName =
    room.substrateName ??
    substrates.find((s) => s.id === room.substrateId)?.batchCode ??
    null;

  // Inline strain/substrate editing
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [editStrainId, setEditStrainId] = useState(room.strainId ?? '');
  const [editSubstrateId, setEditSubstrateId] = useState(room.substrateId ?? '');

  const handleAssignmentSave = async () => {
    try {
      await updateRoom.mutateAsync({
        strainId: editStrainId || undefined,
        substrateBatchId: editSubstrateId || undefined,
      });
      setEditingAssignment(false);
    } catch {
      // Error handled by global interceptor
    }
  };

  const handleAdvanceSubmit = async () => {
    if (!selectedPhase) return;
    setAdvanceError(null);

    try {
      // If strain/substrate selected, update room first
      if (selectedStrainId || selectedSubstrateId) {
        const updatePayload: Record<string, string> = {};
        if (selectedStrainId) updatePayload.strainId = selectedStrainId;
        if (selectedSubstrateId) updatePayload.substrateBatchId = selectedSubstrateId;
        await updateRoom.mutateAsync(updatePayload);
      }

      // Then advance phase
      await advancePhase.mutateAsync({
        targetPhase: selectedPhase,
        notes: advanceNotes.trim() || undefined,
      });

      // Reset form on success
      setShowAdvanceForm(false);
      setSelectedPhase(null);
      setSelectedStrainId('');
      setSelectedSubstrateId('');
      setAdvanceNotes('');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to advance phase';
      setAdvanceError(msg);
    }
  };

  const isSubmitting = advancePhase.isPending || updateRoom.isPending;

  const theme = useTheme();
  const phaseColor = PHASE_COLORS[room.currentPhase] ?? theme.colors.neutral[500];
  const phaseTextColor = PHASE_TEXT_COLORS[room.currentPhase] ?? theme.colors.onAccent;
  const phaseLabel = PHASE_LABELS[room.currentPhase] ?? room.currentPhase;

  // Prepare chart data - last 24 readings, oldest first
  const chartData = [...envHistory]
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .slice(-24)
    .map((r) => ({
      time: new Date(r.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      temp: r.temperature,
      humidity: r.humidity,
      co2: r.co2Ppm,
    }));

  const activeContaminations = contaminations.filter(
    (c) => c.status !== 'resolved' && c.status !== 'eliminated'
  );

  if (!isOpen) return null;

  // Deliberately no onClick={onClose} on the backdrop: this modal contains
  // phase transitions and harvest entry, and a stray click should not discard a
  // part-completed action. The X button is the way out.
  return (
    <Backdrop role="dialog" aria-modal="true" aria-labelledby="room-modal-title">
      <ModalBox onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <ModalHeader $bgColor={phaseColor}>
          <HeaderLeft>
            <RoomCodeText id="room-modal-title">{room.roomCode}</RoomCodeText>
            <PhaseBadge $textColor={phaseTextColor}>{phaseLabel}</PhaseBadge>
          </HeaderLeft>
          <HeaderRight>
            <BiologicalEfficiencyGauge
              value={room.biologicalEfficiency}
              size="small"
              showLabel={false}
            />
            <DangerButton
              onClick={() => setShowDelete(true)}
              aria-label={`Delete room ${room.roomCode}`}
              title="Delete this room"
            >
              Delete
            </DangerButton>
            <CloseButton onClick={onClose} aria-label="Close room details">
              &#10005;
            </CloseButton>
          </HeaderRight>
        </ModalHeader>

        {/* Tabs */}
        <TabBar role="tablist" aria-label="Room detail sections">
          {((batchRoom
            ? ['overview', 'environment', 'harvests', 'contamination']
            : ['contents', 'environment', 'contamination']) as TabType[]).map(
            (tab) => (
              <TabButton
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                $active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'contents' && `Contents${contents.length ? ` (${contents.length})` : ''}`}
                {tab === 'overview' && 'Overview'}
                {tab === 'environment' && (
                  <>
                    Environment{' '}
                    {latestEnv && (
                      <TabDot title="Live data available" />
                    )}
                  </>
                )}
                {tab === 'harvests' && `Harvests (${harvests.length})`}
                {tab === 'contamination' && (
                  <>
                    Contamination
                    {activeContaminations.length > 0 && (
                      <AlertDot>{activeContaminations.length}</AlertDot>
                    )}
                  </>
                )}
              </TabButton>
            )
          )}
        </TabBar>

        {/* Tab Content */}
        <TabContent role="tabpanel">
          {/* ── OVERVIEW ── */}
          {activeTab === 'contents' && (
            <Section>
              <ContentsHeader>
                <ContentsIntro>
                  {ROOM_TYPE_ICONS[room.roomType]} A{' '}
                  {ROOM_TYPE_LABELS[room.roomType].toLowerCase()} room holds many
                  independently tracked items — each carries its own generation and
                  lineage, so the room itself has no single strain or crop phase.
                </ContentsIntro>

                {/* A container room has no crop lifecycle, but it still needs an
                    operational state — shut for cleaning, quarantined, and so on. */}
                <StatusRow>
                  <StatusLabel htmlFor="room-op-status">Room status</StatusLabel>
                  <StatusSelect
                    id="room-op-status"
                    value={room.currentPhase}
                    disabled={advancePhase.isPending}
                    onChange={(e) => {
                      const target = e.target.value as RoomPhase;
                      if (target !== room.currentPhase) {
                        advancePhase.mutate({ targetPhase: target });
                      }
                    }}
                  >
                    {OPERATIONAL_PHASES.map((ph) => (
                      <option key={ph} value={ph}>
                        {PHASE_LABELS[ph] ?? ph}
                      </option>
                    ))}
                  </StatusSelect>
                  {advancePhase.isPending && <MutedText>saving…</MutedText>}
                </StatusRow>
              </ContentsHeader>

              {contentsLoading && <MutedText>Loading contents…</MutedText>}

              {!contentsLoading && contents.length === 0 && (
                <EmptyBox>
                  Nothing recorded in this room yet.
                  <br />
                  Material appears here once it is registered or propagated into the
                  room from the Genetics Repo.
                </EmptyBox>
              )}

              {!contentsLoading && contents.length > 0 && (
                <>
                  <ContentsSummary>
                    {Object.entries(
                      contents.reduce<Record<string, number>>((acc, a) => {
                        acc[a.form] = (acc[a.form] ?? 0) + a.quantity;
                        return acc;
                      }, {})
                    )
                      .sort((a, b) => b[1] - a[1])
                      .map(([form, count]) => (
                        <SummaryChip key={form}>
                          <SummaryCount>{count}</SummaryCount>{' '}
                          {VESSEL_LABELS[form as keyof typeof VESSEL_LABELS] ?? form}
                        </SummaryChip>
                      ))}
                  </ContentsSummary>

                  <ContentsTable>
                    <thead>
                      <tr>
                        <ContentsTh>Accession</ContentsTh>
                        <ContentsTh>Gen</ContentsTh>
                        <ContentsTh>Form</ContentsTh>
                        <ContentsTh>Qty</ContentsTh>
                        <ContentsTh>Position</ContentsTh>
                        <ContentsTh>Status</ContentsTh>
                      </tr>
                    </thead>
                    <tbody>
                      {contents.map((a) => (
                        <ContentsRow
                          key={a.id}
                          onClick={() => {
                            onClose();
                            navigate(`/genetics/accessions/${a.id}`);
                          }}
                          title="Open in the Genetics Repo"
                        >
                          <ContentsTd>
                            <AccessionCode>{a.accessionCode}</AccessionCode>
                          </ContentsTd>
                          <ContentsTd>
                            <GenPill $warm={a.cloneGeneration >= 5}>
                              {a.generationLabel}
                            </GenPill>
                          </ContentsTd>
                          <ContentsTd>
                            {VESSEL_LABELS[a.form] ?? a.form}
                          </ContentsTd>
                          <ContentsTd>
                            {a.quantity} {a.unit}
                          </ContentsTd>
                          <ContentsTd>
                            <MutedText>
                              {[a.location?.unit, a.location?.position]
                                .filter(Boolean)
                                .join(' / ') || '—'}
                            </MutedText>
                          </ContentsTd>
                          <ContentsTd>
                            <MutedText>{STATUS_LABELS[a.status] ?? a.status}</MutedText>
                          </ContentsTd>
                        </ContentsRow>
                      ))}
                    </tbody>
                  </ContentsTable>
                </>
              )}
            </Section>
          )}

          {activeTab === 'overview' && (
            <Section>
              <TwoCol>
                <InfoGroup>
                  <InfoLabel>Current Phase</InfoLabel>
                  <PhasePill $bg={phaseColor} $text={phaseTextColor}>
                    {phaseLabel}
                  </PhasePill>
                </InfoGroup>
                <InfoGroup>
                  <InfoLabel>Flush Progress</InfoLabel>
                  <InfoValue>
                    {room.currentFlush != null && room.maxFlushes != null
                      ? `${room.currentFlush} / ${room.maxFlushes} flushes`
                      : room.currentFlush != null
                        ? `Flush ${room.currentFlush}`
                        : '—'}
                  </InfoValue>
                </InfoGroup>
              </TwoCol>

              {/* Advance Phase Action */}
              {validTargets.length > 0 && (
                <AdvancePhaseSection>
                  {!showAdvanceForm ? (
                    <AdvancePhaseBtn onClick={() => setShowAdvanceForm(true)}>
                      Advance Phase
                    </AdvancePhaseBtn>
                  ) : (
                    <AdvanceFormBox>
                      <AdvanceFormTitle>Advance to:</AdvanceFormTitle>

                      <PhaseOptionRow>
                        {validTargets.map((phase) => (
                          <PhaseOptionBtn
                            key={phase}
                            $bg={PHASE_COLORS[phase]}
                            $text={PHASE_TEXT_COLORS[phase]}
                            $selected={selectedPhase === phase}
                            onClick={() => setSelectedPhase(phase)}
                            type="button"
                          >
                            {PHASE_LABELS[phase]}
                          </PhaseOptionBtn>
                        ))}
                      </PhaseOptionRow>

                      {showAssignmentFields && (
                        <>
                          <AdvanceFormGroup>
                            <AdvanceFormLabel htmlFor="adv-strain">
                              Strain
                            </AdvanceFormLabel>
                            <AdvanceSelect
                              id="adv-strain"
                              value={selectedStrainId}
                              onChange={(e) =>
                                setSelectedStrainId(e.target.value)
                              }
                            >
                              <option value="">— Select strain —</option>
                              {activeStrains.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.commonName} ({s.species})
                                </option>
                              ))}
                            </AdvanceSelect>
                          </AdvanceFormGroup>

                          <AdvanceFormGroup>
                            <AdvanceFormLabel htmlFor="adv-substrate">
                              Substrate Batch
                            </AdvanceFormLabel>
                            <AdvanceSelect
                              id="adv-substrate"
                              value={selectedSubstrateId}
                              onChange={(e) =>
                                setSelectedSubstrateId(e.target.value)
                              }
                            >
                              <option value="">— Select batch —</option>
                              {readySubstrates.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.batchCode} — {s.substrateType.replace(/_/g, ' ')}
                                  {s.remainingWeightKg != null &&
                                    ` (${s.remainingWeightKg.toFixed(1)} kg)`}
                                </option>
                              ))}
                            </AdvanceSelect>
                          </AdvanceFormGroup>
                        </>
                      )}

                      <AdvanceFormGroup>
                        <AdvanceFormLabel htmlFor="adv-notes">
                          Notes (optional)
                        </AdvanceFormLabel>
                        <AdvanceTextarea
                          id="adv-notes"
                          rows={2}
                          value={advanceNotes}
                          onChange={(e) => setAdvanceNotes(e.target.value)}
                          placeholder="Transition notes..."
                          maxLength={500}
                        />
                      </AdvanceFormGroup>

                      {advanceError && (
                        <AdvanceError role="alert">{advanceError}</AdvanceError>
                      )}

                      <AdvanceActions>
                        <AdvanceCancelBtn
                          type="button"
                          onClick={() => {
                            setShowAdvanceForm(false);
                            setSelectedPhase(null);
                            setSelectedStrainId('');
                            setSelectedSubstrateId('');
                            setAdvanceNotes('');
                            setAdvanceError(null);
                          }}
                        >
                          Cancel
                        </AdvanceCancelBtn>
                        <AdvanceConfirmBtn
                          type="button"
                          disabled={!selectedPhase || isSubmitting}
                          onClick={handleAdvanceSubmit}
                        >
                          {isSubmitting ? 'Updating...' : 'Confirm'}
                        </AdvanceConfirmBtn>
                      </AdvanceActions>
                    </AdvanceFormBox>
                  )}
                </AdvancePhaseSection>
              )}

              {!editingAssignment ? (
                <AssignmentRow>
                  <TwoCol>
                    <InfoGroup>
                      <InfoLabel>Strain</InfoLabel>
                      <InfoValue>{resolvedStrainName ?? '—'}</InfoValue>
                    </InfoGroup>
                    <InfoGroup>
                      <InfoLabel>Substrate Batch</InfoLabel>
                      <InfoValue>{resolvedSubstrateName ?? '—'}</InfoValue>
                    </InfoGroup>
                  </TwoCol>
                  <EditAssignmentBtn
                    onClick={() => {
                      setEditStrainId(room.strainId ?? '');
                      setEditSubstrateId(room.substrateId ?? '');
                      setEditingAssignment(true);
                    }}
                  >
                    Edit
                  </EditAssignmentBtn>
                </AssignmentRow>
              ) : (
                <AdvanceFormBox>
                  <AdvanceFormTitle>Assign Strain & Substrate</AdvanceFormTitle>
                  <AdvanceFormGroup>
                    <AdvanceFormLabel htmlFor="edit-strain">Strain</AdvanceFormLabel>
                    <AdvanceSelect
                      id="edit-strain"
                      value={editStrainId}
                      onChange={(e) => setEditStrainId(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {activeStrains.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.commonName} ({s.species})
                        </option>
                      ))}
                    </AdvanceSelect>
                  </AdvanceFormGroup>
                  <AdvanceFormGroup>
                    <AdvanceFormLabel htmlFor="edit-substrate">
                      Substrate Batch
                    </AdvanceFormLabel>
                    <AdvanceSelect
                      id="edit-substrate"
                      value={editSubstrateId}
                      onChange={(e) => setEditSubstrateId(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {readySubstrates.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.batchCode} — {s.substrateType.replace(/_/g, ' ')}
                          {s.remainingWeightKg != null &&
                            ` (${s.remainingWeightKg.toFixed(1)} kg)`}
                        </option>
                      ))}
                    </AdvanceSelect>
                  </AdvanceFormGroup>
                  <AdvanceActions>
                    <AdvanceCancelBtn
                      type="button"
                      onClick={() => setEditingAssignment(false)}
                    >
                      Cancel
                    </AdvanceCancelBtn>
                    <AdvanceConfirmBtn
                      type="button"
                      disabled={updateRoom.isPending}
                      onClick={handleAssignmentSave}
                    >
                      {updateRoom.isPending ? 'Saving...' : 'Save'}
                    </AdvanceConfirmBtn>
                  </AdvanceActions>
                </AdvanceFormBox>
              )}

              {room.inoculationDate && (
                <TwoCol>
                  <InfoGroup>
                    <InfoLabel>Inoculation Date</InfoLabel>
                    <InfoValue>
                      {new Date(room.inoculationDate).toLocaleDateString()}
                    </InfoValue>
                  </InfoGroup>
                  {room.expectedHarvestDate && (
                    <InfoGroup>
                      <InfoLabel>Expected Harvest</InfoLabel>
                      <InfoValue>
                        {new Date(room.expectedHarvestDate).toLocaleDateString()}
                      </InfoValue>
                    </InfoGroup>
                  )}
                </TwoCol>
              )}

              <BESection>
                <InfoLabel>Biological Efficiency</InfoLabel>
                <BERow>
                  <BiologicalEfficiencyGauge
                    value={room.biologicalEfficiency}
                    size="large"
                  />
                  <BEExplain>
                    Biological Efficiency (BE%) measures yield relative to substrate weight.
                    <br />
                    <em>
                      BE% = (Fresh mushroom weight / Dry substrate weight) × 100
                    </em>
                  </BEExplain>
                </BERow>
              </BESection>

              {room.notes && (
                <InfoGroup>
                  <InfoLabel>Notes</InfoLabel>
                  <NotesBox>{room.notes}</NotesBox>
                </InfoGroup>
              )}
            </Section>
          )}

          {/* ── ENVIRONMENT ── */}
          {activeTab === 'environment' && (
            <Section>
              {latestEnv && (
                <LatestReadingGrid>
                  <ReadingCard>
                    <ReadingIcon>🌡️</ReadingIcon>
                    <ReadingValue>{latestEnv.temperature?.toFixed(1) ?? '—'}°C</ReadingValue>
                    <ReadingLabel>Temperature</ReadingLabel>
                  </ReadingCard>
                  <ReadingCard>
                    <ReadingIcon>💧</ReadingIcon>
                    <ReadingValue>{latestEnv.humidity?.toFixed(1) ?? '—'}%</ReadingValue>
                    <ReadingLabel>Humidity</ReadingLabel>
                  </ReadingCard>
                  <ReadingCard>
                    <ReadingIcon>💨</ReadingIcon>
                    <ReadingValue>{latestEnv.co2Ppm?.toFixed(0) ?? '—'} ppm</ReadingValue>
                    <ReadingLabel>CO2</ReadingLabel>
                  </ReadingCard>
                  {latestEnv.lightLux != null && (
                    <ReadingCard>
                      <ReadingIcon>💡</ReadingIcon>
                      <ReadingValue>{latestEnv.lightLux.toFixed(0)} lux</ReadingValue>
                      <ReadingLabel>Light</ReadingLabel>
                    </ReadingCard>
                  )}
                </LatestReadingGrid>
              )}

              {envLoading ? (
                <LoadingText>Loading environment history...</LoadingText>
              ) : chartData.length > 0 ? (
                <ChartWrapper>
                  <ChartTitle>Last {chartData.length} Readings</ChartTitle>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.neutral[200]} />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      {/* Three distinct series need three distinct hues; error/info
                          carry no "temp is bad" implication here, they're just
                          visually separated categorical lines. Gold is reserved
                          (brand §1.4), so CO2 takes emerald as the third voice. */}
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="temp"
                        stroke={theme.colors.error}
                        strokeWidth={2}
                        dot={false}
                        name="Temp (°C)"
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="humidity"
                        stroke={theme.colors.info}
                        strokeWidth={2}
                        dot={false}
                        name="Humidity (%)"
                      />
                      {chartData.some((d) => d.co2 != null) && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="co2"
                          stroke={theme.colors.emerald[500]}
                          strokeWidth={1.5}
                          dot={false}
                          name="CO2 (ppm)"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartWrapper>
              ) : (
                <EmptyTabState>No environment data recorded yet.</EmptyTabState>
              )}
            </Section>
          )}

          {/* ── HARVESTS ── */}
          {activeTab === 'harvests' && (
            <Section>
              <SectionToolbar>
                <SectionHeading>Harvest Records</SectionHeading>
                <AddButton onClick={() => setShowHarvestModal(true)}>
                  + Log Harvest
                </AddButton>
              </SectionToolbar>

              {harvestsLoading ? (
                <LoadingText>Loading harvests...</LoadingText>
              ) : harvests.length === 0 ? (
                <EmptyTabState>No harvests recorded for this room.</EmptyTabState>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Flush</Th>
                      <Th>Weight</Th>
                      <Th>BE%</Th>
                      <Th>Grade</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {harvests.map((h) => (
                      <tr key={h.id}>
                        <Td>{new Date(h.harvestDate).toLocaleDateString()}</Td>
                        <Td>Flush {h.flushNumber}</Td>
                        <Td>
                          <strong>{h.weightKg.toFixed(2)} kg</strong>
                        </Td>
                        <Td>
                          {h.biologicalEfficiency != null
                            ? `${h.biologicalEfficiency.toFixed(1)}%`
                            : '—'}
                        </Td>
                        <Td>
                          <GradePill $color={QUALITY_GRADE_COLORS[h.qualityGrade]}>
                            {QUALITY_GRADE_LABELS[h.qualityGrade]}
                          </GradePill>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <TfootTd colSpan={2}>
                        <strong>Total ({harvests.length} harvests)</strong>
                      </TfootTd>
                      <TfootTd>
                        <strong>
                          {harvests.reduce((sum, h) => sum + h.weightKg, 0).toFixed(2)} kg
                        </strong>
                      </TfootTd>
                      <TfootTd colSpan={2} />
                    </tr>
                  </tfoot>
                </Table>
              )}
            </Section>
          )}

          {/* ── CONTAMINATION ── */}
          {activeTab === 'contamination' && (
            <Section>
              <SectionHeading>Contamination Reports</SectionHeading>

              {contamLoading ? (
                <LoadingText>Loading reports...</LoadingText>
              ) : contaminations.length === 0 ? (
                <EmptyTabState>No contamination reports for this room.</EmptyTabState>
              ) : (
                <ContamList>
                  {contaminations.map((report) => (
                    <ContamCard key={report.id} $resolved={report.status === 'resolved' || report.status === 'eliminated'}>
                      <ContamHeader>
                        <ContamType>
                          {report.contaminationType.replace(/_/g, ' ')}
                        </ContamType>
                        <SeverityBadge $severity={report.severity}>
                          {report.severity}
                        </SeverityBadge>
                        <StatusBadge $resolved={report.status === 'resolved' || report.status === 'eliminated'}>
                          {report.status}
                        </StatusBadge>
                      </ContamHeader>
                      <ContamMeta>
                        Detected: {new Date(report.detectedDate).toLocaleDateString()}
                        {report.affectedAreaPercent != null &&
                          ` · ${report.affectedAreaPercent}% affected`}
                      </ContamMeta>
                      {report.description && (
                        <ContamDesc>{report.description}</ContamDesc>
                      )}
                      {report.status !== 'resolved' && report.status !== 'eliminated' && (
                        <ResolveButton
                          onClick={() =>
                            resolveContamination.mutate({
                              contaminationId: report.id,
                              payload: { resolvedDate: new Date().toISOString() },
                            })
                          }
                          disabled={resolveContamination.isPending}
                        >
                          Mark Resolved
                        </ResolveButton>
                      )}
                    </ContamCard>
                  ))}
                </ContamList>
              )}
            </Section>
          )}
        </TabContent>
      </ModalBox>

      {showDelete && (
        <DeleteRoomDialog
          room={room}
          facilityId={facilityId}
          onClose={() => setShowDelete(false)}
          onDeleted={onClose}
        />
      )}

      {showHarvestModal && (
        <HarvestEntryModal
          isOpen={showHarvestModal}
          room={room}
          facilityId={facilityId}
          onClose={() => setShowHarvestModal(false)}
          onSuccess={() => setShowHarvestModal(false)}
        />
      )}
    </Backdrop>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const ContentsHeader = styled.div`
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const StatusLabel = styled.label`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const StatusSelect = styled.select`
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ContentsIntro = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ContentsSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
`;

const SummaryChip = styled.span`
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 12.5px;
  background: ${({ theme }) => theme.colors.primary[50]};
  color: ${({ theme }) => theme.colors.primary[800]};
`;

const SummaryCount = styled.strong`
  font-weight: 700;
`;

const ContentsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
`;

const ContentsTh = styled.th`
  text-align: left;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  white-space: nowrap;
`;

const ContentsTd = styled.td`
  padding: 9px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ContentsRow = styled.tr`
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const AccessionCode = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 700;
  font-size: 12.5px;
`;

const GenPill = styled.span<{ $warm: boolean }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: ${({ $warm, theme }) =>
    $warm ? theme.colors.warningBg : theme.colors.primary[50]};
  color: ${({ $warm, theme }) => ($warm ? theme.colors.gold[800] : theme.colors.primary[800])};
`;

const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12.5px;
`;

const EmptyBox = styled.div`
  padding: 32px 16px;
  text-align: center;
  font-size: 13.5px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px dashed ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
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
  box-shadow: ${({ theme }) => theme.shadows.lg};
  width: 100%;
  max-width: 680px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

interface ModalHeaderProps {
  $bgColor: string;
}

const ModalHeader = styled.div<ModalHeaderProps>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: ${({ $bgColor }) => $bgColor}22;
  border-bottom: 3px solid ${({ $bgColor }) => $bgColor};
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const RoomCodeText = styled.h2`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

interface PhaseBadgeProps {
  $textColor: string;
}

const PhaseBadge = styled.span<PhaseBadgeProps>`
  font-size: 12px;
  font-weight: 600;
  color: ${({ $textColor }) => $textColor};
  background: rgba(0, 0, 0, 0.12);
  border-radius: 20px;
  padding: 3px 10px;
`;

const DangerButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 11px;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
    border-color: ${({ theme }) => theme.colors.error};
    color: ${({ theme }) => theme.colors.terracotta[700]};
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 150ms;
  line-height: 1;

  &:hover {
    background: rgba(0, 0, 0, 0.08);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
  }
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ theme }) => theme.colors.surface};
  overflow-x: auto;
  flex-shrink: 0;
`;

interface TabButtonProps {
  $active: boolean;
}

const TabButton = styled.button<TabButtonProps>`
  padding: 12px 18px;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.neutral[700])};
  background: none;
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary[500] : 'transparent')};
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 150ms;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    background: rgba(0, 0, 0, 0.04);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: -2px;
  }
`;

const TabDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.success};
  display: inline-block;
`;

const AlertDot = styled.span`
  background: ${({ theme }) => theme.colors.error};
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
`;

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const Section = styled.div`
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const InfoGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const InfoValue = styled.span`
  font-size: 15px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

interface PhasePillProps {
  $bg: string;
  $text: string;
}

const PhasePill = styled.span<PhasePillProps>`
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $bg }) => $bg};
  color: ${({ $text }) => $text};
  border-radius: 20px;
  padding: 3px 10px;
`;

// ---- Assignment Row -------------------------------------------------------

const AssignmentRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;

  ${TwoCol} {
    flex: 1;
  }
`;

const EditAssignmentBtn = styled.button`
  padding: 4px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;
  flex-shrink: 0;
  margin-top: 2px;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

// ---- Advance Phase --------------------------------------------------------

const AdvancePhaseSection = styled.div``;

const AdvancePhaseBtn = styled.button`
  padding: 8px 16px;
  border: 1px solid ${({ theme }) => theme.colors.primary[500]};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.infoBg};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const AdvanceFormBox = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid ${({ theme }) => theme.colors.primary[200]};
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const AdvanceFormTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.neutral[800]};
`;

const PhaseOptionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

interface PhaseOptionBtnProps {
  $bg: string;
  $text: string;
  $selected: boolean;
}

const PhaseOptionBtn = styled.button<PhaseOptionBtnProps>`
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;
  border: 2px solid ${({ $bg }) => $bg};
  background: ${({ $selected, $bg, theme }) => ($selected ? $bg : theme.colors.background)};
  color: ${({ $selected, $bg, $text }) => ($selected ? $text : $bg)};
  box-shadow: ${({ $selected }) =>
    $selected ? '0 2px 6px rgba(0,0,0,0.15)' : 'none'};

  &:hover {
    background: ${({ $bg }) => $bg};
    color: ${({ $text }) => $text};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const AdvanceFormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const AdvanceFormLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const AdvanceSelect = styled.select`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 2px ${theme.colors.primary[500]}26`};
  }
`;

const AdvanceTextarea = styled.textarea`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  resize: vertical;
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 2px ${theme.colors.primary[500]}26`};
  }
`;

const AdvanceError = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.terracotta[600]};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  border-radius: 6px;
  padding: 8px 10px;
`;

const AdvanceActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const AdvanceCancelBtn = styled.button`
  padding: 7px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const AdvanceConfirmBtn = styled.button`
  padding: 7px 16px;
  border: none;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ---- BE Section -----------------------------------------------------------

const BESection = styled.div`
  padding-top: 4px;
`;

const BERow = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 10px;

  @media (max-width: 480px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
`;

const BEExplain = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.neutral[700]};
  line-height: 1.6;
  margin: 0;
`;

const NotesBox = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
  padding: 10px 14px;
  line-height: 1.6;
`;

const LatestReadingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
`;

const ReadingCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 10px;
  padding: 12px;
  text-align: center;
`;

const ReadingIcon = styled.div`
  font-size: 20px;
  margin-bottom: 4px;
`;

const ReadingValue = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 2px;
`;

const ReadingLabel = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const ChartWrapper = styled.div``;

const ChartTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.neutral[700]};
  margin-bottom: 8px;
`;

const SectionToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SectionHeading = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const AddButton = styled.button`
  padding: 7px 14px;
  border: 1px solid ${({ theme }) => theme.colors.success};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.success};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.successBg};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.success};
    outline-offset: 2px;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ theme }) => theme.colors.surface};
`;

const Td = styled.td`
  padding: 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  color: ${({ theme }) => theme.colors.neutral[800]};
`;

const TfootTd = styled.td`
  padding: 10px;
  border-top: 2px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

interface GradePillProps {
  $color: string;
}

const GradePill = styled.span<GradePillProps>`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.onAccent};
  background: ${({ $color }) => $color};
  border-radius: 20px;
  padding: 2px 8px;
`;

const ContamList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

interface ContamCardProps {
  $resolved: boolean;
}

const ContamCard = styled.div<ContamCardProps>`
  background: ${({ $resolved, theme }) => ($resolved ? theme.colors.neutral[100] : theme.colors.errorBg)};
  border: 1px solid ${({ $resolved, theme }) => ($resolved ? theme.colors.border : theme.colors.terracotta[200])};
  border-radius: 10px;
  padding: 14px;
  opacity: ${({ $resolved }) => ($resolved ? 0.7 : 1)};
`;

const ContamHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
`;

const ContamType = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  text-transform: capitalize;
  flex: 1;
`;

interface SeverityBadgeProps {
  $severity: string;
}

// Contamination severity is a data encoding — walk a single ramp from low
// risk to critical rather than mixing hues, so the ordering stays legible.
function getSeverityColors(theme: Theme): Record<string, string> {
  return {
    low: theme.colors.success,
    medium: theme.colors.warning,
    high: theme.colors.error,
    critical: theme.colors.terracotta[900],
  };
}

const SeverityBadge = styled.span<SeverityBadgeProps>`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.onAccent};
  background: ${({ $severity, theme }) => getSeverityColors(theme)[$severity] ?? theme.colors.neutral[500]};
  border-radius: 20px;
  padding: 2px 8px;
  text-transform: capitalize;
`;

interface StatusBadgeProps {
  $resolved: boolean;
}

const StatusBadge = styled.span<StatusBadgeProps>`
  font-size: 11px;
  font-weight: 600;
  color: ${({ $resolved, theme }) => ($resolved ? theme.colors.success : theme.colors.warning)};
  background: ${({ $resolved, theme }) => ($resolved ? theme.colors.successBg : theme.colors.warningBg)};
  border-radius: 20px;
  padding: 2px 8px;
  text-transform: capitalize;
`;

const ContamMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const ContamDesc = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.neutral[800]};
  margin-bottom: 8px;
`;

const ResolveButton = styled.button`
  padding: 5px 12px;
  border: 1px solid ${({ theme }) => theme.colors.success};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.success};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.successBg};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.success};
    outline-offset: 2px;
  }
`;

const LoadingText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-align: center;
  padding: 32px;
`;

const EmptyTabState = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-align: center;
  padding: 32px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  border-radius: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
`;
