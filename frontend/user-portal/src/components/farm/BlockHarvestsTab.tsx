/**
 * BlockHarvestsTab Component
 *
 * Displays and manages harvest records for a block.
 * Includes farming year filtering to view harvest history by farming year.
 */

import { useState, useEffect } from 'react';
import styled, { useTheme } from 'styled-components';
import { Sprout, BarChart3, ListFilter } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { farmApi, getAvailableFarmingYears, type FarmingYearItem } from '../../services/farmApi';
import { FarmingYearSelector } from './FarmingYearSelector';
import { BlockHarvestBatchLookupModal } from './BlockHarvestBatchLookupModal';
import type { BlockHarvest, BlockHarvestSummary, QualityGrade } from '../../types/farm';
import { formatNumber } from '../../utils';

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
  flex-wrap: wrap;
  gap: 16px;
`;

const HeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const FarmingYearContext = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bright.lapis};
  font-weight: 600;
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }
`;

// Primary: the one gold-gradient CTA on this view (spec §3). Secondary: glass
// ghost text (spec §4 "Buttons").
const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
  border: 1px solid transparent;

  ${({ $variant, theme }) =>
    $variant === 'primary'
      ? `
    background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
    color: ${theme.colors.onAccent};
    box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
    }
  `
      : `
    background: transparent;
    color: ${theme.colors.celeste};
    border-color: ${theme.colors.glass.border};
    &:hover:not(:disabled) {
      background: rgba(180, 200, 220, 0.07);
      color: ${theme.colors.textPrimary};
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

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

const HarvestsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const HarvestCard = styled.div`
  ${glassPanel}
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const HarvestInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const HarvestDate = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HarvestMeta = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  gap: 12px;
`;

// Legacy rows predate the Plant Library product extension and have no
// linked product — 'Unspecified' rather than a blank cell (design doc §4.2).
const ProductName = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Quality grade extrapolates the phase vocabulary (spec §5.2) rather than
// reusing `warning`/gold-b for grade B — gold stays reserved for the literal
// Harvesting phase (spec §3).
const QualityBadge = styled.span<{ $grade: QualityGrade }>`
  ${monoLabel}
  display: inline-block;
  padding: 4px 12px;
  border-radius: 99px;
  font-size: 0.68rem;
  background: ${({ $grade, theme }) => {
    switch ($grade) {
      case 'A':
        return theme.colors.phase.fruiting;
      case 'B':
        return theme.colors.phase.fruitingInit;
      case 'C':
        return theme.colors.phase.quarantined;
      default:
        return theme.colors.phase.empty;
    }
  }};
  color: ${({ theme }) => theme.colors.onDark};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

// Modal styles — Night Observatory modal recipe (spec §4 "Modals/drawers").
const Overlay = styled.div`
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

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 32px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 24px 0;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

// Destructive: coral-tinted glass, never solid red (spec §4 "Buttons").
const DeleteButton = styled.button`
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.4);

  &:hover:not(:disabled) {
    background: rgba(240, 138, 112, 0.26);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ConfirmModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ConfirmText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  line-height: 1.5;
`;

const ConfirmHighlight = styled.div`
  padding: 12px;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Destructive: coral-tinted glass, never solid red (spec §4 "Buttons").
const DangerButton = styled.button`
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: 1px solid rgba(240, 138, 112, 0.45);
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};

  &:hover:not(:disabled) {
    background: rgba(240, 138, 112, 0.28);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const VirtualBlockInfoBanner = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid rgba(107, 138, 224, 0.3);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
`;

const BannerTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onDark};
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const BannerText = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.onDark};
  line-height: 1.5;
`;

const ViewHistoryLink = styled.button`
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 12px;
  transition: transform 150ms ease;

  &:hover {
    transform: translateY(-1px);
  }
`;

const PhysicalBlockBanner = styled.div`
  background: ${({ theme }) => theme.colors.successBg};
  border: 1px solid rgba(84, 211, 155, 0.3);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
`;

const PhysicalBannerTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onDark};
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface BlockHarvestsTabProps {
  farmId: string;
  blockId: string;
  blockCategory?: 'physical' | 'virtual';
  parentBlockId?: string;
  plantedDate?: string;
  onRefresh?: () => void;
  onNavigateToBlock?: (blockId: string) => void;
}

export function BlockHarvestsTab({ farmId, blockId, blockCategory, parentBlockId, plantedDate, onRefresh, onNavigateToBlock }: BlockHarvestsTabProps) {
  const theme = useTheme();
  const isVirtualBlock = blockCategory === 'virtual';
  const [harvests, setHarvests] = useState<BlockHarvest[]>([]);
  const [summary, setSummary] = useState<BlockHarvestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [harvestToDelete, setHarvestToDelete] = useState<BlockHarvest | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Plant Library product extension Stage 4 (design doc §7) — reviews a
  // mixed multi-line submission (sellable + process + waste) as a unit.
  const [showBatchLookup, setShowBatchLookup] = useState(false);

  // Farming year filter state
  const [selectedFarmingYear, setSelectedFarmingYear] = useState<number | null>(null);
  const [availableFarmingYears, setAvailableFarmingYears] = useState<FarmingYearItem[]>([]);
  const [loadingFarmingYears, setLoadingFarmingYears] = useState(false);

  // Load available farming years when farmId changes
  useEffect(() => {
    const loadFarmingYears = async () => {
      if (!farmId) {
        setAvailableFarmingYears([]);
        return;
      }
      try {
        setLoadingFarmingYears(true);
        const response = await getAvailableFarmingYears(farmId);
        setAvailableFarmingYears(response.years || []);
        // Default to current year if available and no year selected
        if (selectedFarmingYear === null && response.currentFarmingYear) {
          setSelectedFarmingYear(response.currentFarmingYear);
        }
      } catch (error) {
        console.error('Error loading farming years:', error);
        setAvailableFarmingYears([]);
      } finally {
        setLoadingFarmingYears(false);
      }
    };
    loadFarmingYears();
  }, [farmId]);

  // Load harvests when farmId, blockId, or farmingYear changes
  useEffect(() => {
    loadHarvests();
  }, [farmId, blockId, selectedFarmingYear]);

  const loadHarvests = async () => {
    try {
      setLoading(true);
      const [harvestsResponse, summaryData] = await Promise.all([
        farmApi.getBlockHarvests(farmId, blockId, 1, 100, selectedFarmingYear),
        farmApi.getBlockHarvestSummary(farmId, blockId, selectedFarmingYear).catch(() => null),
      ]);
      setHarvests(harvestsResponse.items);
      setSummary(summaryData);
    } catch (err) {
      console.error('Error loading harvests:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get display string for selected farming year context
   */
  const getYearContextDisplay = (): string | null => {
    if (selectedFarmingYear === null) {
      return null;
    }
    const yearItem = availableFarmingYears.find((y) => y.year === selectedFarmingYear);
    return yearItem?.display || `Year ${selectedFarmingYear}`;
  };

  const handleDeleteHarvest = async () => {
    if (!harvestToDelete) return;

    try {
      setDeleting(true);
      await farmApi.deleteBlockHarvest(farmId, blockId, harvestToDelete.harvestId);
      await loadHarvests();
      onRefresh?.();
      setHarvestToDelete(null);
    } catch (err) {
      console.error('Error deleting harvest:', err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState>Loading harvests...</LoadingState>;
  }

  // Handle navigation to parent physical block for full history
  const handleViewFullHistory = () => {
    if (parentBlockId && onNavigateToBlock) {
      onNavigateToBlock(parentBlockId);
    }
  };

  return (
    <Container>
      {/* Virtual Block Info Banner */}
      {isVirtualBlock && (
        <VirtualBlockInfoBanner>
          <BannerTitle>
            <Sprout size={16} strokeWidth={1.8} /> Current Crop Cycle Harvests
          </BannerTitle>
          <BannerText>
            This virtual block shows harvests from the current crop cycle only
            {plantedDate && ` (since ${farmApi.formatDateForDisplay(plantedDate)})`}.
            Historical harvests from previous cycles are stored in the parent physical block.
          </BannerText>
          {parentBlockId && onNavigateToBlock && (
            <ViewHistoryLink onClick={handleViewFullHistory}>
              View Full Harvest History
            </ViewHistoryLink>
          )}
        </VirtualBlockInfoBanner>
      )}

      {/* Physical Block Info Banner */}
      {blockCategory === 'physical' && (
        <PhysicalBlockBanner>
          <PhysicalBannerTitle>
            <BarChart3 size={16} strokeWidth={1.8} /> Complete Harvest History
          </PhysicalBannerTitle>
          <BannerText style={{ color: theme.colors.onDark }}>
            This physical block displays all historical harvests across all crop cycles and virtual blocks.
          </BannerText>
        </PhysicalBlockBanner>
      )}

      <Header>
        <HeaderLeft>
          <Title>{harvests.length} Total Harvests</Title>
          {getYearContextDisplay() && (
            <FarmingYearContext>
              Showing: {getYearContextDisplay()}
            </FarmingYearContext>
          )}
        </HeaderLeft>
        <HeaderControls>
          <Button type="button" $variant="secondary" onClick={() => setShowBatchLookup(true)}>
            <ListFilter size={14} strokeWidth={1.8} />
            Batch Lookup
          </Button>
          <FarmingYearSelector
            selectedYear={selectedFarmingYear}
            availableYears={availableFarmingYears}
            onYearChange={setSelectedFarmingYear}
            showAllOption={true}
            label=""
            isLoading={loadingFarmingYears}
            compact={true}
          />
        </HeaderControls>
      </Header>

      {summary && (
        <SummaryGrid>
          <SummaryCard>
            <SummaryLabel>Total Harvests</SummaryLabel>
            <SummaryValue>{formatNumber(summary.totalHarvests)}</SummaryValue>
            <SummarySubtext>recorded events</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Total Yield</SummaryLabel>
            <SummaryValue>{formatNumber(summary.totalQuantityKg, { decimals: 1 })}</SummaryValue>
            <SummarySubtext>kg harvested</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Average Quality</SummaryLabel>
            <SummaryValue>{summary.averageQuality || 'N/A'}</SummaryValue>
            {summary.qualityBreakdown && (
              <SummarySubtext>
                A: {summary.qualityBreakdown.A} | B: {summary.qualityBreakdown.B} | C: {summary.qualityBreakdown.C}
              </SummarySubtext>
            )}
          </SummaryCard>

          {summary.lastHarvestDate && (
            <SummaryCard>
              <SummaryLabel>Last Harvest</SummaryLabel>
              <SummaryValue style={{ fontSize: '16px' }}>
                {farmApi.formatDateForDisplay(summary.lastHarvestDate)}
              </SummaryValue>
              <SummarySubtext>{farmApi.getRelativeTime(summary.lastHarvestDate)}</SummarySubtext>
            </SummaryCard>
          )}
        </SummaryGrid>
      )}

      {harvests.length === 0 ? (
        <EmptyState>
          <p>No harvests recorded yet</p>
          <p>Record your first harvest to start tracking yield</p>
        </EmptyState>
      ) : (
        <HarvestsList>
          {harvests.map((harvest) => (
            <HarvestCard key={harvest.harvestId}>
              <HarvestInfo>
                <HarvestDate>
                  {farmApi.formatDateForDisplay(harvest.harvestDate)}
                  {harvest.metadata?.crop && <span style={{ fontWeight: 400, marginLeft: 8, color: theme.colors.success }}>({harvest.metadata.crop})</span>}
                </HarvestDate>
                <HarvestMeta>
                  <ProductName>{harvest.productName ?? 'Unspecified'}</ProductName>
                  <span>•</span>
                  <span>{formatNumber(harvest.quantityKg, { decimals: 1 })} kg</span>
                  <span>•</span>
                  <span>
                    <QualityBadge $grade={harvest.qualityGrade}>Grade {harvest.qualityGrade}</QualityBadge>
                  </span>
                  {harvest.recordedByEmail && (
                    <>
                      <span>•</span>
                      <span>by {harvest.recordedByEmail}</span>
                    </>
                  )}
                </HarvestMeta>
                {harvest.notes && <HarvestMeta>{harvest.notes}</HarvestMeta>}
              </HarvestInfo>
              <DeleteButton onClick={() => setHarvestToDelete(harvest)}>
                Delete
              </DeleteButton>
            </HarvestCard>
          ))}
        </HarvestsList>
      )}

      {/* Delete Confirmation Modal */}
      {harvestToDelete && (
        <Overlay>
          <Modal>
            <ModalTitle>Delete Harvest Record</ModalTitle>
            <ConfirmModalContent>
              <ConfirmText>
                Are you sure you want to delete this harvest record? This action cannot be undone.
              </ConfirmText>
              <ConfirmHighlight>
                <strong>{farmApi.formatDateForDisplay(harvestToDelete.harvestDate)}</strong>
                {harvestToDelete.metadata?.crop && ` (${harvestToDelete.metadata.crop})`}
                <br />
                {formatNumber(harvestToDelete.quantityKg, { decimals: 1 })} kg - Grade {harvestToDelete.qualityGrade}
              </ConfirmHighlight>
              <ButtonGroup>
                <Button type="button" onClick={() => setHarvestToDelete(null)} disabled={deleting}>
                  Cancel
                </Button>
                <DangerButton onClick={handleDeleteHarvest} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </DangerButton>
              </ButtonGroup>
            </ConfirmModalContent>
          </Modal>
        </Overlay>
      )}

      {showBatchLookup && (
        <BlockHarvestBatchLookupModal
          farmId={farmId}
          blockId={blockId}
          onClose={() => setShowBatchLookup(false)}
        />
      )}
    </Container>
  );
}

