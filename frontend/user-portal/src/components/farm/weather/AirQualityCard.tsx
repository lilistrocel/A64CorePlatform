/**
 * AirQualityCard Component
 *
 * Displays air quality index (AQI), pollutant concentrations, and pollen levels.
 */

import styled from 'styled-components';
import { Wind } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import type { AirQuality } from '../../../types/farm';
import { POLLEN_LEVEL_LABELS } from '../../../types/farm';

// ─── Night Observatory data-encoding colour ramps (T-901 spec §3) ─────────
// Both scales below are METEOROLOGICAL SEVERITY encodings, not decoration —
// their ordering (low -> high severity) and perceptual separation are load
// bearing. They intentionally do NOT come from types/farm.ts's
// AQI_CATEGORY_COLORS (that file is out of scope for this sweep and still
// anchors on the old success/warning/terracotta[n] tokens) — the map is
// redefined locally against colors.bright.* per the spec's ramp guidance.

/** `#rrggbb` -> `rgba(r,g,b,alpha)`. Local copy of the same helper
 * mixins.ts uses internally (not exported) — needed to build the 16%/45%
 * badge tints for the pollen pills. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** AQI category ramp — 6 steps, more than the 4 warm/cool anchor hues the
 * brief suggests (emerald/gold/terra/coral) offer on their own. The two
 * "for sensitive groups" / "very" in-between categories are NOT new hues —
 * each is a 50% opacity overlay of the next bright.* hue on top of the
 * previous one (i.e. walking opacity between two adjacent named hues),
 * precomputed to a solid hex so the AQI tile stays a clean opaque swatch
 * instead of showing the glass backdrop through a translucent fill. */
function getAqiColor(category: string | undefined): string {
  switch (category) {
    case 'Good': return '#54D39B'; // bright.emerald
    case 'Moderate': return '#E8C86A'; // bright.gold
    case 'Unhealthy for Sensitive Groups': return '#E8AE65'; // gold -> terra, 50%
    case 'Unhealthy': return '#E8935F'; // bright.terra
    case 'Very Unhealthy': return '#EC8F68'; // terra -> coral, 50%
    case 'Hazardous': return '#F08A70'; // bright.coral
    default: return '#8B90AC'; // muted — unknown category
  }
}

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
`;

// Second glass layer over the Card (spec §2's two-layer limit) — small-radius
// glassControl, no shadow, appropriate for a highlighted inner block.
const AQIHeader = styled.div`
  ${glassControl}
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
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
  /* Every bright.* AQI hue is a light/mid pastel tone, so dark text reads
     far better here than cream (onDark) would — this is a dynamic
     data-viz swatch, not a themed lapis/coral/emerald UI fill, so the
     onAccent/onDark button pair doesn't apply; cosmos is used directly. */
  color: ${({ theme }) => theme.colors.cosmos};

  .number {
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
  }

  .label {
    ${monoLabel}
    font-size: 0.56rem;
    opacity: 0.85;
  }
`;

const AQIInfo = styled.div`
  flex: 1;

  .category {
    font-size: 16px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
    margin-bottom: 4px;
  }

  .description {
    font-size: 13px;
    color: ${({ theme }) => theme.colors.muted};
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
    ${monoLabel}
    font-size: 0.68rem;
    color: ${({ theme }) => theme.colors.celeste};
    margin: 0 0 12px 0;
  }
`;

// Flat rows (not a third glass layer) — line divider on hover, matching the
// spec §4 Tables pattern rather than nesting another glass surface inside
// AQIHeader/Card.
const MetricItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 6px;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }

  &:last-child {
    margin-bottom: 0;
  }

  .label {
    font-size: 13px;
    color: ${({ theme }) => theme.colors.muted};
  }

  .value {
    ${monoLabel}
    font-size: 0.76rem;
    letter-spacing: 0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const PollenLevel = styled.div<{ $level: number }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.62rem;
  font-weight: 700;

  background: ${({ $level }) => {
    // Pollen/mold severity ramp — 5 discrete steps map 1:1 onto the
    // available bright hues (no opacity-walking needed here): the palette
    // has exactly enough anchors to preserve order and separation.
    const hue = pollenHue($level);
    return hue ? hexToRgba(hue, 0.16) : hexToRgba('#8B90AC', 0.14);
  }};
  border: 1px solid ${({ $level }) => {
    const hue = pollenHue($level);
    return hue ? hexToRgba(hue, 0.45) : hexToRgba('#8B90AC', 0.35);
  }};
  color: ${({ $level, theme }) => pollenHue($level) ?? theme.colors.muted};
`;

function pollenHue(level: number): string | null {
  switch (level) {
    case 1: return '#54D39B'; // bright.emerald — Low
    case 2: return '#E8C86A'; // bright.gold — Moderate
    case 3: return '#E8935F'; // bright.terra — High
    case 4: return '#F08A70'; // bright.coral — Very High
    default: return null; // 0 / None — neutral, not a severity colour
  }
}

const NoDataMessage = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.muted};
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
        <Title><Wind size={16} strokeWidth={1.6} /> Air Quality</Title>
        <NoDataMessage>
          Air quality data requires a WeatherBit paid plan
        </NoDataMessage>
      </Card>
    );
  }

  const aqiColor = getAqiColor(airQuality.aqiCategory);

  return (
    <Card>
      <Title><Wind size={16} strokeWidth={1.6} /> Air Quality</Title>

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
