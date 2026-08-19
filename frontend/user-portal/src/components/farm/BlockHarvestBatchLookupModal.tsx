/**
 * Block Harvest Batch Lookup Modal
 *
 * Plant Library product extension Stage 4 (design doc §7). The default
 * harvest list (BlockHarvestsTab) stays cheap — it reads block_harvests, so
 * it only ever shows sellable rows. To review a mixed multi-line submission
 * (sellable + process + waste lines sharing one harvestBatchId), the user
 * filters by block + harvest date here; this unions all three destinations
 * (block_harvests, processing_inventory, inventory_waste) via
 * GET .../harvests/batch-lookup and groups the result by harvestBatchId — a
 * block can have more than one submission on the same date, which is why
 * the response is `batches[]` rather than a flat line list.
 *
 * Read-only: no batch edit/delete endpoint exists yet, so this is a lookup
 * view only.
 *
 * Reuses the shared genetics Modal shell (already adopted across
 * farm/mushroom/protocols/tutorials) rather than hand-rolling another
 * Overlay/Panel pair — this modal has no hover-driven parent state to guard
 * against, so its lack of backdrop-click support is exactly what's wanted.
 */

import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { Modal } from '../genetics/Modal';
import { useHarvestBatchLookup } from '../../hooks/queries/useHarvestBatch';
import { CATEGORY_LABELS, DESTINATION_LABELS, getCategoryColor } from '../../utils/harvestCategory';
import { formatNumber } from '../../utils';

interface BlockHarvestBatchLookupModalProps {
  farmId: string;
  blockId: string;
  onClose: () => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function BlockHarvestBatchLookupModal({
  farmId,
  blockId,
  onClose,
}: BlockHarvestBatchLookupModalProps) {
  const theme = useTheme();
  const [harvestDate, setHarvestDate] = useState(todayIsoDate());

  const { data, isLoading, isError, error } = useHarvestBatchLookup(farmId, blockId, harvestDate);
  const batches = data?.batches ?? [];

  const axiosErr = error as { response?: { data?: { detail?: string; message?: string } } } | null;
  const errorDetail =
    axiosErr?.response?.data?.detail ??
    axiosErr?.response?.data?.message ??
    'Failed to load the batch lookup.';

  return (
    <Modal
      title="Batch Lookup"
      subtitle="Review every sellable, process, and waste line recorded for this block on a date."
      width="640px"
      onClose={onClose}
    >
      <FormGroup>
        <Label htmlFor="batch-lookup-date">Harvest Date</Label>
        <DateInput
          id="batch-lookup-date"
          type="date"
          value={harvestDate}
          onChange={(e) => setHarvestDate(e.target.value)}
        />
      </FormGroup>

      {isLoading && <StateNote>Loading…</StateNote>}

      {isError && <StateNote $error>{errorDetail}</StateNote>}

      {!isLoading && !isError && batches.length === 0 && (
        <StateNote>No harvest lines recorded for this block on {harvestDate}.</StateNote>
      )}

      {!isLoading && !isError && batches.length > 0 && (
        <BatchList>
          {batches.map((group, groupIndex) => (
            <BatchGroupCard key={group.harvestBatchId ?? `legacy-${groupIndex}`}>
              <BatchGroupHeader>
                <BatchGroupTitle>
                  {group.harvestBatchId
                    ? `Submission ${group.harvestBatchId.slice(0, 8)}`
                    : 'Legacy lines (no batch group)'}
                </BatchGroupTitle>
                <BatchGroupCount>
                  {group.lines.length} line{group.lines.length === 1 ? '' : 's'}
                </BatchGroupCount>
              </BatchGroupHeader>

              <LineList>
                {group.lines.map((line) => (
                  <LineRow key={line.recordId}>
                    <LineMain>
                      <LineProduct>{line.productName ?? 'Unspecified'}</LineProduct>
                      <LineQty>
                        {formatNumber(line.quantity, { decimals: 2 })} {line.unit}
                        {line.qualityGrade ? ` · Grade ${line.qualityGrade}` : ''}
                      </LineQty>
                    </LineMain>
                    <LineDestination $color={getCategoryColor(theme, line.category)}>
                      {CATEGORY_LABELS[line.category]} — {DESTINATION_LABELS[line.category]}
                    </LineDestination>
                  </LineRow>
                ))}
              </LineList>
            </BatchGroupCard>
          ))}
        </BatchList>
      )}
    </Modal>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Label = styled.label`
  ${monoLabel}
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const DateInput = styled.input`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  max-width: 220px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const StateNote = styled.div<{ $error?: boolean }>`
  ${monoLabel}
  font-size: 0.7rem;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg} 0;
  color: ${({ theme, $error }) => ($error ? theme.colors.bright.coral : theme.colors.muted)};
`;

const BatchList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const BatchGroupCard = styled.div`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const BatchGroupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const BatchGroupTitle = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.8rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const BatchGroupCount = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const LineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const LineRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${({ theme }) => theme.spacing.sm};
  background: rgba(180, 200, 220, 0.05);
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  @media (min-width: 480px) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: ${({ theme }) => theme.spacing.md};
  }
`;

const LineMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const LineProduct = styled.span`
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const LineQty = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const LineDestination = styled.span<{ $color: string }>`
  font-size: 0.72rem;
  font-weight: 600;
  color: ${({ $color }) => $color};
  flex-shrink: 0;
`;
