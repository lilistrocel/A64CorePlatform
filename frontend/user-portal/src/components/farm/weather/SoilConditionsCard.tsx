/**
 * SoilConditionsCard Component
 *
 * Displays soil temperature and moisture at various depths.
 */

import styled from 'styled-components';
import type { SoilConditions } from '../../../types/farm';
import { formatTemperature, formatSoilMoisture } from '../../../services/weatherApi';

const Card = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
`;

const Title = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
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
    color: #616161;
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
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }

  .depth {
    font-size: 13px;
    color: #616161;
  }

  .value {
    font-size: 14px;
    font-weight: 600;
    color: #212121;
  }
`;

const NoDataMessage = styled.div`
  text-align: center;
  padding: 24px;
  color: #9e9e9e;
  font-size: 14px;
`;

const DepthIndicator = styled.div<{ $depth: number }>`
  width: 4px;
  height: 100%;
  min-height: 32px;
  border-radius: 2px;
  margin-right: 12px;
  background: ${({ $depth }) => {
    // Color gradient from light to dark based on depth
    if ($depth === 0) return '#A5D6A7';  // Light green - surface
    if ($depth === 1) return '#66BB6A';  // Medium green
    if ($depth === 2) return '#43A047';  // Darker green
    return '#2E7D32';                     // Dark green - deep
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
