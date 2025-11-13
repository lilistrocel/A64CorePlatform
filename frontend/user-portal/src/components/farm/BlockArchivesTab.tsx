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
            </ArchiveCard>
          ))}
        </ArchivesList>
      )}
    </Container>
  );
}
