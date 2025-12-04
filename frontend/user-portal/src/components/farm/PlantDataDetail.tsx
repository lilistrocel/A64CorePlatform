/**
 * PlantDataDetail Component
 *
 * Modal displaying comprehensive plant data with all 13 field groups in expandable accordions.
 * Read-only view with action buttons at top.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { PlantDataEnhanced } from '../../types/farm';
import { formatFarmType, getFarmTypeColor } from '../../services/plantDataEnhancedApi';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PlantDataDetailProps {
  plant: PlantDataEnhanced;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onClone?: (id: string) => void;
  onDelete?: (id: string) => void;
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
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1100;
  padding: 20px;
`;

const Modal = styled.div`
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`;

const HeaderLeft = styled.div`
  flex: 1;
`;

const PlantIcon = styled.div`
  font-size: 48px;
  margin-bottom: 8px;
`;

const PlantName = styled.h2`
  font-size: 28px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 4px 0;
`;

const ScientificName = styled.div`
  font-size: 16px;
  font-style: italic;
  color: #616161;
  margin-bottom: 8px;
`;

const VersionInfo = styled.div`
  font-size: 12px;
  color: #9e9e9e;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button<{ $variant?: 'edit' | 'clone' | 'delete' | 'close' }>`
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 6px;

  ${({ $variant }) => {
    if ($variant === 'edit') {
      return `
        background: #F59E0B;
        color: white;
        &:hover {
          background: #D97706;
        }
      `;
    }
    if ($variant === 'clone') {
      return `
        background: #10B981;
        color: white;
        &:hover {
          background: #059669;
        }
      `;
    }
    if ($variant === 'delete') {
      return `
        background: #EF4444;
        color: white;
        &:hover {
          background: #DC2626;
        }
      `;
    }
    return `
      background: #e0e0e0;
      color: #616161;
      &:hover {
        background: #d0d0d0;
      }
    `;
  }}
`;

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px;
`;

const Section = styled.div`
  margin-bottom: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
`;

const SectionHeader = styled.button<{ $isOpen: boolean }>`
  width: 100%;
  padding: 16px 20px;
  background: ${({ $isOpen }) => ($isOpen ? '#f5f5f5' : 'white')};
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
  margin: 0;
  text-align: left;
`;

const SectionIcon = styled.span<{ $isOpen: boolean }>`
  font-size: 20px;
  transform: ${({ $isOpen }) => ($isOpen ? 'rotate(90deg)' : 'rotate(0deg)')};
  transition: transform 150ms ease-in-out;
`;

const SectionContent = styled.div<{ $isOpen: boolean }>`
  padding: ${({ $isOpen }) => ($isOpen ? '20px' : '0 20px')};
  max-height: ${({ $isOpen }) => ($isOpen ? '2000px' : '0')};
  overflow: hidden;
  transition: all 300ms ease-in-out;
  background: white;
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
  font-size: 12px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const FieldValue = styled.div`
  font-size: 14px;
  color: #212121;
  word-break: break-word;
`;

const BadgeContainer = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const Badge = styled.span<{ $color?: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => $color || '#e0e0e0'};
  color: ${({ $color }) => ($color ? 'white' : '#616161')};
`;

const Tag = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: #f5f5f5;
  color: #616161;
`;

const ArrayItem = styled.div`
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 16px 0;
`;

const EmptyText = styled.div`
  color: #9e9e9e;
  font-style: italic;
  font-size: 14px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PlantDataDetail({ plant, onClose, onEdit, onClone, onDelete }: PlantDataDetailProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true, // Open by default
  });

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const getPlantIcon = () => {
    const iconMap: Record<string, string> = {
      crop: '🌾',
      tree: '🌳',
      herb: '🌿',
      fruit: '🍎',
      vegetable: '🥕',
      ornamental: '🌺',
      medicinal: '🌱',
    };
    return iconMap[plant.plantType] || '🌱';
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <HeaderLeft>
            <PlantIcon>{getPlantIcon()}</PlantIcon>
            <PlantName>{plant.plantName}</PlantName>
            {plant.scientificName && <ScientificName>{plant.scientificName}</ScientificName>}
            <VersionInfo>
              Version {plant.dataVersion} | Created by {plant.createdByEmail} | Last updated:{' '}
              {new Date(plant.updatedAt).toLocaleDateString()}
            </VersionInfo>
          </HeaderLeft>
          <HeaderActions>
            {onEdit && (
              <ActionButton $variant="edit" onClick={() => onEdit(plant.plantDataId)}>
                ✏️ Edit
              </ActionButton>
            )}
            {onClone && (
              <ActionButton $variant="clone" onClick={() => onClone(plant.plantDataId)}>
                📋 Clone
              </ActionButton>
            )}
            {onDelete && (
              <ActionButton $variant="delete" onClick={() => onDelete(plant.plantDataId)}>
                🗑️ Delete
              </ActionButton>
            )}
            <ActionButton $variant="close" onClick={onClose}>
              ✕
            </ActionButton>
          </HeaderActions>
        </Header>

        <Content>
          {/* Section 1: Basic Information */}
          <Section>
            <SectionHeader $isOpen={!!openSections.basic} onClick={() => toggleSection('basic')}>
              <SectionTitle>1. Basic Information</SectionTitle>
              <SectionIcon $isOpen={!!openSections.basic}>›</SectionIcon>
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
              <SectionIcon $isOpen={!!openSections.growth}>›</SectionIcon>
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
              <SectionIcon $isOpen={!!openSections.yield}>›</SectionIcon>
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
                  <FieldLabel>Expected Waste</FieldLabel>
                  <FieldValue>{plant.yieldInfo.expectedWastePercent || 0}%</FieldValue>
                </Field>
              </FieldGrid>
            </SectionContent>
          </Section>

          {/* Section 4: Environmental Requirements */}
          <Section>
            <SectionHeader $isOpen={!!openSections.environment} onClick={() => toggleSection('environment')}>
              <SectionTitle>4. Environmental Requirements</SectionTitle>
              <SectionIcon $isOpen={!!openSections.environment}>›</SectionIcon>
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
              <SectionIcon $isOpen={!!openSections.watering}>›</SectionIcon>
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
              <SectionIcon $isOpen={!!openSections.soil}>›</SectionIcon>
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
              <SectionIcon $isOpen={!!openSections.diseases}>›</SectionIcon>
            </SectionHeader>
            <SectionContent $isOpen={!!openSections.diseases}>
              {plant.diseasesAndPests && plant.diseasesAndPests.length > 0 ? (
                plant.diseasesAndPests.map((disease, idx) => (
                  <ArrayItem key={idx}>
                    <Field>
                      <FieldLabel>Name</FieldLabel>
                      <FieldValue>
                        <strong>{disease.name}</strong>
                        {disease.severity && <Badge $color="#EF4444">{disease.severity}</Badge>}
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
              <SectionIcon $isOpen={!!openSections.light}>›</SectionIcon>
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
              <SectionIcon $isOpen={!!openSections.quality}>›</SectionIcon>
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
                          <Badge $color="#10B981">{grade.priceMultiplier}x price</Badge>
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
              <SectionIcon $isOpen={!!openSections.economics}>›</SectionIcon>
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

          {/* Section 13: Additional Information */}
          <Section>
            <SectionHeader $isOpen={!!openSections.additional} onClick={() => toggleSection('additional')}>
              <SectionTitle>11. Additional Information</SectionTitle>
              <SectionIcon $isOpen={!!openSections.additional}>›</SectionIcon>
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
