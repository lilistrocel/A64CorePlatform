/**
 * StrainCard Component
 *
 * Strain info card displaying common name, scientific name,
 * difficulty badge, yield info, and max flushes.
 *
 * Night Observatory (T-901 Phase 3): glass entity card, spec §4. Difficulty
 * is a categorical (not phase) encoding — built from `colors.bright.*`
 * rather than the phase map or gold, same rule as the genetics G/F
 * generation badges in this shard.
 */

import styled from 'styled-components';
import { Sprout, Dna } from 'lucide-react';
import { glassPanel, glassPanelHover, monoLabel, sheen } from '@a64core/shared';
import type { MushroomStrain, MushroomDifficulty } from '../../types/mushroom';
import { DIFFICULTY_LABELS } from '../../types/mushroom';

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

// Difficulty is categorical, not a phase — walked easy -> hard across
// distinct bright.* hues (never gold, spec §3) rather than the out-of-scope
// types/mushroom.ts DIFFICULTY_COLORS (still keyed off the dead lightTheme).
const DIFFICULTY_HUE: Record<MushroomDifficulty, string> = {
  beginner: 'emerald',
  intermediate: 'lapis',
  advanced: 'terra',
  expert: 'coral',
};

export function StrainCard({
  strain,
  onClick,
  selected = false,
  geneticLineCount,
  onOpenGeneticLines,
}: StrainCardProps) {
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
      <Top>
        <TitleBlock>
          <CommonName>{strain.commonName}</CommonName>
          {strain.scientificName && (
            <ScientificName>{strain.scientificName}</ScientificName>
          )}
        </TitleBlock>
        <DifficultyBadge $hue={DIFFICULTY_HUE[strain.difficulty]}>
          {DIFFICULTY_LABELS[strain.difficulty]}
        </DifficultyBadge>
      </Top>

      <UseLine>
        <Sprout size={13} strokeWidth={1.6} />
        {strain.species}
      </UseLine>

      <StatsGrid>
        <StatBox>
          <StatBoxValue>
            {strain.expectedYieldKgPerKgSubstrate != null
              ? `${(strain.expectedYieldKgPerKgSubstrate * 100).toFixed(0)}%`
              : '—'}
          </StatBoxValue>
          <StatBoxLabel>Exp. Yield (BE%)</StatBoxLabel>
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
          <Dna size={13} strokeWidth={1.6} />
          {geneticLineCount} genetic line{geneticLineCount !== 1 ? 's' : ''} &rarr;
        </GeneticsLink>
      )}

      {!strain.isActive && (
        <InactiveBanner>Inactive / Archived</InactiveBanner>
      )}
    </CardWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS — glass entity card, spec §4 / mockup `.card` pattern
// ============================================================================

const GeneticsLink = styled.button`
  margin-top: 12px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: rgba(180, 200, 220, 0.4);
    color: ${({ theme }) => theme.colors.textPrimary};
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

interface CardWrapperProps {
  $selected: boolean;
  $clickable: boolean;
}

const CardWrapper = styled.div<CardWrapperProps>`
  ${({ $clickable }) => ($clickable ? glassPanelHover : glassPanel)}
  ${sheen}
  overflow: hidden;
  border-radius: 18px;
  padding: 20px 20px 18px;
  position: relative;

  ${({ $selected, theme }) =>
    $selected &&
    `
    border-color: ${theme.colors.celeste};
    box-shadow: 0 0 0 3px rgba(180, 200, 220, 0.18);
  `}
`;

const Top = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 4px;
`;

const TitleBlock = styled.div`
  flex: 1;
  min-width: 0;
`;

const CommonName = styled.h3`
  font-weight: 800;
  font-size: 1.05rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: 0.01em;
  margin: 0 0 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ScientificName = styled.span`
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
`;

const DifficultyBadge = styled.span<{ $hue: string }>`
  ${monoLabel}
  font-size: 0.62rem;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 99px;
  flex-shrink: 0;
  color: ${({ theme, $hue }) => (theme.colors.bright as Record<string, string>)[$hue]};
  background: ${({ theme, $hue }) => (theme.colors.bright as Record<string, string>)[$hue]}29;
  border: 1px solid ${({ theme, $hue }) => (theme.colors.bright as Record<string, string>)[$hue]}73;
`;

const UseLine = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 14px;

  svg {
    flex-shrink: 0;
    opacity: 0.85;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const StatBox = styled.div`
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  padding: 8px 10px;
`;

const StatBoxValue = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.86rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 2px;
`;

const StatBoxLabel = styled.div`
  ${monoLabel}
  font-size: 0.56rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const InactiveBanner = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(10, 14, 36, 0.55);
  color: ${({ theme }) => theme.colors.muted};
  ${monoLabel}
  font-size: 0.62rem;
  text-align: center;
  padding: 5px;
`;
