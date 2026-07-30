/**
 * SoilConditionsCard Component
 *
 * Displays soil temperature and moisture at various depths.
 */

import styled from 'styled-components';
import type { SoilConditions } from '../../../types/farm';
import { formatTemperature, formatSoilMoisture } from '../../../services/weatherApi';

const Card = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  padding: 24px;
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const Title = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DepthsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
`;

const Section = styled.div`
  h4 {
    font-size: 13px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSecondary};
    margin: 0 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const DepthItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }

  .depth {
    font-size: 13px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }

  .value {
    font-size: 14px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const NoDataMessage = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.textDisabled};
  font-size: 14px;
`;

const DepthIndicator = styled.div<{ $depth: number }>`
  width: 4px;
  height: 100%;
  min-height: 32px;
  border-radius: 2px;
  margin-right: 12px;
  background: ${({ $depth, theme }) => {
    // Color gradient from light to dark based on depth — sequential emerald
    // ramp, ordering preserved (shallow = light, deep = dark).
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
        <Title>🌱 Soil Conditions</Title>
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
      <Title>🌱 Soil Conditions</Title>

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
