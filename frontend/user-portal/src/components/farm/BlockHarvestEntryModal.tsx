/**
 * Block Harvest Entry Modal
 *
 * Modal for recording a block-level multi-line harvest submission (Plant
 * Library product extension Stage 4, design doc §5). One submission -> N
 * product lines, each resolved LIVE from the block's mother
 * (`block.productMotherId` -> `plant_mothers.products[]`, filtered to
 * `isActive`) and routed server-side by its product's category:
 *
 *   sellable -> block_harvests (counted in KPI/yield)
 *   process  -> processing_inventory
 *   waste    -> inventory_waste directly (excluded from KPI/yield)
 *
 * All lines share one server-generated harvestBatchId. One bad line rejects
 * the WHOLE submission — nothing is written partially (design doc §3/§5).
 *
 * Retires the old single-grade "Waste" pseudo-grade toggle and its direct
 * `POST /v1/farm/inventory/waste` write path — waste is now just a product
 * line whose category happens to be `waste`.
 */

import { useMemo, useRef, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { CheckCircle2, MapPin, Package, Plus, Sprout, Trash2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, hexToRgba } from '@a64core/shared';
import type { Theme } from '@a64core/shared';
import { useBlock } from '../../hooks/queries/useBlocks';
import { useProductsForMother } from '../../hooks/queries/usePlantMothers';
import { useSubmitHarvestBatch } from '../../hooks/queries/useHarvestBatch';
import type {
  HarvestBatchLineCreate,
  HarvestBatchLineResult,
  HarvestBatchSubmitResponse,
  ProductCategory,
  QualityGrade,
} from '../../types/farm';
import { positiveNumberInputProps } from '../../utils';
import { CATEGORY_LABELS, DESTINATION_LABELS, getCategoryColor } from '../../utils/harvestCategory';

interface BlockHarvestEntryModalProps {
  isOpen: boolean;
  farmId: string;
  blockId: string;
  blockCode: string;
  blockName?: string | null;
  /** Crop (variety) planted in this block (omit if unknown). */
  targetCropName?: string | null;
  /** Plant count currently on the block. */
  actualPlantCount?: number | null;
  /** Predicted total yield for this cycle (kg). */
  predictedYieldKg?: number | null;
  /** Actual yield already collected across prior harvests (kg). */
  actualYieldKg?: number | null;
  /** Number of harvest records already submitted in the current cycle. */
  totalHarvests?: number | null;
  onClose: () => void;
  onComplete: () => void;
}

const GRADE_OPTIONS: QualityGrade[] = ['A', 'B', 'C'];

const GRADE_LABELS: Record<QualityGrade, string> = {
  A: 'Premium',
  B: 'Good',
  C: 'Standard',
};

function getGradeColor(theme: Theme, grade: QualityGrade): string {
  const map: Record<QualityGrade, string> = {
    A: theme.colors.phase.fruiting,
    B: theme.colors.phase.inoculated,
    C: theme.colors.phase.fruitingInit,
  };
  return map[grade];
}

/** One draft line in the form, before submission. */
interface LineDraft {
  key: string;
  productId: string;
  quantityKg: string;
  qualityGrade: QualityGrade | '';
}

function emptyLine(key: string): LineDraft {
  return { key, productId: '', quantityKg: '', qualityGrade: '' };
}

export function BlockHarvestEntryModal({
  isOpen,
  farmId,
  blockId,
  blockCode,
  blockName,
  targetCropName,
  actualPlantCount,
  predictedYieldKg,
  actualYieldKg,
  totalHarvests,
  onClose,
  onComplete,
}: BlockHarvestEntryModalProps) {
  const theme = useTheme();
  const lineKeyCounter = useRef(0);
  const nextLineKey = () => `line-${lineKeyCounter.current++}`;

  const [lines, setLines] = useState<LineDraft[]>([emptyLine(nextLineKey())]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HarvestBatchSubmitResponse | null>(null);
  const submittingRef = useRef(false);

  // Live product picklist, resolved from the block's mother (design doc §5:
  // "read LIVE from the mother, not snapshotted"). Filtered to isActive.
  const { data: block, isLoading: blockLoading } = useBlock(farmId, blockId);
  const motherId = block?.productMotherId ?? undefined;
  const {
    data: products = [],
    isLoading: productsLoading,
  } = useProductsForMother(motherId, true);
  const submitBatch = useSubmitHarvestBatch();

  const productsById = useMemo(() => new Map(products.map((p) => [p.productId, p])), [products]);

  if (!isOpen) return null;

  const hasMother = !!motherId;
  const loadingPicklist = blockLoading || (hasMother && productsLoading);
  const noActiveProducts = hasMother && !productsLoading && products.length === 0;

  const handleAddLine = () => {
    setLines((prev) => [...prev, emptyLine(nextLineKey())]);
    setError(null);
  };

  const handleRemoveLine = (key: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  };

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Switching to a waste product clears any grade already chosen —
        // the server rejects a waste line that supplies one.
        if (patch.productId !== undefined) {
          const category = productsById.get(patch.productId)?.category;
          if (category === 'waste') next.qualityGrade = '';
        }
        return next;
      })
    );
    setError(null);
  };

  const buildPayloadLines = (): HarvestBatchLineCreate[] | null => {
    for (const line of lines) {
      if (!line.productId) return null;
      const qty = parseFloat(line.quantityKg);
      if (isNaN(qty) || qty <= 0) return null;
      const category = productsById.get(line.productId)?.category;
      if (category !== 'waste' && !line.qualityGrade) return null;
    }
    return lines.map((line) => {
      const category = productsById.get(line.productId)?.category;
      const payloadLine: HarvestBatchLineCreate = {
        productId: line.productId,
        quantity: parseFloat(line.quantityKg),
      };
      if (category !== 'waste' && line.qualityGrade) {
        payloadLine.qualityGrade = line.qualityGrade;
      }
      return payloadLine;
    });
  };

  const payloadLines = buildPayloadLines();
  const isFormValid = payloadLines !== null && !loadingPicklist && !noActiveProducts;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payloadLines) {
      setError('Fill in every line: product, quantity, and grade (where required).');
      return;
    }

    // Synchronous ref guard prevents concurrent submissions (double-click protection).
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setError(null);
      const response = await submitBatch.mutateAsync({
        farmId,
        blockId,
        data: {
          harvestDate: new Date().toISOString(),
          lines: payloadLines,
        },
      });
      // Swap to a results view showing what landed where, rather than
      // closing immediately — a mixed submission's destinations are exactly
      // what the user needs confirmed (design doc §5).
      setResult(response);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; detail?: string } } };
      const errorMessage =
        axiosErr?.response?.data?.detail ||
        axiosErr?.response?.data?.message ||
        'Failed to record harvest. Nothing was saved — please try again.';
      setError(errorMessage);
    } finally {
      submittingRef.current = false;
    }
  };

  const handleDone = () => {
    onComplete();
  };

  return (
    // Overlay intentionally has NO onClick — data-entry modal must close only
    // via the X button or Cancel button (standing project UX rule).
    <Overlay
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
    >
      <Modal
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        <Header>
          <Title>{result ? 'Harvest Recorded' : 'Harvest Entry'}</Title>
          <CloseButton type="button" onClick={onClose} aria-label="Close modal">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </Header>

        <Content>
          {/* Block/crop identity card — always visible */}
          <BlockInfo>
            <BlockLine>
              <LineIcon aria-hidden="true"><MapPin size={14} strokeWidth={1.8} /></LineIcon>
              <BlockIdentity>
                {blockCode}
                {blockName && <BlockNameInline> — {blockName}</BlockNameInline>}
              </BlockIdentity>
            </BlockLine>

            {targetCropName && (
              <CropLine>
                <LineIcon aria-hidden="true"><Sprout size={14} strokeWidth={1.8} /></LineIcon>
                <CropName>{targetCropName}</CropName>
              </CropLine>
            )}

            {(actualPlantCount || predictedYieldKg) && (
              <ChipRow>
                {actualPlantCount ? (
                  <Chip>{actualPlantCount.toLocaleString('en-US')} plants</Chip>
                ) : null}
                {predictedYieldKg ? (
                  <Chip>Target: {predictedYieldKg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg</Chip>
                ) : null}
              </ChipRow>
            )}

            {!!totalHarvests && totalHarvests > 0 && (
              <ChipRow>
                <Chip $variant="progress">
                  {totalHarvests.toLocaleString('en-US')} harvest{totalHarvests === 1 ? '' : 's'} so far
                </Chip>
                {actualYieldKg ? (
                  <Chip $variant="progress">
                    {actualYieldKg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg collected
                  </Chip>
                ) : null}
              </ChipRow>
            )}
          </BlockInfo>

          {result ? (
            <ResultView result={result} onDone={handleDone} theme={theme} />
          ) : (
            <Form onSubmit={handleSubmit}>
              {!blockLoading && !hasMother && (
                <ErrorMessage role="alert">
                  This block has no linked product — an admin needs to assign it a mother
                  plant before harvests can be recorded here.
                </ErrorMessage>
              )}

              {noActiveProducts && (
                <ErrorMessage role="alert">
                  This block's mother plant has no active products to harvest. Add or
                  reactivate a product in the Plant Library first.
                </ErrorMessage>
              )}

              {loadingPicklist && <LoadingNote>Loading product list…</LoadingNote>}

              {hasMother && !noActiveProducts && (
                <>
                  <LinesList>
                    {lines.map((line, index) => {
                      const product = line.productId ? productsById.get(line.productId) : undefined;
                      return (
                        <LineRow key={line.key}>
                          <LineRowHeader>
                            <LineIndex>Line {index + 1}</LineIndex>
                            <RemoveLineButton
                              type="button"
                              onClick={() => handleRemoveLine(line.key)}
                              disabled={lines.length === 1}
                              aria-label={`Remove line ${index + 1}`}
                            >
                              <Trash2 size={14} strokeWidth={1.8} />
                            </RemoveLineButton>
                          </LineRowHeader>

                          <FormGroup>
                            <Label htmlFor={`product-${line.key}`}>Product *</Label>
                            <Select
                              id={`product-${line.key}`}
                              value={line.productId}
                              onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                              disabled={loadingPicklist}
                              required
                            >
                              <option value="">Select product…</option>
                              {products.map((p) => (
                                <option key={p.productId} value={p.productId}>
                                  {p.name}
                                </option>
                              ))}
                            </Select>
                            {product && (
                              <CategoryNote $color={getCategoryColor(theme, product.category)}>
                                {CATEGORY_LABELS[product.category]} — {DESTINATION_LABELS[product.category]}
                              </CategoryNote>
                            )}
                          </FormGroup>

                          <FormGroup>
                            <Label htmlFor={`quantity-${line.key}`}>Quantity (kg) *</Label>
                            <Input
                              id={`quantity-${line.key}`}
                              {...positiveNumberInputProps}
                              step="0.01"
                              min="0.01"
                              value={line.quantityKg}
                              onChange={(e) => updateLine(line.key, { quantityKg: e.target.value })}
                              placeholder="Enter quantity in kg"
                              required
                            />
                          </FormGroup>

                          {product && product.category !== 'waste' && (
                            <FormGroup>
                              <Label>Quality Grade *</Label>
                              <GradeGrid>
                                {GRADE_OPTIONS.map((grade) => (
                                  <GradeButton
                                    key={grade}
                                    type="button"
                                    $selected={line.qualityGrade === grade}
                                    $color={getGradeColor(theme, grade)}
                                    onClick={() => updateLine(line.key, { qualityGrade: grade })}
                                    aria-pressed={line.qualityGrade === grade}
                                  >
                                    <GradeIcon>{grade}</GradeIcon>
                                    <GradeLabel>{GRADE_LABELS[grade]}</GradeLabel>
                                  </GradeButton>
                                ))}
                              </GradeGrid>
                            </FormGroup>
                          )}

                          {product && product.category === 'waste' && (
                            <GradeNote $warn>Waste lines are not graded</GradeNote>
                          )}
                        </LineRow>
                      );
                    })}
                  </LinesList>

                  <AddLineButton type="button" onClick={handleAddLine}>
                    <Plus size={16} strokeWidth={2} />
                    Add product line
                  </AddLineButton>
                </>
              )}

              {error && <ErrorMessage role="alert">{error}</ErrorMessage>}

              <ButtonGroup>
                <CancelButton type="button" onClick={onClose} disabled={submitBatch.isPending}>
                  Cancel
                </CancelButton>
                <SubmitButton type="submit" disabled={!isFormValid || submitBatch.isPending}>
                  {submitBatch.isPending ? 'Recording…' : 'Record Harvest'}
                </SubmitButton>
              </ButtonGroup>
            </Form>
          )}
        </Content>
      </Modal>
    </Overlay>
  );
}

// ============================================================================
// RESULT VIEW — reports what landed where, per line, using the server
// response's `destination` (design doc §5: "surface that clearly")
// ============================================================================

const DESTINATION_ICONS: Record<ProductCategory, LucideIcon> = {
  sellable: CheckCircle2,
  process: Package,
  waste: Trash2,
};

function ResultView({
  result,
  onDone,
  theme,
}: {
  result: HarvestBatchSubmitResponse;
  onDone: () => void;
  theme: Theme;
}) {
  return (
    <ResultContainer>
      <ResultLead>
        {result.lines.length} line{result.lines.length === 1 ? '' : 's'} recorded from this submission.
      </ResultLead>
      <ResultList>
        {result.lines.map((line: HarvestBatchLineResult) => {
          const Icon = DESTINATION_ICONS[line.category];
          const color = getCategoryColor(theme, line.category);
          return (
            <ResultRow key={line.recordId}>
              <ResultIcon $color={color}>
                <Icon size={16} strokeWidth={1.8} />
              </ResultIcon>
              <ResultInfo>
                <ResultProductName>{line.productName}</ResultProductName>
                <ResultDestination $color={color}>
                  {line.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} kg
                  {line.qualityGrade ? ` · Grade ${line.qualityGrade}` : ''} → {CATEGORY_LABELS[line.category]}
                  {' · '}
                  {DESTINATION_LABELS[line.category]}
                </ResultDestination>
              </ResultInfo>
            </ResultRow>
          );
        })}
      </ResultList>
      <ButtonGroup>
        <SubmitButton type="button" onClick={onDone}>
          Done
        </SubmitButton>
      </ButtonGroup>
    </ResultContainer>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers"). No onClick on
// Overlay — data-entry modal closes only via the X/Cancel button, unchanged.
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: all 0.2s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-y: auto;
`;

const BlockInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.md};
  background: rgba(180, 200, 220, 0.05);
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border-left: 4px solid ${({ theme }) => theme.colors.bright.emerald}; /* grade-A green: consistent with Operations harvest modal */
`;

const BlockLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const CropLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const LineIcon = styled.span`
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
`;

const BlockIdentity = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const BlockNameInline = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.regular};
  color: ${({ theme }) => theme.colors.muted};
`;

const CropName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-top: 2px;
`;

const Chip = styled.span<{ $variant?: 'progress' }>`
  ${monoLabel}
  display: inline-flex;
  align-items: center;
  padding: 2px ${({ theme }) => theme.spacing.xs};
  background: ${({ $variant }) => ($variant === 'progress' ? 'rgba(84, 211, 155, 0.14)' : 'rgba(180, 200, 220, 0.08)')};
  color: ${({ theme, $variant }) => ($variant === 'progress' ? theme.colors.bright.emerald : theme.colors.muted)};
  font-size: 0.62rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const LoadingNote = styled.div`
  ${monoLabel}
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.md} 0;
`;

const LinesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const LineRow = styled.div`
  ${glassPanel}
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
`;

const LineRowHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const LineIndex = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const RemoveLineButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.bright.coral};
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  transition: background 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(240, 138, 112, 0.14);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
`;

const AddLineButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px dashed ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.secondary[500]};
  }
`;

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

const Input = styled.input`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Select = styled.select`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 0.2s ease;

  option {
    background-color: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const CategoryNote = styled.div<{ $color: string }>`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ $color }) => $color};
  font-weight: 600;
`;

/** 3-column grid to accommodate A / B / C grade chips in a single row. */
const GradeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.sm};
`;

const GradeButton = styled.button<{ $selected: boolean; $color: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 2px solid
    ${({ $selected, $color, theme }) => ($selected ? $color : theme.colors.glass.border)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $selected, $color }) => ($selected ? hexToRgba($color, 0.16) : 'transparent')};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${({ $color }) => $color};
    background: ${({ $color }) => hexToRgba($color, 0.1)};
  }
`;

const GradeIcon = styled.div<{ $color?: string }>`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  margin-bottom: 2px;
  color: ${({ $color, theme }) => $color ?? theme.colors.textPrimary};
`;

const GradeLabel = styled.div`
  ${monoLabel}
  font-size: 0.58rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const GradeNote = styled.div<{ $warn?: boolean }>`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ $warn, theme }) => ($warn ? theme.colors.bright.coral : theme.colors.muted)};
  font-style: italic;
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  text-align: center;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

const CancelButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// The literal "record harvest" action IS the Harvesting phase, so gold is
// spec-sanctioned here (spec §3/§5.1).
const SubmitButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ResultContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const ResultLead = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
`;

const ResultList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ResultRow = styled.div`
  ${glassPanel}
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
`;

const ResultIcon = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  background: ${({ $color }) => hexToRgba($color, 0.16)};
  color: ${({ $color }) => $color};
`;

const ResultInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ResultProductName = styled.div`
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ResultDestination = styled.div<{ $color: string }>`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ $color }) => $color};
`;
