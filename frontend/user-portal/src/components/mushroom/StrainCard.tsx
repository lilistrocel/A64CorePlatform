/**
 * StrainCard Component
 *
 * Strain info card displaying common name, scientific name,
 * difficulty badge, yield info, and max flushes.
 */

import styled, { useTheme } from 'styled-components';
import type { Theme } from '@a64core/shared';
import type { MushroomStrain, MushroomDifficulty } from '../../types/mushroom';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
} from '../../types/mushroom';

interface StrainCardProps {
  strain: MushroomStrain;
  onClick?: (strain: MushroomStrain) => void;
  selected?: boolean;
  /**
   * How many Genetics Repo lines are linked to this strain (T-801).
   * The strain holds the growing conditions; the linked lines hold the
   * lineages actually being cultivated under them.
   */
  geneticLineCount?: number;
  /** Open the Genetics Repo filtered to this strain's lines. */
  onOpenGeneticLines?: (strain: MushroomStrain) => void;
}

// Difficulty runs easy → hard, mirrored onto the semantic success → warning →
// error progression (safe green through to risk red).
function getDifficultyBg(theme: Theme): Record<MushroomDifficulty, string> {
  return {
    beginner: theme.colors.emerald[100],
    intermediate: theme.colors.primary[100],
    advanced: theme.colors.warningBg,
    expert: theme.colors.terracotta[100],
  };
}

export function StrainCard({
  strain,
  onClick,
  selected = false,
  geneticLineCount,
  onOpenGeneticLines,
}: StrainCardProps) {
  const theme = useTheme();
  const difficultyBg = getDifficultyBg(theme);
  return (
    <CardWrapper
      $selected={selected}
      $clickable={!!onClick}
      onClick={() => onClick?.(strain)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(strain);
        }
      }}
      aria-label={`Strain: ${strain.commonName}`}
    >
      <CardHeader>
        <MushroomEmoji aria-hidden="true">🍄</MushroomEmoji>
        <TitleBlock>
          <CommonName>{strain.commonName}</CommonName>
          {strain.scientificName && (
            <ScientificName>{strain.scientificName}</ScientificName>
          )}
        </TitleBlock>
        <DifficultyBadge
          $color={DIFFICULTY_COLORS[strain.difficulty]}
          $bg={difficultyBg[strain.difficulty]}
        >
          {DIFFICULTY_LABELS[strain.difficulty]}
        </DifficultyBadge>
      </CardHeader>

      <SpeciesRow>
        <SpeciesLabel>Species</SpeciesLabel>
        <SpeciesValue>{strain.species}</SpeciesValue>
      </SpeciesRow>

      <StatsGrid>
        <StatBox>
          <StatBoxValue>
            {strain.expectedYieldKgPerKgSubstrate != null
              ? `${(strain.expectedYieldKgPerKgSubstrate * 100).toFixed(0)}%`
              : '—'}
          </StatBoxValue>
          <StatBoxLabel>Expected Yield (BE%)</StatBoxLabel>
        </StatBox>

        <StatBox>
          <StatBoxValue>{strain.maxFlushes ?? '—'}</StatBoxValue>
          <StatBoxLabel>Max Flushes</StatBoxLabel>
        </StatBox>

        <StatBox>
          <StatBoxValue>
            {strain.colonizationTempMin != null && strain.colonizationTempMax != null
              ? `${strain.colonizationTempMin}–${strain.colonizationTempMax}°C`
              : '—'}
          </StatBoxValue>
          <StatBoxLabel>Coloniz. Temp</StatBoxLabel>
        </StatBox>

        <StatBox>
          <StatBoxValue>
            {strain.fruitingTempMin != null && strain.fruitingTempMax != null
              ? `${strain.fruitingTempMin}–${strain.fruitingTempMax}°C`
              : '—'}
          </StatBoxValue>
          <StatBoxLabel>Fruiting Temp</StatBoxLabel>
        </StatBox>
      </StatsGrid>

      {geneticLineCount != null && geneticLineCount > 0 && (
        <GeneticsLink
          type="button"
          onClick={(e) => {
            // The whole card is a click target for edit, so the reverse link
            // has to stop propagation or it would open the edit modal instead.
            e.stopPropagation();
            onOpenGeneticLines?.(strain);
          }}
          title="This strain holds the growing conditions; open the lineages cultivated under it"
        >
          🧬 {geneticLineCount} genetic line{geneticLineCount !== 1 ? 's' : ''} →
        </GeneticsLink>
      )}

      {!strain.isActive && (
        <InactiveBanner>Inactive / Archived</InactiveBanner>
      )}
    </CardWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const GeneticsLink = styled.button`
  margin-top: 12px;
  width: 100%;
  padding: 7px 10px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[400]};
    color: ${({ theme }) => theme.colors.primary[700]};
  }
`;

interface CardWrapperProps {
  $selected: boolean;
  $clickable: boolean;
}

const CardWrapper = styled.div<CardWrapperProps>`
  position: relative;
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  border: 2px solid ${({ $selected, theme }) => ($selected ? theme.colors.primary[500] : theme.colors.neutral[300])};
  padding: 16px;
  box-shadow: ${({ $selected, theme }) =>
    $selected ? `0 0 0 3px ${theme.colors.primary[500]}2e` : theme.shadows.sm};
  transition: all 150ms ease-in-out;
  overflow: hidden;

  ${({ $clickable }) =>
    $clickable &&
    `
    cursor: pointer;
    &:hover {
      box-shadow: 0 6px 16px rgba(0,0,0,0.12);
      transform: translateY(-1px);
    }
  `}

  ${({ $clickable, theme }) =>
    $clickable &&
    `
    &:focus-visible {
      outline: 2px solid ${theme.colors.primary[500]};
      outline-offset: 2px;
    }
  `}
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
`;

const MushroomEmoji = styled.span`
  font-size: 22px;
  line-height: 1;
  margin-top: 2px;
`;

const TitleBlock = styled.div`
  flex: 1;
  min-width: 0;
`;

const CommonName = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ScientificName = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
`;

interface DifficultyBadgeProps {
  $color: string;
  $bg: string;
}

const DifficultyBadge = styled.span<DifficultyBadgeProps>`
  font-size: 11px;
  font-weight: 600;
  color: ${({ $color }) => $color};
  background: ${({ $bg }) => $bg};
  border-radius: 20px;
  padding: 3px 9px;
  white-space: nowrap;
`;

const SpeciesRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
`;

const SpeciesLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const SpeciesValue = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const StatBox = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
  padding: 8px 10px;
`;

const StatBoxValue = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 2px;
`;

const StatBoxLabel = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const InactiveBanner = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.06);
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  padding: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;
