/**
 * AirQualityCard Component
 *
 * Displays air quality index (AQI), pollutant concentrations, and pollen levels.
 */

import styled from 'styled-components';
import type { AirQuality } from '../../../types/farm';
import { AQI_CATEGORY_COLORS, POLLEN_LEVEL_LABELS } from '../../../types/farm';

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

const AQIHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background: #f5f5f5;
  border-radius: 12px;
`;

const AQIValue = styled.div<{ $color: string }>`
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: ${({ $color }) => $color};
  color: white;

  .number {
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
  }

  .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.9;
  }
`;

const AQIInfo = styled.div`
  flex: 1;

  .category {
    font-size: 16px;
    font-weight: 600;
    color: #212121;
    margin-bottom: 4px;
  }

  .description {
    font-size: 13px;
    color: #616161;
  }
`;

const SectionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
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

const MetricItem = styled.div`
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

  .label {
    font-size: 13px;
    color: #616161;
  }

  .value {
    font-size: 14px;
    font-weight: 600;
    color: #212121;
  }
`;

const PollenLevel = styled.div<{ $level: number }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;

  background: ${({ $level }) => {
    if ($level === 0) return '#E5E7EB';   // None - gray
    if ($level === 1) return '#D1FAE5';   // Low - green
    if ($level === 2) return '#FEF3C7';   // Moderate - yellow
    if ($level === 3) return '#FED7AA';   // High - orange
    return '#FECACA';                      // Very High - red
  }};

  color: ${({ $level }) => {
    if ($level === 0) return '#6B7280';   // None - gray
    if ($level === 1) return '#065F46';   // Low - green
    if ($level === 2) return '#92400E';   // Moderate - yellow
    if ($level === 3) return '#C2410C';   // High - orange
    return '#B91C1C';                      // Very High - red
  }};
`;

const NoDataMessage = styled.div`
  text-align: center;
  padding: 24px;
  color: #9e9e9e;
  font-size: 14px;
`;

interface AirQualityCardProps {
  airQuality: AirQuality;
}

function getAQIDescription(category: string | undefined): string {
  const descriptions: Record<string, string> = {
    'Good': 'Air quality is satisfactory and poses little or no health risk.',
    'Moderate': 'Air quality is acceptable; some pollutants may affect sensitive groups.',
    'Unhealthy for Sensitive Groups': 'Members of sensitive groups may experience health effects.',
    'Unhealthy': 'Everyone may begin to experience health effects.',
    'Very Unhealthy': 'Health alert: everyone may experience more serious health effects.',
    'Hazardous': 'Health warning of emergency conditions - entire population likely affected.',
  };
  return descriptions[category || ''] || 'Air quality information not available.';
}

function formatConcentration(value: number | undefined): string {
  if (value === undefined || value === null) return 'N/A';
  return `${value.toFixed(1)} µg/m³`;
}

export function AirQualityCard({ airQuality }: AirQualityCardProps) {
  // Check if we have any meaningful data
  const hasAQI = airQuality.aqi !== undefined;
  const hasPollutants =
    airQuality.pm25 !== undefined ||
    airQuality.pm10 !== undefined ||
    airQuality.o3 !== undefined ||
    airQuality.no2 !== undefined ||
    airQuality.so2 !== undefined ||
    airQuality.co !== undefined;
  const hasPollen =
    airQuality.pollenTree !== undefined ||
    airQuality.pollenGrass !== undefined ||
    airQuality.pollenWeed !== undefined ||
    airQuality.moldLevel !== undefined;

  const hasAnyData = hasAQI || hasPollutants || hasPollen;

  if (!hasAnyData) {
    return (
      <Card>
        <Title>🌬️ Air Quality</Title>
        <NoDataMessage>
          Air quality data requires a WeatherBit paid plan
        </NoDataMessage>
      </Card>
    );
  }

  const aqiColor = airQuality.aqiCategory
    ? AQI_CATEGORY_COLORS[airQuality.aqiCategory] || '#6B7280'
    : '#6B7280';

  return (
    <Card>
      <Title>🌬️ Air Quality</Title>

      {/* AQI Header */}
      {hasAQI && (
        <AQIHeader>
          <AQIValue $color={aqiColor}>
            <span className="number">{airQuality.aqi}</span>
            <span className="label">AQI</span>
          </AQIValue>
          <AQIInfo>
            <div className="category">{airQuality.aqiCategory || 'Unknown'}</div>
            <div className="description">{getAQIDescription(airQuality.aqiCategory)}</div>
          </AQIInfo>
        </AQIHeader>
      )}

      <SectionsGrid>
        {/* Pollutants */}
        {hasPollutants && (
          <Section>
            <h4>Pollutants</h4>
            {airQuality.pm25 !== undefined && (
              <MetricItem>
                <span className="label">PM2.5</span>
                <span className="value">{formatConcentration(airQuality.pm25)}</span>
              </MetricItem>
            )}
            {airQuality.pm10 !== undefined && (
              <MetricItem>
                <span className="label">PM10</span>
                <span className="value">{formatConcentration(airQuality.pm10)}</span>
              </MetricItem>
            )}
            {airQuality.o3 !== undefined && (
              <MetricItem>
                <span className="label">Ozone (O₃)</span>
                <span className="value">{formatConcentration(airQuality.o3)}</span>
              </MetricItem>
            )}
            {airQuality.no2 !== undefined && (
              <MetricItem>
                <span className="label">NO₂</span>
                <span className="value">{formatConcentration(airQuality.no2)}</span>
              </MetricItem>
            )}
            {airQuality.so2 !== undefined && (
              <MetricItem>
                <span className="label">SO₂</span>
                <span className="value">{formatConcentration(airQuality.so2)}</span>
              </MetricItem>
            )}
            {airQuality.co !== undefined && (
              <MetricItem>
                <span className="label">CO</span>
                <span className="value">{formatConcentration(airQuality.co)}</span>
              </MetricItem>
            )}
          </Section>
        )}

        {/* Pollen & Mold */}
        {hasPollen && (
          <Section>
            <h4>Pollen & Allergens</h4>
            {airQuality.pollenTree !== undefined && (
              <MetricItem>
                <span className="label">Tree Pollen</span>
                <PollenLevel $level={airQuality.pollenTree}>
                  {POLLEN_LEVEL_LABELS[airQuality.pollenTree] || 'Unknown'}
                </PollenLevel>
              </MetricItem>
            )}
            {airQuality.pollenGrass !== undefined && (
              <MetricItem>
                <span className="label">Grass Pollen</span>
                <PollenLevel $level={airQuality.pollenGrass}>
                  {POLLEN_LEVEL_LABELS[airQuality.pollenGrass] || 'Unknown'}
                </PollenLevel>
              </MetricItem>
            )}
            {airQuality.pollenWeed !== undefined && (
              <MetricItem>
                <span className="label">Weed Pollen</span>
                <PollenLevel $level={airQuality.pollenWeed}>
                  {POLLEN_LEVEL_LABELS[airQuality.pollenWeed] || 'Unknown'}
                </PollenLevel>
              </MetricItem>
            )}
            {airQuality.moldLevel !== undefined && (
              <MetricItem>
                <span className="label">Mold</span>
                <PollenLevel $level={airQuality.moldLevel}>
                  {POLLEN_LEVEL_LABELS[airQuality.moldLevel] || 'Unknown'}
                </PollenLevel>
              </MetricItem>
            )}
            {airQuality.predominantPollen && (
              <MetricItem>
                <span className="label">Predominant</span>
                <span className="value">{airQuality.predominantPollen}</span>
              </MetricItem>
            )}
          </Section>
        )}
      </SectionsGrid>
    </Card>
  );
}
