/**
 * PlantDataDetail Component
 *
 * Modal displaying comprehensive plant data with all 13 field groups in expandable accordions.
 * Read-only view with action buttons at top.
 */

import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import type { LucideIcon } from 'lucide-react';
import {
  Wheat,
  TreeDeciduous,
  Leaf,
  Apple,
  Carrot,
  Flower2,
  Sprout,
  Pencil,
  Copy,
  Trash2,
  X,
  ChevronRight,
} from 'lucide-react';
import { glassPanel, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import type { PlantDataEnhanced } from '../../types/farm';
import { formatFarmType, getFarmTypeColor } from '../../services/plantDataEnhancedApi';
import { useAuthStore } from '../../stores/auth.store';
import { FertigationScheduleEditorModal } from './FertigationScheduleEditorModal';

// ============================================================================
// PLANT-TYPE ICON MAP (spec §6 — every emoji icon becomes a lucide-react
// line icon)
// ============================================================================

const PLANT_TYPE_ICONS: Record<string, LucideIcon> = {
  crop: Wheat,
  tree: TreeDeciduous,
  herb: Leaf,
  fruit: Apple,
  vegetable: Carrot,
  ornamental: Flower2,
  medicinal: Sprout,
};

function getPlantTypeIcon(plantType: string): LucideIcon {
  return PLANT_TYPE_ICONS[plantType] || Sprout;
}

// ============================================================================
// GROWTH-STAGE -> PHASE MAP (spec §5.2 — "crop stage" is called out by name
// as an extrapolation target for the room-phase vocabulary). `growthStage` is
// free text on a fertigation card, not a strict enum, so this is a best-effort
// keyword match; anything unrecognised falls back to `preparing` rather than
// `empty` since a card with a named (if unfamiliar) stage is not "nothing
// happening."
// ============================================================================

function growthStageToPhase(stage: string): PhaseKey {
  const s = stage.toLowerCase();
  if (s.includes('germinat') || s.includes('seedling')) return 'preparing';
  if (s.includes('veg')) return 'colonizing';
  if (s.includes('flower') || s.includes('bud')) return 'fruitingInit';
  if (s.includes('fruit')) return 'fruiting';
  if (s.includes('harvest')) return 'harvesting';
  if (s.includes('rest') || s.includes('dorman')) return 'resting';
  return 'preparing';
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PlantDataDetailProps {
  plant: PlantDataEnhanced;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onClone?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Called after fertigation schedule is saved so caller can refetch plant data. */
  onSaved?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* Cosmos scrim (spec §4 "Modals/drawers"), not pure black. */
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1100;
  padding: 20px;
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`;

const HeaderLeft = styled.div`
  flex: 1;
`;

const PlantIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 10px;
  flex-shrink: 0;
`;

const PlantName = styled.h2`
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const ScientificName = styled.div`
  font-size: 16px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 8px;
`;

const VersionInfo = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button<{ $variant?: 'edit' | 'clone' | 'delete' | 'close' }>`
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;

  ${({ $variant, theme }) => {
    // Edit is the ONE primary CTA of this detail view (spec §3) — gold
    // gradient fill, cosmos (onAccent) text. Clone/Delete/Close stay off the
    // gold budget so only one gold button is ever on screen at once.
    if ($variant === 'edit') {
      return `
        background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
        color: ${theme.colors.onAccent};
        box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
        }
      `;
    }
    if ($variant === 'clone') {
      // Secondary — glass fill, cream text (spec §4 "Buttons").
      return `
        background: ${theme.colors.glass.base};
        border-color: ${theme.colors.glass.border};
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: ${theme.colors.textPrimary};
        &:hover {
          background: ${theme.colors.glass.hi};
          transform: translateY(-1px);
        }
      `;
    }
    if ($variant === 'delete') {
      // Destructive — coral-tinted glass, never solid red (spec §4 "Buttons").
      return `
        background: ${theme.colors.errorBg};
        border-color: rgba(240, 138, 112, 0.45);
        color: ${theme.colors.error};
        &:hover {
          background: rgba(240, 138, 112, 0.24);
        }
      `;
    }
    // close — ghost icon button
    return `
      background: transparent;
      border-color: ${theme.colors.glass.border};
      color: ${theme.colors.muted};
      &:hover {
        color: ${theme.colors.textPrimary};
        background: rgba(180, 200, 220, 0.07);
      }
    `;
  }}

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px;
`;

const Section = styled.div`
  margin-bottom: 16px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
  overflow: hidden;
`;

const SectionHeader = styled.button<{ $isOpen: boolean }>`
  width: 100%;
  padding: 16px 20px;
  background: ${({ $isOpen }) => ($isOpen ? 'rgba(180, 200, 220, 0.05)' : 'transparent')};
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 150ms ease-in-out;
  font-family: inherit;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  text-align: left;
`;

const SectionIcon = styled.span<{ $isOpen: boolean }>`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  transform: ${({ $isOpen }) => ($isOpen ? 'rotate(90deg)' : 'rotate(0deg)')};
  transition: transform 150ms ease-in-out;
`;

const SectionContent = styled.div<{ $isOpen: boolean }>`
  padding: ${({ $isOpen }) => ($isOpen ? '20px' : '0 20px')};
  max-height: ${({ $isOpen }) => ($isOpen ? '4000px' : '0')};
  overflow: hidden;
  transition: all 300ms ease-in-out;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
`;

const FieldLabel = styled.label`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`;

const FieldValue = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  word-break: break-word;
`;

const BadgeContainer = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

// Dynamic-colour badge — used for farm-type compatibility (a category
// vocabulary, not a status, so it takes an arbitrary colour rather than
// routing through phaseBadge) plus a couple of one-off severity/outcome
// chips. `onDark` (cream) is correct here, never `onAccent` (cosmos is only
// for text on a GOLD fill, spec §1.1) — none of these fills are gold.
const Badge = styled.span<{ $color?: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 700;
  background: ${({ $color, theme }) => $color || theme.colors.glass.base};
  color: ${({ $color, theme }) => ($color ? theme.colors.onDark : theme.colors.celeste)};
`;

const Tag = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
`;

// Nested second glass layer inside the modal (spec §2 two-layer rule) — flat
// tint + line border, no independent blur, so it never stacks a third
// backdrop-filter on top of Modal's own.
const ArrayItem = styled.div`
  padding: 12px;
  background: rgba(180, 200, 220, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  margin: 16px 0;
`;

const EmptyText = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  font-size: 14px;
`;

const RuleCard = styled.div`
  padding: 16px;
  background: rgba(180, 200, 220, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const RuleHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const RuleName = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FrequencyBadge = styled.span`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.infoBg};
  /* Was primary[700] — a step tuned for dark text on a light ground; wrong
     way round on the Night Observatory dark ground, near-illegible on the
     tinted background. bright.lapis is the correct light-on-dark value. */
  color: ${({ theme }) => theme.colors.bright.lapis};
`;

const IngredientRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  font-size: 13px;

  &:last-child {
    border-bottom: none;
  }
`;

const IngredientName = styled.span`
  color: ${({ theme }) => theme.colors.celeste};
`;

const IngredientDosage = styled.span`
  color: ${({ theme }) => theme.colors.celeste};
  font-weight: 700;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

const CardTitle = styled.span`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Growth-stage badge — routed through the room-phase badge pattern via
// growthStageToPhase() (spec §5.2 "crop stage" extrapolation target).
const StageBadge = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
`;

const DayRange = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PlantDataDetail({ plant, onClose, onEdit, onClone, onDelete, onSaved }: PlantDataDetailProps) {
  const theme = useTheme();
  const { user: currentUser } = useAuthStore();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true, // Open by default
  });
  const [showFertigationEditor, setShowFertigationEditor] = useState(false);

  // Roles that can create/edit the fertigation schedule
  const canEditFertigation = ['admin', 'agronomist', 'super_admin', 'moderator'].includes(
    currentUser?.role ?? ''
  );

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const PlantTypeIcon = getPlantTypeIcon(plant.plantType);

  // Reason: Overlay click intentionally NOT wired to onClose — modal must close via X button only.
  return (
    <Overlay>
      <Modal>
        <Header>
          <HeaderLeft>
            <PlantIcon aria-hidden="true">
              <PlantTypeIcon size={28} strokeWidth={1.6} />
            </PlantIcon>
            <PlantName>
              {plant.plantName}
              {plant.varietyName ? ` · ${plant.varietyName}` : ''}
            </PlantName>
            {plant.scientificName && <ScientificName>{plant.scientificName}</ScientificName>}
            <VersionInfo>
              Version {plant.dataVersion} | Created by {plant.createdByEmail} | Last updated:{' '}
              {new Date(plant.updatedAt).toLocaleDateString()}
            </VersionInfo>
          </HeaderLeft>
          <HeaderActions>
            {onEdit && (
              <ActionButton $variant="edit" onClick={() => onEdit(plant.plantDataId)}>
                <Pencil size={15} strokeWidth={1.8} /> Edit
              </ActionButton>
            )}
            {onClone && (
              <ActionButton $variant="clone" onClick={() => onClone(plant.plantDataId)}>
                <Copy size={15} strokeWidth={1.8} /> Clone
              </ActionButton>
            )}
            {onDelete && (
              <ActionButton $variant="delete" onClick={() => onDelete(plant.plantDataId)}>
                <Trash2 size={15} strokeWidth={1.8} /> Delete
              </ActionButton>
            )}
            <ActionButton $variant="close" onClick={onClose} aria-label="Close">
              <X size={15} strokeWidth={1.8} />
            </ActionButton>
          </HeaderActions>
        </Header>

        <Content>
          {/* Section 1: Basic Information */}
          <Section>
            <SectionHeader $isOpen={!!openSections.basic} onClick={() => toggleSection('basic')}>
              <SectionTitle>1. Basic Information</SectionTitle>
              <SectionIcon $isOpen={!!openSections.basic}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.basic}>
              <FieldGrid>
                <Field>
                  <FieldLabel>Plant Type</FieldLabel>
                  <FieldValue>{plant.plantType}</FieldValue>
                </Field>
              </FieldGrid>
              <Field>
                <FieldLabel>Farm Type Compatibility</FieldLabel>
                <BadgeContainer>
                  {plant.farmTypeCompatibility.map((type) => (
                    <Badge key={type} $color={getFarmTypeColor(type)}>
                      {formatFarmType(type)}
                    </Badge>
                  ))}
                </BadgeContainer>
              </Field>
              <Divider />
              <Field>
                <FieldLabel>Tags</FieldLabel>
                <BadgeContainer>
                  {plant.tags.length > 0 ? (
                    plant.tags.map((tag) => <Tag key={tag}>#{tag}</Tag>)
                  ) : (
                    <EmptyText>No tags</EmptyText>
                  )}
                </BadgeContainer>
              </Field>
            </SectionContent>
          </Section>

          {/* Section 2: Growth Cycle */}
          <Section>
            <SectionHeader $isOpen={!!openSections.growth} onClick={() => toggleSection('growth')}>
              <SectionTitle>2. Growth Cycle</SectionTitle>
              <SectionIcon $isOpen={!!openSections.growth}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.growth}>
              <FieldGrid>
                <Field>
                  <FieldLabel>Germination</FieldLabel>
                  <FieldValue>{plant.growthCycle.germinationDays || 0} days</FieldValue>
                </Field>
                <Field>
                  <FieldLabel>Vegetative</FieldLabel>
                  <FieldValue>{plant.growthCycle.vegetativeDays || 0} days</FieldValue>
                </Field>
                <Field>
                  <FieldLabel>Flowering</FieldLabel>
                  <FieldValue>{plant.growthCycle.floweringDays || 0} days</FieldValue>
                </Field>
                <Field>
                  <FieldLabel>Fruiting</FieldLabel>
                  <FieldValue>{plant.growthCycle.fruitingDays || 0} days</FieldValue>
                </Field>
                <Field>
                  <FieldLabel>Harvest Duration</FieldLabel>
                  <FieldValue>{plant.growthCycle.harvestDurationDays || 0} days</FieldValue>
                </Field>
                <Field>
                  <FieldLabel>Total Cycle</FieldLabel>
                  <FieldValue>
                    <strong>{plant.growthCycle.totalCycleDays} days</strong>
                  </FieldValue>
                </Field>
              </FieldGrid>
            </SectionContent>
          </Section>

          {/* Section 3: Yield & Waste */}
          <Section>
            <SectionHeader $isOpen={!!openSections.yield} onClick={() => toggleSection('yield')}>
              <SectionTitle>3. Yield & Waste</SectionTitle>
              <SectionIcon $isOpen={!!openSections.yield}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.yield}>
              <FieldGrid>
                <Field>
                  <FieldLabel>Yield Per Plant</FieldLabel>
                  <FieldValue>
                    {plant.yieldInfo.yieldPerPlant} {plant.yieldInfo.yieldUnit}
                  </FieldValue>
                </Field>
                <Field>
                  <FieldLabel>Seeds Per Planting Point</FieldLabel>
                  <FieldValue>{plant.yieldInfo.seedsPerPlantingPoint || 1}</FieldValue>
                </Field>
                {(plant.yieldInfo.seedsPerPlantingPoint || 1) > 1 && (
                  <Field>
                    <FieldLabel>Yield Per Planting Point</FieldLabel>
                    <FieldValue>
                      {(plant.yieldInfo.yieldPerPlant * (plant.yieldInfo.seedsPerPlantingPoint || 1)).toFixed(2)} {plant.yieldInfo.yieldUnit}
                    </FieldValue>
                  </Field>
                )}
                <Field>
                  <FieldLabel>Expected Waste</FieldLabel>
                  <FieldValue>{plant.yieldInfo.expectedWastePercentage || 0}%</FieldValue>
                </Field>
              </FieldGrid>
            </SectionContent>
          </Section>

          {/* Section 4: Environmental Requirements */}
          <Section>
            <SectionHeader $isOpen={!!openSections.environment} onClick={() => toggleSection('environment')}>
              <SectionTitle>4. Environmental Requirements</SectionTitle>
              <SectionIcon $isOpen={!!openSections.environment}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.environment}>
              <FieldGrid>
                <Field>
                  <FieldLabel>Temperature Range</FieldLabel>
                  <FieldValue>
                    {plant.environmentalRequirements.temperatureMin || 'N/A'}°C -{' '}
                    {plant.environmentalRequirements.temperatureOptimal || 'N/A'}°C -{' '}
                    {plant.environmentalRequirements.temperatureMax || 'N/A'}°C
                  </FieldValue>
                </Field>
                <Field>
                  <FieldLabel>Humidity Range</FieldLabel>
                  <FieldValue>
                    {plant.environmentalRequirements.humidityMin || 'N/A'}% -{' '}
                    {plant.environmentalRequirements.humidityOptimal || 'N/A'}% -{' '}
                    {plant.environmentalRequirements.humidityMax || 'N/A'}%
                  </FieldValue>
                </Field>
                {plant.environmentalRequirements.co2Requirements && (
                  <Field>
                    <FieldLabel>CO2 Requirements</FieldLabel>
                    <FieldValue>{plant.environmentalRequirements.co2Requirements} ppm</FieldValue>
                  </Field>
                )}
                {plant.environmentalRequirements.airCirculation && (
                  <Field>
                    <FieldLabel>Air Circulation</FieldLabel>
                    <FieldValue>{plant.environmentalRequirements.airCirculation}</FieldValue>
                  </Field>
                )}
              </FieldGrid>
            </SectionContent>
          </Section>

          {/* Section 7: Watering Requirements */}
          <Section>
            <SectionHeader $isOpen={!!openSections.watering} onClick={() => toggleSection('watering')}>
              <SectionTitle>5. Watering Requirements</SectionTitle>
              <SectionIcon $isOpen={!!openSections.watering}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.watering}>
              <FieldGrid>
                <Field>
                  <FieldLabel>Watering Frequency</FieldLabel>
                  <FieldValue>Every {plant.wateringRequirements.wateringFrequencyDays} days</FieldValue>
                </Field>
                {plant.wateringRequirements.waterType && (
                  <Field>
                    <FieldLabel>Water Type</FieldLabel>
                    <FieldValue>{plant.wateringRequirements.waterType}</FieldValue>
                  </Field>
                )}
                {plant.wateringRequirements.waterAmountPerPlant && (
                  <Field>
                    <FieldLabel>Water Amount</FieldLabel>
                    <FieldValue>
                      {plant.wateringRequirements.waterAmountPerPlant}{' '}
                      {plant.wateringRequirements.waterAmountUnit || 'L'}
                    </FieldValue>
                  </Field>
                )}
                {plant.wateringRequirements.droughtTolerance && (
                  <Field>
                    <FieldLabel>Drought Tolerance</FieldLabel>
                    <FieldValue>{plant.wateringRequirements.droughtTolerance}</FieldValue>
                  </Field>
                )}
              </FieldGrid>
            </SectionContent>
          </Section>

          {/* Section 8: Soil & pH Requirements */}
          <Section>
            <SectionHeader $isOpen={!!openSections.soil} onClick={() => toggleSection('soil')}>
              <SectionTitle>6. Soil & pH Requirements</SectionTitle>
              <SectionIcon $isOpen={!!openSections.soil}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.soil}>
              <FieldGrid>
                <Field>
                  <FieldLabel>pH Range</FieldLabel>
                  <FieldValue>
                    {plant.soilRequirements.phMin || 'N/A'} - {plant.soilRequirements.phOptimal || 'N/A'} -{' '}
                    {plant.soilRequirements.phMax || 'N/A'}
                  </FieldValue>
                </Field>
                {plant.soilRequirements.soilTypes && plant.soilRequirements.soilTypes.length > 0 && (
                  <Field>
                    <FieldLabel>Soil Types</FieldLabel>
                    <BadgeContainer>
                      {plant.soilRequirements.soilTypes.map((type) => (
                        <Tag key={type}>{type}</Tag>
                      ))}
                    </BadgeContainer>
                  </Field>
                )}
              </FieldGrid>
              {(plant.soilRequirements.ecMin || plant.soilRequirements.ecMax) && (
                <>
                  <Divider />
                  <FieldGrid>
                    <Field>
                      <FieldLabel>EC Range (Hydroponic)</FieldLabel>
                      <FieldValue>
                        {plant.soilRequirements.ecMin || 'N/A'} - {plant.soilRequirements.ecMax || 'N/A'}
                      </FieldValue>
                    </Field>
                  </FieldGrid>
                </>
              )}
              {plant.soilRequirements.soilNutrients && (
                <>
                  <Divider />
                  <Field>
                    <FieldLabel>Soil Nutrients</FieldLabel>
                    <FieldValue>{plant.soilRequirements.soilNutrients}</FieldValue>
                  </Field>
                </>
              )}
            </SectionContent>
          </Section>

          {/* Section 9: Diseases & Pests */}
          <Section>
            <SectionHeader $isOpen={!!openSections.diseases} onClick={() => toggleSection('diseases')}>
              <SectionTitle>7. Diseases & Pests</SectionTitle>
              <SectionIcon $isOpen={!!openSections.diseases}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.diseases}>
              {plant.diseasesAndPests && plant.diseasesAndPests.length > 0 ? (
                plant.diseasesAndPests.map((disease, idx) => (
                  <ArrayItem key={idx}>
                    <Field>
                      <FieldLabel>Name</FieldLabel>
                      <FieldValue>
                        <strong>{disease.name}</strong>
                        {disease.severity && <Badge $color={theme.colors.phase.quarantined}>{disease.severity}</Badge>}
                      </FieldValue>
                    </Field>
                    {disease.symptoms && (
                      <>
                        <Divider />
                        <Field>
                          <FieldLabel>Symptoms</FieldLabel>
                          <FieldValue>{disease.symptoms}</FieldValue>
                        </Field>
                      </>
                    )}
                    {disease.prevention && (
                      <>
                        <Divider />
                        <Field>
                          <FieldLabel>Prevention</FieldLabel>
                          <FieldValue>{disease.prevention}</FieldValue>
                        </Field>
                      </>
                    )}
                    {disease.treatment && (
                      <>
                        <Divider />
                        <Field>
                          <FieldLabel>Treatment</FieldLabel>
                          <FieldValue>{disease.treatment}</FieldValue>
                        </Field>
                      </>
                    )}
                  </ArrayItem>
                ))
              ) : (
                <EmptyText>No diseases or pests documented</EmptyText>
              )}
            </SectionContent>
          </Section>

          {/* Section 10: Light Requirements */}
          <Section>
            <SectionHeader $isOpen={!!openSections.light} onClick={() => toggleSection('light')}>
              <SectionTitle>8. Light Requirements</SectionTitle>
              <SectionIcon $isOpen={!!openSections.light}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.light}>
              <FieldGrid>
                {plant.lightRequirements.lightType && (
                  <Field>
                    <FieldLabel>Light Type</FieldLabel>
                    <FieldValue>{plant.lightRequirements.lightType}</FieldValue>
                  </Field>
                )}
                <Field>
                  <FieldLabel>Daily Light Hours</FieldLabel>
                  <FieldValue>
                    {plant.lightRequirements.dailyLightHoursMin || 'N/A'} -{' '}
                    {plant.lightRequirements.dailyLightHoursOptimal || 'N/A'} -{' '}
                    {plant.lightRequirements.dailyLightHoursMax || 'N/A'} hours
                  </FieldValue>
                </Field>
                {plant.lightRequirements.lightIntensity && (
                  <Field>
                    <FieldLabel>Light Intensity</FieldLabel>
                    <FieldValue>{plant.lightRequirements.lightIntensity} lux/PPFD</FieldValue>
                  </Field>
                )}
                {plant.lightRequirements.photoperiodSensitive !== undefined && (
                  <Field>
                    <FieldLabel>Photoperiod Sensitive</FieldLabel>
                    <FieldValue>{plant.lightRequirements.photoperiodSensitive ? 'Yes' : 'No'}</FieldValue>
                  </Field>
                )}
              </FieldGrid>
            </SectionContent>
          </Section>

          {/* Section 11: Quality Grading */}
          <Section>
            <SectionHeader $isOpen={!!openSections.quality} onClick={() => toggleSection('quality')}>
              <SectionTitle>9. Quality Grading</SectionTitle>
              <SectionIcon $isOpen={!!openSections.quality}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.quality}>
              {plant.qualityGrades && plant.qualityGrades.length > 0 ? (
                plant.qualityGrades.map((grade, idx) => (
                  <ArrayItem key={idx}>
                    <Field>
                      <FieldLabel>Grade Name</FieldLabel>
                      <FieldValue>
                        <strong>{grade.gradeName}</strong>
                        {grade.priceMultiplier && (
                          <Badge $color={theme.colors.phase.fruiting}>{grade.priceMultiplier}x price</Badge>
                        )}
                      </FieldValue>
                    </Field>
                    {grade.sizeRequirements && (
                      <>
                        <Divider />
                        <Field>
                          <FieldLabel>Size Requirements</FieldLabel>
                          <FieldValue>{grade.sizeRequirements}</FieldValue>
                        </Field>
                      </>
                    )}
                    {grade.colorRequirements && (
                      <>
                        <Divider />
                        <Field>
                          <FieldLabel>Color Requirements</FieldLabel>
                          <FieldValue>{grade.colorRequirements}</FieldValue>
                        </Field>
                      </>
                    )}
                  </ArrayItem>
                ))
              ) : (
                <EmptyText>No quality grades defined</EmptyText>
              )}
            </SectionContent>
          </Section>

          {/* Section 12: Economics & Labor */}
          <Section>
            <SectionHeader $isOpen={!!openSections.economics} onClick={() => toggleSection('economics')}>
              <SectionTitle>10. Economics & Labor</SectionTitle>
              <SectionIcon $isOpen={!!openSections.economics}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.economics}>
              <FieldGrid>
                <Field>
                  <FieldLabel>Market Value</FieldLabel>
                  <FieldValue>
                    {plant.economicsAndLabor?.averageMarketValuePerKg != null
                      ? `${plant.economicsAndLabor.currency || '$'}${plant.economicsAndLabor.averageMarketValuePerKg.toFixed(2)}/kg`
                      : 'N/A'}
                  </FieldValue>
                </Field>
                {plant.economicsAndLabor?.totalLaborHoursPerPlant && (
                  <Field>
                    <FieldLabel>Total Labor Hours</FieldLabel>
                    <FieldValue>{plant.economicsAndLabor.totalLaborHoursPerPlant} hours/plant</FieldValue>
                  </Field>
                )}
              </FieldGrid>
              {(plant.economicsAndLabor?.plantingHours ||
                plant.economicsAndLabor?.maintenanceHours ||
                plant.economicsAndLabor?.harvestingHours) && (
                <>
                  <Divider />
                  <FieldGrid>
                    {plant.economicsAndLabor.plantingHours && (
                      <Field>
                        <FieldLabel>Planting Hours</FieldLabel>
                        <FieldValue>{plant.economicsAndLabor.plantingHours} hours</FieldValue>
                      </Field>
                    )}
                    {plant.economicsAndLabor.maintenanceHours && (
                      <Field>
                        <FieldLabel>Maintenance Hours</FieldLabel>
                        <FieldValue>{plant.economicsAndLabor.maintenanceHours} hours</FieldValue>
                      </Field>
                    )}
                    {plant.economicsAndLabor.harvestingHours && (
                      <Field>
                        <FieldLabel>Harvesting Hours</FieldLabel>
                        <FieldValue>{plant.economicsAndLabor.harvestingHours} hours</FieldValue>
                      </Field>
                    )}
                  </FieldGrid>
                </>
              )}
            </SectionContent>
          </Section>

          {/* Section 11: Fertigation Schedule */}
          {/* Always render for privileged users so they can bootstrap a schedule. */}
          {(canEditFertigation || (plant.fertigationSchedule?.cards && plant.fertigationSchedule.cards.length > 0)) && (
            <Section>
              <SectionHeader $isOpen={!!openSections.fertigation} onClick={() => toggleSection('fertigation')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <SectionTitle>11. Fertigation Schedule</SectionTitle>
                  {canEditFertigation && (
                    // "clone" (secondary/glass), not "edit" (gold) — Header's
                    // own Edit button is already this view's ONE primary CTA
                    // (spec §3); a second gold button here would double it.
                    <ActionButton
                      $variant="clone"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFertigationEditor(true);
                      }}
                      style={{ fontSize: 12, padding: '4px 12px' }}
                    >
                      {plant.fertigationSchedule?.cards && plant.fertigationSchedule.cards.length > 0
                        ? 'Edit Schedule'
                        : 'Create Fertigation Schedule'}
                    </ActionButton>
                  )}
                </div>
                <SectionIcon $isOpen={!!openSections.fertigation}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
              </SectionHeader>
              <SectionContent $isOpen={!!openSections.fertigation}>
                {!plant.fertigationSchedule?.cards || plant.fertigationSchedule.cards.length === 0 ? (
                  <EmptyText>
                    No fertigation schedule defined yet.
                    {canEditFertigation && (
                      <span>
                        {' '}
                        Click{' '}
                        <button
                          style={{ background: 'none', border: 'none', color: theme.colors.primary[500], cursor: 'pointer', fontSize: 14, textDecoration: 'underline', padding: 0 }}
                          onClick={() => setShowFertigationEditor(true)}
                        >
                          Create Fertigation Schedule
                        </button>
                        {' '}to add one.
                      </span>
                    )}
                  </EmptyText>
                ) : (
                  <>
                    <FieldGrid>
                      <Field>
                        <FieldLabel>Total Fertigation Days</FieldLabel>
                        <FieldValue>{plant.fertigationSchedule.totalFertilizationDays} days</FieldValue>
                      </Field>
                      <Field>
                        <FieldLabel>Source</FieldLabel>
                        <FieldValue>{plant.fertigationSchedule.source || '—'}</FieldValue>
                      </Field>
                    </FieldGrid>
                    <Divider />
                    {plant.fertigationSchedule.cards.map((card, cardIdx) => (
                      <ArrayItem key={cardIdx}>
                        <CardHeader>
                          <CardTitle>{card.cardName}</CardTitle>
                          <StageBadge $phase={growthStageToPhase(card.growthStage)}>{card.growthStage}</StageBadge>
                          <DayRange>Day {card.dayStart} - {card.dayEnd}</DayRange>
                          {!card.isActive && <Badge $color={theme.colors.phase.decommissioned}>Inactive</Badge>}
                        </CardHeader>
                        {card.rules.map((rule, ruleIdx) => (
                          <RuleCard key={ruleIdx}>
                            <RuleHeader>
                              <RuleName>{rule.name}</RuleName>
                              {rule.type === 'interval' && rule.frequencyDays && (
                                <FrequencyBadge>Every {rule.frequencyDays} days</FrequencyBadge>
                              )}
                              {rule.type === 'custom' && (
                                <FrequencyBadge>Custom schedule</FrequencyBadge>
                              )}
                              {rule.activeDayStart != null && rule.activeDayEnd != null && (
                                <DayRange>Day {rule.activeDayStart}-{rule.activeDayEnd}</DayRange>
                              )}
                            </RuleHeader>
                            {/* Interval rule ingredients */}
                            {rule.type === 'interval' && rule.ingredients && rule.ingredients.length > 0 && (
                              <div>
                                {rule.ingredients.map((ing, ingIdx) => (
                                  <IngredientRow key={ingIdx}>
                                    <IngredientName>{ing.name}</IngredientName>
                                    <IngredientDosage>{ing.dosagePerPoint} {ing.unit}/point</IngredientDosage>
                                  </IngredientRow>
                                ))}
                              </div>
                            )}
                            {/* Custom rule applications */}
                            {rule.type === 'custom' && rule.applications && rule.applications.length > 0 && (
                              <div>
                                {rule.applications.map((app, appIdx) => (
                                  <div key={appIdx} style={{ marginBottom: appIdx < rule.applications!.length - 1 ? '8px' : '0' }}>
                                    <FieldLabel>Day {app.day}</FieldLabel>
                                    {app.ingredients.map((ing, ingIdx) => (
                                      <IngredientRow key={ingIdx}>
                                        <IngredientName>{ing.name}</IngredientName>
                                        <IngredientDosage>{ing.dosagePerPoint} {ing.unit}/point</IngredientDosage>
                                      </IngredientRow>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </RuleCard>
                        ))}
                        {card.notes && (
                          <>
                            <Divider />
                            <Field>
                              <FieldLabel>Notes</FieldLabel>
                              <FieldValue>{card.notes}</FieldValue>
                            </Field>
                          </>
                        )}
                      </ArrayItem>
                    ))}
                  </>
                )}
              </SectionContent>
            </Section>
          )}

          {/* Fertigation Schedule Editor Modal */}
          {showFertigationEditor && (
            <FertigationScheduleEditorModal
              plantDataId={plant.plantDataId}
              plantName={plant.plantName}
              initialSchedule={plant.fertigationSchedule}
              onClose={() => setShowFertigationEditor(false)}
              onSaved={() => {
                setShowFertigationEditor(false);
                onSaved?.();
              }}
            />
          )}

          {/* Section 12: Additional Information */}
          <Section>
            <SectionHeader $isOpen={!!openSections.additional} onClick={() => toggleSection('additional')}>
              <SectionTitle>
                {(canEditFertigation || (plant.fertigationSchedule?.cards && plant.fertigationSchedule.cards.length > 0))
                  ? '12'
                  : '11'}. Additional Information
              </SectionTitle>
              <SectionIcon $isOpen={!!openSections.additional}><ChevronRight size={18} strokeWidth={1.8} /></SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.additional}>
              <FieldGrid>
                {plant.additionalInfo.growthHabit && (
                  <Field>
                    <FieldLabel>Growth Habit</FieldLabel>
                    <FieldValue>{plant.additionalInfo.growthHabit}</FieldValue>
                  </Field>
                )}
                {(plant.additionalInfo.spacingBetweenPlantsCm || plant.additionalInfo.spacingBetweenRowsCm) && (
                  <Field>
                    <FieldLabel>Spacing Requirements</FieldLabel>
                    <FieldValue>
                      Plants: {plant.additionalInfo.spacingBetweenPlantsCm || 'N/A'} cm | Rows:{' '}
                      {plant.additionalInfo.spacingBetweenRowsCm || 'N/A'} cm
                    </FieldValue>
                  </Field>
                )}
                {plant.additionalInfo.supportRequirements && (
                  <Field>
                    <FieldLabel>Support Requirements</FieldLabel>
                    <FieldValue>{plant.additionalInfo.supportRequirements}</FieldValue>
                  </Field>
                )}
              </FieldGrid>
              {(plant.additionalInfo.companionPlants && plant.additionalInfo.companionPlants.length > 0) && (
                <>
                  <Divider />
                  <Field>
                    <FieldLabel>Companion Plants</FieldLabel>
                    <BadgeContainer>
                      {plant.additionalInfo.companionPlants.map((comp) => (
                        <Tag key={comp}>{comp}</Tag>
                      ))}
                    </BadgeContainer>
                  </Field>
                </>
              )}
              {(plant.additionalInfo.incompatiblePlants && plant.additionalInfo.incompatiblePlants.length > 0) && (
                <>
                  <Divider />
                  <Field>
                    <FieldLabel>Incompatible Plants</FieldLabel>
                    <BadgeContainer>
                      {plant.additionalInfo.incompatiblePlants.map((incomp) => (
                        <Tag key={incomp}>{incomp}</Tag>
                      ))}
                    </BadgeContainer>
                  </Field>
                </>
              )}
              {plant.additionalInfo.notes && (
                <>
                  <Divider />
                  <Field>
                    <FieldLabel>Notes</FieldLabel>
                    <FieldValue style={{ whiteSpace: 'pre-wrap' }}>{plant.additionalInfo.notes}</FieldValue>
                  </Field>
                </>
              )}
            </SectionContent>
          </Section>
        </Content>
      </Modal>
    </Overlay>
  );
}
