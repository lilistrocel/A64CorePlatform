/**
 * SolarLightCard Component
 *
 * Displays solar radiation, UV index, irradiance, sun position data,
 * and calculated PAR/PPFD values for agricultural use.
 */

import styled from 'styled-components';
import type { SolarData } from '../../../types/farm';

/**
 * PAR Conversion Constants
 *
 * PAR (Photosynthetically Active Radiation) = 400-700nm wavelength
 * PPFD (Photosynthetic Photon Flux Density) = photons in PAR range
 *
 * Conversion: PPFD (µmol/m²/s) = Solar Radiation (W/m²) × PAR_FRACTION × PHOTON_CONVERSION
 *
 * PAR_FRACTION: ~0.45 of total solar radiation is in PAR range (varies 0.41-0.48)
 * PHOTON_CONVERSION: 4.57 µmol/J (energy to photon conversion for PAR wavelengths)
 *
 * Accuracy: ±10-15% under varying atmospheric conditions
 */
const PAR_FRACTION = 0.45; // Fraction of solar radiation in PAR range
const PHOTON_CONVERSION = 4.57; // µmol photons per Joule

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

const DualValueItem = styled.div`
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }

  .label {
    font-size: 13px;
    color: #616161;
    margin-bottom: 6px;
  }

  .values {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .value-group {
    display: flex;
    flex-direction: column;

    .value {
      font-size: 14px;
      font-weight: 600;
      color: #212121;
    }

    .unit-label {
      font-size: 10px;
      color: #9e9e9e;
      text-transform: uppercase;
    }
  }

  .par-value {
    .value {
      color: #16A34A;
    }
  }
`;

const EstimatedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #9e9e9e;
  margin-left: 4px;

  &::before {
    content: '~';
  }
`;

const DLIHighlight = styled.div`
  background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
  border: 1px solid #A7F3D0;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 16px;

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .icon {
      font-size: 18px;
    }

    .title {
      font-size: 13px;
      font-weight: 600;
      color: #065F46;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  }

  .value-row {
    display: flex;
    align-items: baseline;
    gap: 8px;

    .value {
      font-size: 24px;
      font-weight: 700;
      color: #047857;
    }

    .unit {
      font-size: 12px;
      color: #059669;
    }
  }

  .note {
    font-size: 11px;
    color: #6B7280;
    margin-top: 6px;
  }
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

/**
 * Convert solar radiation (W/m²) to PPFD (µmol/m²/s)
 * Formula: PPFD = Solar Radiation × PAR_FRACTION × PHOTON_CONVERSION
 */
function solarToPPFD(solarRadiation: number | undefined): number | undefined {
  if (solarRadiation === undefined || solarRadiation === null) return undefined;
  return solarRadiation * PAR_FRACTION * PHOTON_CONVERSION;
}

function formatPPFD(value: number | undefined): string {
  if (value === undefined || value === null) return 'N/A';
  if (value < 1) return '0 µmol/m²/s';
  return `${value.toFixed(0)} µmol/m²/s`;
}

/**
 * Calculate Daily Light Integral (DLI) from average radiation and daylight hours
 * DLI (mol/m²/day) = PPFD (µmol/m²/s) × daylight_hours × 3600 / 1,000,000
 */
function calculateDLI(avgRadiation: number | undefined, daylightHours: number = 12): number | undefined {
  if (avgRadiation === undefined || avgRadiation === null) return undefined;
  const ppfd = solarToPPFD(avgRadiation);
  if (ppfd === undefined) return undefined;
  return (ppfd * daylightHours * 3600) / 1000000;
}

function formatDLI(value: number | undefined): string {
  if (value === undefined || value === null) return 'N/A';
  return `${value.toFixed(1)} mol/m²/day`;
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

  // Calculate PAR/PPFD values
  const currentPPFD = solarToPPFD(solar.solarRadiation);
  const avgPPFD = solarToPPFD(solar.dswrfAvg);
  const maxPPFD = solarToPPFD(solar.dswrfMax);

  // Calculate DLI (assuming ~11 hours daylight for UAE region)
  const dli = calculateDLI(solar.dswrfAvg, 11);

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

      {/* DLI Highlight - Important metric for agriculture */}
      {dli !== undefined && dli > 0 && (
        <DLIHighlight>
          <div className="header">
            <span className="icon">🌱</span>
            <span className="title">Daily Light Integral (DLI)</span>
          </div>
          <div className="value-row">
            <span className="value">{dli.toFixed(1)}</span>
            <span className="unit">mol/m²/day</span>
          </div>
          <div className="note">Estimated from solar radiation (±10-15%)</div>
        </DLIHighlight>
      )}

      <SectionsGrid>
        {/* Solar Radiation & PAR/PPFD */}
        {(hasRadiationData || hasUVData) && (
          <Section>
            <h4>Current Light Levels</h4>
            {solar.solarRadiation !== undefined && (
              <DualValueItem>
                <span className="label">Solar Radiation / PPFD</span>
                <div className="values">
                  <div className="value-group">
                    <span className="value">{formatRadiation(solar.solarRadiation)}</span>
                    <span className="unit-label">Irradiance</span>
                  </div>
                  <div className="value-group par-value">
                    <span className="value">{formatPPFD(currentPPFD)}<EstimatedBadge>est</EstimatedBadge></span>
                    <span className="unit-label">PAR (PPFD)</span>
                  </div>
                </div>
              </DualValueItem>
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

        {/* Daily PAR/PPFD (from AgWeather shortwave radiation) */}
        {hasDownwardRadiation && (
          <Section>
            <h4>Daily PAR Estimates</h4>
            {solar.dswrfAvg !== undefined && (
              <DualValueItem>
                <span className="label">Average (Daily)</span>
                <div className="values">
                  <div className="value-group">
                    <span className="value">{formatRadiation(solar.dswrfAvg)}</span>
                    <span className="unit-label">Irradiance</span>
                  </div>
                  <div className="value-group par-value">
                    <span className="value">{formatPPFD(avgPPFD)}<EstimatedBadge>est</EstimatedBadge></span>
                    <span className="unit-label">PAR (PPFD)</span>
                  </div>
                </div>
              </DualValueItem>
            )}
            {solar.dswrfMax !== undefined && (
              <DualValueItem>
                <span className="label">Peak (Maximum)</span>
                <div className="values">
                  <div className="value-group">
                    <span className="value">{formatRadiation(solar.dswrfMax)}</span>
                    <span className="unit-label">Irradiance</span>
                  </div>
                  <div className="value-group par-value">
                    <span className="value">{formatPPFD(maxPPFD)}<EstimatedBadge>est</EstimatedBadge></span>
                    <span className="unit-label">PAR (PPFD)</span>
                  </div>
                </div>
              </DualValueItem>
            )}
          </Section>
        )}
      </SectionsGrid>
    </Card>
  );
}
