/**
 * BlockArchivesTab Component
 *
 * Displays archived cycles and historical performance data for a block.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { BlockArchive, BlockCycleHistory } from '../../types/farm';

// ============================================================================
// DELETE CONFIRMATION MODAL
// ============================================================================

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 450px;
  width: 90%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #c62828;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ModalText = styled.p`
  font-size: 14px;
  color: #616161;
  margin: 0 0 8px 0;
  line-height: 1.6;
`;

const ModalWarning = styled.div`
  background: #fff3e0;
  border: 1px solid #ff9800;
  border-radius: 8px;
  padding: 12px;
  margin: 16px 0;
  font-size: 13px;
  color: #e65100;
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
`;

const CancelButton = styled.button`
  padding: 10px 20px;
  background: #f5f5f5;
  color: #616161;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #e0e0e0;
  }
`;

const DeleteConfirmButton = styled.button`
  padding: 10px 20px;
  background: #c62828;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #b71c1c;
  }

  &:disabled {
    background: #ef9a9a;
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
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

// Summary Cards Section
const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  padding: 24px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const SummaryCard = styled.div`
  text-align: center;
`;

const SummaryLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const SummaryValue = styled.div`
  font-size: 28px;
  font-weight: 600;
  color: #212121;
`;

const SummarySubtext = styled.div`
  font-size: 14px;
  color: #616161;
  margin-top: 4px;
`;

// Archives List Section
const ArchivesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ArchiveCard = styled.div`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  transition: box-shadow 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
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
  font-weight: 600;
  color: #212121;
  margin: 0 0 4px 0;
`;

const ArchiveMeta = styled.div`
  font-size: 13px;
  color: #9e9e9e;
`;

const EfficiencyBadge = styled.span<{ $efficiency: number }>`
  display: inline-block;
  padding: 6px 16px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 600;
  background: ${({ $efficiency }) => {
    if ($efficiency >= 90) return '#10b981';
    if ($efficiency >= 75) return '#8bc34a';
    if ($efficiency >= 60) return '#eab308';
    return '#f97316';
  }};
  color: white;
`;

const ArchiveStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 6px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const StatValue = styled.span`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
`;

const QualitySection = styled.div`
  font-size: 13px;
  color: #616161;
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
  border-top: 1px solid #e0e0e0;
`;

const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #ffebee;
  color: #c62828;
  border: 1px solid #ef5350;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #ffcdd2;
    border-color: #c62828;
  }
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #9e9e9e;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #9e9e9e;

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
              {history.averageEfficiencyPercent != null
                ? history.averageEfficiencyPercent.toFixed(1)
                : '0.0'}
              %
            </SummaryValue>
            <SummarySubtext>yield efficiency</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Avg Duration</SummaryLabel>
            <SummaryValue>
              {history.averageDurationDays != null ? Math.round(history.averageDurationDays) : 0}
            </SummaryValue>
            <SummarySubtext>days per cycle</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Total Yield</SummaryLabel>
            <SummaryValue>
              {history.totalYieldKg != null ? history.totalYieldKg.toFixed(1) : '0.0'}
            </SummaryValue>
            <SummarySubtext>kg harvested</SummarySubtext>
          </SummaryCard>
        </SummaryGrid>
      )}

      {archives.length === 0 ? (
        <EmptyState>
          <p>📦 No archived cycles yet</p>
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
                    {archive.actualPlantCount} / {archive.maxPlants}
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
                  <span>🗑️</span>
                  Delete History
                </DeleteButton>
              </ArchiveActions>
            </ArchiveCard>
          ))}
        </ArchivesList>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && archiveToDelete && (
        <ModalOverlay onClick={handleCancelDelete}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>
              <span>⚠️</span>
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
