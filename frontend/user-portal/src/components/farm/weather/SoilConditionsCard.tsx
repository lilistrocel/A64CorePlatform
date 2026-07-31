/**
 * SoilConditionsCard Component
 *
 * Displays soil temperature and moisture at various depths.
 */

import styled from 'styled-components';
import { Sprout } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import type { SoilConditions } from '../../../types/farm';
import { formatTemperature, formatSoilMoisture } from '../../../services/weatherApi';

const Card = styled.div`
  ${glassPanel}
  padding: 24px;
`;

const Title = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
  display: flex;
  align-items: center;
  gap: 8px;

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.celeste};
  }
`;

const DepthsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
`;

const Section = styled.div`
  h4 {
    ${monoLabel}
    font-size: 0.68rem;
    color: ${({ theme }) => theme.colors.muted};
    margin: 0 0 12px 0;
  }
`;

// Inner row cells — Card is already a glassPanel (layer 1); per the T-901
// two-glass-layer rule these drop to a plain `line` border with no fill
// rather than a second translucent glass surface (was theme.colors.surface).
const DepthItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }

  .depth {
    ${monoLabel}
    color: ${({ theme }) => theme.colors.muted};
  }

  .value {
    ${monoLabel}
    font-size: 0.78rem;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const NoDataMessage = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

// Depth-vs-colour encoding: sequential single-hue (emerald) ramp, ordering
// preserved — shallow depths read lighter, deep depths read darker. This is
// exactly the "walk one bright hue" pattern the T-901 spec calls for; the
// existing 4-step emerald ramp already satisfies it (kept as-is).
const DepthIndicator = styled.div<{ $depth: number }>`
  width: 4px;
  height: 100%;
  min-height: 32px;
  border-radius: 2px;
  margin-right: 12px;
  background: ${({ $depth, theme }) => {
    if ($depth === 0) return theme.colors.emerald[200];  // surface
    if ($depth === 1) return theme.colors.emerald[400];  // shallow-mid
    if ($depth === 2) return theme.colors.emerald[600];  // deep-mid
    return theme.colors.emerald[800];                     // deep
  }};
`;

const DepthRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

interface SoilConditionsCardProps {
  soil: SoilConditions;
}

export function SoilConditionsCard({ soil }: SoilConditionsCardProps) {
  const hasTemperatureData =
    soil.temp_0_10cm !== undefined ||
    soil.temp_10_40cm !== undefined ||
    soil.temp_40_100cm !== undefined ||
    soil.temp_100_200cm !== undefined;

  const hasMoistureData =
    soil.moisture_0_10cm !== undefined ||
    soil.moisture_10_40cm !== undefined ||
    soil.moisture_40_100cm !== undefined ||
    soil.moisture_100_200cm !== undefined;

  if (!hasTemperatureData && !hasMoistureData) {
    return (
      <Card>
        <Title><Sprout size={16} strokeWidth={1.6} /> Soil Conditions</Title>
        <NoDataMessage>
          Soil data requires WeatherBit Business or Enterprise plan
        </NoDataMessage>
      </Card>
    );
  }

  const depths = [
    { label: '0-10 cm', temp: soil.temp_0_10cm, moisture: soil.moisture_0_10cm, index: 0 },
    { label: '10-40 cm', temp: soil.temp_10_40cm, moisture: soil.moisture_10_40cm, index: 1 },
    { label: '40-100 cm', temp: soil.temp_40_100cm, moisture: soil.moisture_40_100cm, index: 2 },
    { label: '100-200 cm', temp: soil.temp_100_200cm, moisture: soil.moisture_100_200cm, index: 3 },
  ];

  return (
    <Card>
      <Title><Sprout size={16} strokeWidth={1.6} /> Soil Conditions</Title>

      <DepthsGrid>
        {hasTemperatureData && (
          <Section>
            <h4>Temperature</h4>
            {depths.map((depth) => (
              depth.temp !== undefined && (
                <DepthRow key={`temp-${depth.label}`}>
                  <DepthIndicator $depth={depth.index} />
                  <DepthItem style={{ flex: 1 }}>
                    <span className="depth">{depth.label}</span>
                    <span className="value">{formatTemperature(depth.temp)}</span>
                  </DepthItem>
                </DepthRow>
              )
            ))}
          </Section>
        )}

        {hasMoistureData && (
          <Section>
            <h4>Moisture</h4>
            {depths.map((depth) => (
              depth.moisture !== undefined && (
                <DepthRow key={`moisture-${depth.label}`}>
                  <DepthIndicator $depth={depth.index} />
                  <DepthItem style={{ flex: 1 }}>
                    <span className="depth">{depth.label}</span>
                    <span className="value">{formatSoilMoisture(depth.moisture)}</span>
                  </DepthItem>
                </DepthRow>
              )
            ))}
          </Section>
        )}
      </DepthsGrid>
    </Card>
  );
}
