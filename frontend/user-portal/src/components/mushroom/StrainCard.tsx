/**
 * StrainCard Component
 *
 * Strain info card displaying common name, scientific name,
 * difficulty badge, yield info, and max flushes.
 */

import styled from 'styled-components';
import type { MushroomStrain, MushroomDifficulty } from '../../types/mushroom';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
} from '../../types/mushroom';

interface StrainCardProps {
  strain: MushroomStrain;
  onClick?: (strain: MushroomStrain) => void;
  selected?: boolean;
}

const DIFFICULTY_BG: Record<MushroomDifficulty, string> = {
  beginner: '#D1FAE5',
  intermediate: '#DBEAFE',
  advanced: '#FEF3C7',
  expert: '#FEE2E2',
};

export function StrainCard({ strain, onClick, selected = false }: StrainCardProps) {
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
          $bg={DIFFICULTY_BG[strain.difficulty]}
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

      {!strain.isActive && (
        <InactiveBanner>Inactive / Archived</InactiveBanner>
      )}
    </CardWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

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
    $selected ? '0 0 0 3px rgba(33,150,243,0.18)' : theme.shadows.sm};
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
  color: #616161;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  padding: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;
