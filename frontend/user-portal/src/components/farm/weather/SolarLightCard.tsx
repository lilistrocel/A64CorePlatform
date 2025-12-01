/**
 * SolarLightCard Component
 *
 * Displays solar radiation, UV index, irradiance, and sun position data.
 */

import styled from 'styled-components';
import type { SolarData } from '../../../types/farm';

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

const SunTimesRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
`;

const SunTimeBox = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%);
  border-radius: 8px;

  .icon {
    font-size: 24px;
  }

  .text {
    .label {
      font-size: 11px;
      color: #9A3412;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .time {
      font-size: 16px;
      font-weight: 600;
      color: #C2410C;
    }
  }
`;

const UVIndicator = styled.div<{ $level: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;

  background: ${({ $level }) => {
    switch ($level) {
      case 'low': return '#D1FAE5';
      case 'moderate': return '#FEF3C7';
      case 'high': return '#FED7AA';
      case 'very_high': return '#FECACA';
      case 'extreme': return '#E9D5FF';
      default: return '#F3F4F6';
    }
  }};

  color: ${({ $level }) => {
    switch ($level) {
      case 'low': return '#065F46';
      case 'moderate': return '#92400E';
      case 'high': return '#C2410C';
      case 'very_high': return '#B91C1C';
      case 'extreme': return '#7C3AED';
      default: return '#374151';
    }
  }};
`;

const NoDataMessage = styled.div`
  text-align: center;
  padding: 24px;
  color: #9e9e9e;
  font-size: 14px;
`;

interface SolarLightCardProps {
  solar: SolarData;
}

function getUVLevel(uv: number): 'low' | 'moderate' | 'high' | 'very_high' | 'extreme' {
  if (uv <= 2) return 'low';
  if (uv <= 5) return 'moderate';
  if (uv <= 7) return 'high';
  if (uv <= 10) return 'very_high';
  return 'extreme';
}

function getUVLabel(uv: number): string {
  const level = getUVLevel(uv);
  const labels: Record<string, string> = {
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    very_high: 'Very High',
    extreme: 'Extreme',
  };
  return labels[level];
}

function formatRadiation(value: number | undefined): string {
  if (value === undefined || value === null) return 'N/A';
  return `${value.toFixed(0)} W/m²`;
}

function formatAngle(value: number | undefined): string {
  if (value === undefined || value === null) return 'N/A';
  return `${value.toFixed(1)}°`;
}

export function SolarLightCard({ solar }: SolarLightCardProps) {
  // Check if we have any meaningful data
  const hasRadiationData = solar.solarRadiation !== undefined || solar.ghi !== undefined;
  const hasUVData = solar.uvIndex !== undefined;
  const hasSunTimes = solar.sunrise !== undefined || solar.sunset !== undefined;
  const hasSunPosition = solar.sunElevation !== undefined || solar.sunAzimuth !== undefined;
  const hasIrradianceData = solar.ghi !== undefined || solar.dni !== undefined || solar.dhi !== undefined;
  const hasDownwardRadiation = solar.dswrfAvg !== undefined || solar.dlwrfAvg !== undefined;

  const hasAnyData = hasRadiationData || hasUVData || hasSunTimes || hasSunPosition || hasIrradianceData || hasDownwardRadiation;

  if (!hasAnyData) {
    return (
      <Card>
        <Title>☀️ Solar & Light</Title>
        <NoDataMessage>
          Solar and light data is not available for this location
        </NoDataMessage>
      </Card>
    );
  }

  return (
    <Card>
      <Title>☀️ Solar & Light</Title>

      {/* Sunrise/Sunset times at the top if available */}
      {hasSunTimes && (
        <SunTimesRow>
          {solar.sunrise && (
            <SunTimeBox>
              <span className="icon">🌅</span>
              <div className="text">
                <div className="label">Sunrise</div>
                <div className="time">{solar.sunrise}</div>
              </div>
            </SunTimeBox>
          )}
          {solar.sunset && (
            <SunTimeBox>
              <span className="icon">🌇</span>
              <div className="text">
                <div className="label">Sunset</div>
                <div className="time">{solar.sunset}</div>
              </div>
            </SunTimeBox>
          )}
        </SunTimesRow>
      )}

      <SectionsGrid>
        {/* Solar Radiation & UV */}
        {(hasRadiationData || hasUVData) && (
          <Section>
            <h4>Solar Radiation</h4>
            {solar.solarRadiation !== undefined && (
              <MetricItem>
                <span className="label">Solar Radiation</span>
                <span className="value">{formatRadiation(solar.solarRadiation)}</span>
              </MetricItem>
            )}
            {solar.uvIndex !== undefined && (
              <MetricItem>
                <span className="label">UV Index</span>
                <UVIndicator $level={getUVLevel(solar.uvIndex)}>
                  {solar.uvIndex.toFixed(1)} - {getUVLabel(solar.uvIndex)}
                </UVIndicator>
              </MetricItem>
            )}
          </Section>
        )}

        {/* Sun Position */}
        {hasSunPosition && (
          <Section>
            <h4>Sun Position</h4>
            {solar.sunElevation !== undefined && (
              <MetricItem>
                <span className="label">Elevation</span>
                <span className="value">{formatAngle(solar.sunElevation)}</span>
              </MetricItem>
            )}
            {solar.sunAzimuth !== undefined && (
              <MetricItem>
                <span className="label">Hour Angle</span>
                <span className="value">{formatAngle(solar.sunAzimuth)}</span>
              </MetricItem>
            )}
          </Section>
        )}

        {/* Irradiance Components */}
        {hasIrradianceData && (
          <Section>
            <h4>Irradiance</h4>
            {solar.ghi !== undefined && (
              <MetricItem>
                <span className="label">GHI (Global)</span>
                <span className="value">{formatRadiation(solar.ghi)}</span>
              </MetricItem>
            )}
            {solar.dni !== undefined && (
              <MetricItem>
                <span className="label">DNI (Direct)</span>
                <span className="value">{formatRadiation(solar.dni)}</span>
              </MetricItem>
            )}
            {solar.dhi !== undefined && (
              <MetricItem>
                <span className="label">DHI (Diffuse)</span>
                <span className="value">{formatRadiation(solar.dhi)}</span>
              </MetricItem>
            )}
          </Section>
        )}

        {/* Downward Radiation (from AgWeather) */}
        {hasDownwardRadiation && (
          <Section>
            <h4>Downward Radiation</h4>
            {solar.dswrfAvg !== undefined && (
              <MetricItem>
                <span className="label">Shortwave Avg</span>
                <span className="value">{formatRadiation(solar.dswrfAvg)}</span>
              </MetricItem>
            )}
            {solar.dswrfMax !== undefined && (
              <MetricItem>
                <span className="label">Shortwave Max</span>
                <span className="value">{formatRadiation(solar.dswrfMax)}</span>
              </MetricItem>
            )}
            {solar.dlwrfAvg !== undefined && (
              <MetricItem>
                <span className="label">Longwave Avg</span>
                <span className="value">{formatRadiation(solar.dlwrfAvg)}</span>
              </MetricItem>
            )}
            {solar.dlwrfMax !== undefined && (
              <MetricItem>
                <span className="label">Longwave Max</span>
                <span className="value">{formatRadiation(solar.dlwrfMax)}</span>
              </MetricItem>
            )}
          </Section>
        )}
      </SectionsGrid>
    </Card>
  );
}
