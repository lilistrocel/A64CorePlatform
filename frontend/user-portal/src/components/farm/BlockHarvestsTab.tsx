/**
 * BlockHarvestsTab Component
 *
 * Displays and manages harvest records for a block.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { BlockHarvest, BlockHarvestCreate, BlockHarvestSummary, QualityGrade } from '../../types/farm';

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

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) =>
    $variant === 'primary'
      ? `
    background: #3b82f6;
    color: white;
    &:hover:not(:disabled) {
      background: #2563eb;
    }
  `
      : `
    background: transparent;
    color: #616161;
    border: 1px solid #e0e0e0;
    &:hover:not(:disabled) {
      background: #f5f5f5;
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

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

const HarvestsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const HarvestCard = styled.div`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
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
  font-weight: 600;
  color: #212121;
`;

const HarvestMeta = styled.div`
  font-size: 14px;
  color: #616161;
  display: flex;
  gap: 12px;
`;

const QualityBadge = styled.span<{ $grade: QualityGrade }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $grade }) => {
    switch ($grade) {
      case 'A':
        return '#10b981';
      case 'B':
        return '#eab308';
      case 'C':
        return '#f97316';
      default:
        return '#9e9e9e';
    }
  }};
  color: white;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #9e9e9e;
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #9e9e9e;
`;

// Modal styles
const Overlay = styled.div`
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

const Modal = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 24px 0;
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
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const Input = styled.input`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const Textarea = styled.textarea`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  font-family: inherit;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const Select = styled.select`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

const ErrorMessage = styled.div`
  padding: 12px;
  background: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  color: #ef4444;
  font-size: 14px;
`;

const HelpText = styled.p`
  font-size: 12px;
  color: #9e9e9e;
  margin: 0;
`;

const DeleteButton = styled.button`
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: transparent;
  color: #ef4444;
  border: 1px solid #ef4444;

  &:hover:not(:disabled) {
    background: #fee2e2;
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
  color: #616161;
  margin: 0;
  line-height: 1.5;
`;

const ConfirmHighlight = styled.div`
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  color: #212121;
`;

const DangerButton = styled.button`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;
  background: #ef4444;
  color: white;

  &:hover:not(:disabled) {
    background: #dc2626;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const VirtualBlockInfoBanner = styled.div`
  background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
  border: 1px solid #93c5fd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
`;

const BannerTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #1e40af;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const BannerText = styled.div`
  font-size: 13px;
  color: #3b82f6;
  line-height: 1.5;
`;

const ViewHistoryLink = styled.button`
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 12px;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #2563eb;
  }
`;

const PhysicalBlockBanner = styled.div`
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border: 1px solid #6ee7b7;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
`;

const PhysicalBannerTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #065f46;
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
  const isVirtualBlock = blockCategory === 'virtual';
  const [harvests, setHarvests] = useState<BlockHarvest[]>([]);
  const [summary, setSummary] = useState<BlockHarvestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [harvestToDelete, setHarvestToDelete] = useState<BlockHarvest | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadHarvests();
  }, [farmId, blockId]);

  const loadHarvests = async () => {
    try {
      setLoading(true);
      const [harvestsResponse, summaryData] = await Promise.all([
        farmApi.getBlockHarvests(farmId, blockId, 1, 100),
        farmApi.getBlockHarvestSummary(farmId, blockId).catch(() => null),
      ]);
      setHarvests(harvestsResponse.items);
      setSummary(summaryData);
    } catch (err) {
      console.error('Error loading harvests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordHarvest = async (data: BlockHarvestCreate) => {
    try {
      await farmApi.recordBlockHarvest(farmId, blockId, data);
      await loadHarvests();
      onRefresh?.();
      setShowRecordModal(false);
    } catch (err) {
      throw err;
    }
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
            <span>&#x1F331;</span> Current Crop Cycle Harvests
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
            <span>&#x1F4CA;</span> Complete Harvest History
          </PhysicalBannerTitle>
          <BannerText style={{ color: '#047857' }}>
            This physical block displays all historical harvests across all crop cycles and virtual blocks.
          </BannerText>
        </PhysicalBlockBanner>
      )}

      <Header>
        <Title>{harvests.length} Total Harvests</Title>
        <Button $variant="primary" onClick={() => setShowRecordModal(true)}>
          + Record Harvest
        </Button>
      </Header>

      {summary && (
        <SummaryGrid>
          <SummaryCard>
            <SummaryLabel>Total Harvests</SummaryLabel>
            <SummaryValue>{summary.totalHarvests}</SummaryValue>
            <SummarySubtext>recorded events</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Total Yield</SummaryLabel>
            <SummaryValue>{summary.totalQuantityKg.toFixed(1)}</SummaryValue>
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
                  {harvest.metadata?.crop && <span style={{ fontWeight: 400, marginLeft: 8, color: '#4caf50' }}>({harvest.metadata.crop})</span>}
                </HarvestDate>
                <HarvestMeta>
                  <span>{harvest.quantityKg} kg</span>
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

      {/* Record Harvest Modal */}
      {showRecordModal && (
        <RecordHarvestModal blockId={blockId} onClose={() => setShowRecordModal(false)} onRecord={handleRecordHarvest} />
      )}

      {/* Delete Confirmation Modal */}
      {harvestToDelete && (
        <Overlay onClick={(e) => e.target === e.currentTarget && !deleting && setHarvestToDelete(null)}>
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
                {harvestToDelete.quantityKg} kg - Grade {harvestToDelete.qualityGrade}
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
    </Container>
  );
}

// ============================================================================
// RECORD HARVEST MODAL
// ============================================================================

interface RecordHarvestModalProps {
  blockId: string;
  onClose: () => void;
  onRecord: (data: BlockHarvestCreate) => Promise<void>;
}

function RecordHarvestModal({ blockId, onClose, onRecord }: RecordHarvestModalProps) {
  const [formData, setFormData] = useState({
    harvestDate: new Date().toISOString().split('T')[0],
    quantityKg: '',
    qualityGrade: 'A' as QualityGrade,
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const quantity = parseFloat(formData.quantityKg);
    if (isNaN(quantity) || quantity <= 0) {
      setError('Quantity must be a positive number');
      return;
    }

    try {
      setLoading(true);
      // Convert date to ISO datetime string (backend expects datetime, not just date)
      const harvestDateTime = `${formData.harvestDate}T00:00:00Z`;
      await onRecord({
        blockId,
        harvestDate: harvestDateTime,
        quantityKg: quantity,
        qualityGrade: formData.qualityGrade,
        notes: formData.notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record harvest');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Modal>
        <ModalTitle>Record Harvest</ModalTitle>
        <Form onSubmit={handleSubmit}>
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <FormGroup>
            <Label htmlFor="harvestDate">Harvest Date *</Label>
            <Input
              id="harvestDate"
              type="date"
              value={formData.harvestDate}
              onChange={(e) => setFormData({ ...formData, harvestDate: e.target.value })}
              max={new Date().toISOString().split('T')[0]}
              required
            />
            <HelpText>Date when the harvest was collected</HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="quantityKg">Quantity (kg) *</Label>
            <Input
              id="quantityKg"
              type="number"
              step="0.1"
              min="0.1"
              value={formData.quantityKg}
              onChange={(e) => setFormData({ ...formData, quantityKg: e.target.value })}
              placeholder="e.g., 25.5"
              required
            />
            <HelpText>Total weight harvested in kilograms</HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="qualityGrade">Quality Grade *</Label>
            <Select
              id="qualityGrade"
              value={formData.qualityGrade}
              onChange={(e) => setFormData({ ...formData, qualityGrade: e.target.value as QualityGrade })}
              required
            >
              <option value="A">Grade A - Premium Quality</option>
              <option value="B">Grade B - Good Quality</option>
              <option value="C">Grade C - Standard Quality</option>
            </Select>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes about this harvest..."
            />
          </FormGroup>

          <ButtonGroup>
            <Button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={loading}>
              {loading ? 'Recording...' : 'Record Harvest'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
}
