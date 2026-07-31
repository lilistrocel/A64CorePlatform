/**
 * BlockArchivesTab Component
 *
 * Displays archived cycles and historical performance data for a block.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Package, Trash2, AlertTriangle } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import { farmApi } from '../../services/farmApi';
import type { BlockArchive, BlockCycleHistory } from '../../types/farm';

// ============================================================================
// DELETE CONFIRMATION MODAL
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers").
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
`;

const ModalContent = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 24px;
  max-width: 450px;
  width: 90%;
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.bright.coral};
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ModalText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 8px 0;
  line-height: 1.6;
`;

// Permanent-deletion warning — coral (quarantined), not gold-b (spec §3: gold
// is never a status colour except Harvesting).
const ModalWarning = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 10px;
  padding: 12px;
  margin: 16px 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
`;

const CancelButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// Destructive: coral-tinted glass, never solid red (spec §4 "Buttons").
const DeleteConfirmButton = styled.button`
  padding: 10px 20px;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(240, 138, 112, 0.28);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

// Summary Cards Section
const SummaryGrid = styled.div`
  ${glassPanel}
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  padding: 24px;
`;

const SummaryCard = styled.div`
  text-align: center;
`;

const SummaryLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const SummaryValue = styled.div`
  font-size: 28px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.secondary[500]};
`;

const SummarySubtext = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`;

// Archives List Section
const ArchivesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ArchiveCard = styled.div`
  ${glassPanel}
  padding: 20px;
`;

const ArchiveHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const ArchiveTitleSection = styled.div``;

const ArchiveTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const ArchiveMeta = styled.div`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.muted};
`;

// Efficiency tiers extrapolate the phase vocabulary (spec §5.2) rather than
// reusing `warning`/gold-b for the mid tier — gold stays reserved for the
// literal Harvesting phase (spec §3).
const EfficiencyBadge = styled.span<{ $efficiency: number }>`
  ${monoLabel}
  display: inline-block;
  padding: 6px 16px;
  border-radius: 99px;
  font-size: 0.72rem;
  background: ${({ $efficiency, theme }) => {
    if ($efficiency >= 90) return theme.colors.phase.fruiting;
    if ($efficiency >= 75) return theme.colors.phase.colonizing;
    if ($efficiency >= 60) return theme.colors.phase.fruitingInit;
    return theme.colors.phase.quarantined;
  }};
  color: ${({ theme }) => theme.colors.onDark};
`;

const ArchiveStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px;
  background: rgba(180, 200, 220, 0.05);
  border-radius: 10px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  ${monoLabel}
  font-size: 0.58rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`;

const StatValue = styled.span`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const QualitySection = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
`;

const QualityRow = styled.div`
  display: flex;
  gap: 24px;
`;

const ArchiveActions = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

// Destructive: coral-tinted glass, never solid red (spec §4 "Buttons").
const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};

  p {
    margin: 8px 0;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface BlockArchivesTabProps {
  farmId: string;
  blockId: string;
}

export function BlockArchivesTab({ farmId, blockId }: BlockArchivesTabProps) {
  const [archives, setArchives] = useState<BlockArchive[]>([]);
  const [history, setHistory] = useState<BlockCycleHistory | null>(null);
  const [loading, setLoading] = useState(true);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [archiveToDelete, setArchiveToDelete] = useState<BlockArchive | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadArchives();
  }, [farmId, blockId]);

  const loadArchives = async () => {
    try {
      setLoading(true);
      const [archivesResponse, historyData] = await Promise.all([
        farmApi.getBlockArchives(farmId, blockId, 1, 100),
        farmApi.getBlockCycleHistory(farmId, blockId).catch(() => null),
      ]);
      setArchives(archivesResponse.items);
      setHistory(historyData);
    } catch (err) {
      console.error('Error loading archives:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (archive: BlockArchive) => {
    setArchiveToDelete(archive);
    setShowDeleteModal(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setArchiveToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!archiveToDelete) return;

    try {
      setDeleting(true);
      await farmApi.deleteArchive(archiveToDelete.archiveId);

      // Reload archives after deletion
      await loadArchives();

      setShowDeleteModal(false);
      setArchiveToDelete(null);
    } catch (err) {
      console.error('Error deleting archive:', err);
      alert('Failed to delete archive. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState>Loading cycle history...</LoadingState>;
  }

  return (
    <Container>
      <Header>
        <Title>{archives.length} Completed Cycles</Title>
      </Header>

      {history && history.totalCycles > 0 && (
        <SummaryGrid>
          <SummaryCard>
            <SummaryLabel>Total Cycles</SummaryLabel>
            <SummaryValue>{history.totalCycles || 0}</SummaryValue>
            <SummarySubtext>completed</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Avg Efficiency</SummaryLabel>
            <SummaryValue>
              {history.statistics?.averageYieldEfficiency != null
                ? history.statistics.averageYieldEfficiency.toFixed(1)
                : '0.0'}
              %
            </SummaryValue>
            <SummarySubtext>yield efficiency</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Avg Duration</SummaryLabel>
            <SummaryValue>
              {history.statistics?.averageCycleDuration != null
                ? Math.round(history.statistics.averageCycleDuration)
                : 0}
            </SummaryValue>
            <SummarySubtext>days per cycle</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Total Yield</SummaryLabel>
            <SummaryValue>
              {history.statistics?.totalYieldKg != null
                ? history.statistics.totalYieldKg.toFixed(1)
                : '0.0'}
            </SummaryValue>
            <SummarySubtext>kg harvested</SummarySubtext>
          </SummaryCard>
        </SummaryGrid>
      )}

      {archives.length === 0 ? (
        <EmptyState>
          <p><Package size={16} strokeWidth={1.8} style={{ verticalAlign: '-3px', marginRight: '6px' }} />No archived cycles yet</p>
          <p>
            Complete a full growing cycle (plant → harvest → reset to empty) to see historical
            performance data here
          </p>
        </EmptyState>
      ) : (
        <ArchivesList>
          {archives.map((archive) => (
            <ArchiveCard key={archive.archiveId}>
              <ArchiveHeader>
                <ArchiveTitleSection>
                  <ArchiveTitle>{archive.targetCropName}</ArchiveTitle>
                  <ArchiveMeta>
                    {farmApi.formatDateForDisplay(archive.plantedDate)} →{' '}
                    {farmApi.formatDateForDisplay(archive.harvestCompletedDate)} (
                    {archive.cycleDurationDays} days)
                  </ArchiveMeta>
                </ArchiveTitleSection>
                <EfficiencyBadge $efficiency={archive.yieldEfficiencyPercent}>
                  {archive.yieldEfficiencyPercent.toFixed(1)}% Efficiency
                </EfficiencyBadge>
              </ArchiveHeader>

              <ArchiveStats>
                <StatItem>
                  <StatLabel>Plants</StatLabel>
                  <StatValue>
                    {archive.actualPlantCount}{archive.maxPlants ? ` / ${archive.maxPlants}` : ''}
                  </StatValue>
                </StatItem>

                <StatItem>
                  <StatLabel>Actual Yield</StatLabel>
                  <StatValue>{archive.actualYieldKg.toFixed(1)} kg</StatValue>
                </StatItem>

                <StatItem>
                  <StatLabel>Predicted Yield</StatLabel>
                  <StatValue>{archive.predictedYieldKg.toFixed(1)} kg</StatValue>
                </StatItem>

                <StatItem>
                  <StatLabel>Harvests</StatLabel>
                  <StatValue>{archive.totalHarvests}</StatValue>
                </StatItem>
              </ArchiveStats>

              <QualitySection>
                <strong>Quality Breakdown:</strong>
                <QualityRow>
                  <span>Grade A: {archive.qualityBreakdown.qualityAKg.toFixed(1)} kg</span>
                  <span>Grade B: {archive.qualityBreakdown.qualityBKg.toFixed(1)} kg</span>
                  <span>Grade C: {archive.qualityBreakdown.qualityCKg.toFixed(1)} kg</span>
                </QualityRow>
              </QualitySection>

              {archive.alertsSummary.totalAlerts > 0 && (
                <QualitySection style={{ marginTop: '12px' }}>
                  <strong>Alerts:</strong> {archive.alertsSummary.resolvedAlerts} /{' '}
                  {archive.alertsSummary.totalAlerts} resolved
                  {archive.alertsSummary.averageResolutionTimeHours && (
                    <span>
                      {' '}
                      (avg resolution: {archive.alertsSummary.averageResolutionTimeHours.toFixed(1)}{' '}
                      hours)
                    </span>
                  )}
                </QualitySection>
              )}

              <ArchiveActions>
                <DeleteButton onClick={() => handleDeleteClick(archive)}>
                  <Trash2 size={13} strokeWidth={1.8} />
                  Delete History
                </DeleteButton>
              </ArchiveActions>
            </ArchiveCard>
          ))}
        </ArchivesList>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && archiveToDelete && (
        <ModalOverlay>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>
              <AlertTriangle size={18} strokeWidth={1.8} />
              Delete Archived Cycle
            </ModalTitle>
            <ModalText>
              Are you sure you want to delete this archived cycle?
            </ModalText>
            <ModalText>
              <strong>Crop:</strong> {archiveToDelete.targetCropName}
              <br />
              <strong>Period:</strong> {farmApi.formatDateForDisplay(archiveToDelete.plantedDate)} →{' '}
              {farmApi.formatDateForDisplay(archiveToDelete.harvestCompletedDate)}
              <br />
              <strong>Yield:</strong> {archiveToDelete.actualYieldKg.toFixed(1)} kg
            </ModalText>
            <ModalWarning>
              <strong>Warning:</strong> This action cannot be undone. All historical data for this
              cycle will be permanently removed.
            </ModalWarning>
            <ModalButtons>
              <CancelButton onClick={handleCancelDelete}>Cancel</CancelButton>
              <DeleteConfirmButton onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </DeleteConfirmButton>
            </ModalButtons>
          </ModalContent>
        </ModalOverlay>
      )}
    </Container>
  );
}
