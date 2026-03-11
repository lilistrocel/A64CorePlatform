/**
 * RoomDetailsModal Component
 *
 * Tabbed modal for room details with four tabs:
 * - Overview: strain info, phase, substrate info
 * - Environment: latest readings + historical chart
 * - Harvests: table of harvests with flush numbers
 * - Contamination: list of reports with resolve action
 */

import { useState } from 'react';
import styled from 'styled-components';
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

type TabType = 'overview' | 'environment' | 'harvests' | 'contamination';

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

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showHarvestModal, setShowHarvestModal] = useState(false);
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

  const phaseColor = PHASE_COLORS[room.currentPhase] ?? '#9e9e9e';
  const phaseTextColor = PHASE_TEXT_COLORS[room.currentPhase] ?? '#fff';
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

  return (
    <Backdrop onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="room-modal-title">
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
            <CloseButton onClick={onClose} aria-label="Close room details">
              &#10005;
            </CloseButton>
          </HeaderRight>
        </ModalHeader>

        {/* Tabs */}
        <TabBar role="tablist" aria-label="Room detail sections">
          {(['overview', 'environment', 'harvests', 'contamination'] as TabType[]).map(
            (tab) => (
              <TabButton
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                $active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              >
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="temp"
                        stroke="#EF4444"
                        strokeWidth={2}
                        dot={false}
                        name="Temp (°C)"
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="humidity"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        dot={false}
                        name="Humidity (%)"
                      />
                      {chartData.some((d) => d.co2 != null) && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="co2"
                          stroke="#8B5CF6"
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
  background: white;
  border-radius: 16px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.22);
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
  color: #212121;
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

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #757575;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 150ms;
  line-height: 1;

  &:hover {
    background: rgba(0, 0, 0, 0.08);
    color: #212121;
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
  }
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
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
  color: ${({ $active }) => ($active ? '#2196f3' : '#616161')};
  background: none;
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? '#2196f3' : 'transparent')};
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 150ms;

  &:hover {
    color: #212121;
    background: rgba(0, 0, 0, 0.04);
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
    outline-offset: -2px;
  }
`;

const TabDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10B981;
  display: inline-block;
`;

const AlertDot = styled.span`
  background: #EF4444;
  color: white;
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
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const InfoValue = styled.span`
  font-size: 15px;
  font-weight: 500;
  color: #212121;
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
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;
  flex-shrink: 0;
  margin-top: 2px;

  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
  &:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
`;

// ---- Advance Phase --------------------------------------------------------

const AdvancePhaseSection = styled.div``;

const AdvancePhaseBtn = styled.button`
  padding: 8px 16px;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  background: white;
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

const AdvanceFormBox = styled.div`
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const AdvanceFormTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #374151;
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
  background: ${({ $selected, $bg }) => ($selected ? $bg : 'white')};
  color: ${({ $selected, $bg, $text }) => ($selected ? $text : $bg)};
  box-shadow: ${({ $selected }) =>
    $selected ? '0 2px 6px rgba(0,0,0,0.15)' : 'none'};

  &:hover {
    background: ${({ $bg }) => $bg};
    color: ${({ $text }) => $text};
  }
  &:focus-visible {
    outline: 2px solid #3b82f6;
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
  color: #6b7280;
`;

const AdvanceSelect = styled.select`
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  color: #212121;
  background: white;
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }
`;

const AdvanceTextarea = styled.textarea`
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  color: #212121;
  background: white;
  resize: vertical;
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }
`;

const AdvanceError = styled.div`
  font-size: 12px;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
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
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: white;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: #f3f4f6;
  }
`;

const AdvanceConfirmBtn = styled.button`
  padding: 7px 16px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover:not(:disabled) {
    background: #2563eb;
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
  color: #616161;
  line-height: 1.6;
  margin: 0;
`;

const NotesBox = styled.div`
  font-size: 14px;
  color: #424242;
  background: #f9fafb;
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
  background: #f9fafb;
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
  color: #212121;
  margin-bottom: 2px;
`;

const ReadingLabel = styled.div`
  font-size: 10px;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const ChartWrapper = styled.div``;

const ChartTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #616161;
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
  color: #212121;
  margin: 0;
`;

const AddButton = styled.button`
  padding: 7px 14px;
  border: 1px solid #10B981;
  border-radius: 8px;
  background: white;
  color: #10B981;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: #d1fae5;
  }
  &:focus-visible {
    outline: 2px solid #10B981;
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
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 2px solid #e0e0e0;
  background: #fafafa;
`;

const Td = styled.td`
  padding: 10px;
  border-bottom: 1px solid #f0f0f0;
  color: #424242;
`;

const TfootTd = styled.td`
  padding: 10px;
  border-top: 2px solid #e0e0e0;
  background: #fafafa;
  color: #212121;
`;

interface GradePillProps {
  $color: string;
}

const GradePill = styled.span<GradePillProps>`
  font-size: 11px;
  font-weight: 600;
  color: white;
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
  background: ${({ $resolved }) => ($resolved ? '#f9fafb' : '#fff5f5')};
  border: 1px solid ${({ $resolved }) => ($resolved ? '#e0e0e0' : '#fecaca')};
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
  color: #212121;
  text-transform: capitalize;
  flex: 1;
`;

interface SeverityBadgeProps {
  $severity: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7F1D1D',
};

const SeverityBadge = styled.span<SeverityBadgeProps>`
  font-size: 11px;
  font-weight: 600;
  color: white;
  background: ${({ $severity }) => SEVERITY_COLORS[$severity] ?? '#9e9e9e'};
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
  color: ${({ $resolved }) => ($resolved ? '#10B981' : '#F59E0B')};
  background: ${({ $resolved }) => ($resolved ? '#D1FAE5' : '#FEF3C7')};
  border-radius: 20px;
  padding: 2px 8px;
  text-transform: capitalize;
`;

const ContamMeta = styled.div`
  font-size: 12px;
  color: #757575;
  margin-bottom: 4px;
`;

const ContamDesc = styled.div`
  font-size: 13px;
  color: #424242;
  margin-bottom: 8px;
`;

const ResolveButton = styled.button`
  padding: 5px 12px;
  border: 1px solid #10B981;
  border-radius: 6px;
  background: white;
  color: #10B981;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover:not(:disabled) {
    background: #d1fae5;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid #10B981;
    outline-offset: 2px;
  }
`;

const LoadingText = styled.div`
  font-size: 14px;
  color: #9e9e9e;
  text-align: center;
  padding: 32px;
`;

const EmptyTabState = styled.div`
  font-size: 14px;
  color: #9e9e9e;
  text-align: center;
  padding: 32px;
  background: #f9fafb;
  border-radius: 10px;
  border: 1px dashed #e0e0e0;
`;
