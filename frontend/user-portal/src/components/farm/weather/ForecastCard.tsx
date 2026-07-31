/**
 * ForecastCard Component
 *
 * Displays multi-day agricultural weather forecast.
 */

import styled from 'styled-components';
import type { LucideIcon } from 'lucide-react';
import {
  Calendar,
  Droplet,
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Wind,
} from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import type { AgriWeatherForecast, AgriWeatherForecastDay } from '../../../types/farm';
import {
  formatPrecipitation,
  getWeatherIconUrl,
  formatWeatherDate,
} from '../../../services/weatherApi';

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

const ForecastGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
`;

// Day tiles stay flat (no nested blur) rather than a second glassControl
// layer repeated 8x — the spec's "no more than two glass layers" rule is
// about depth, but eight independently-blurred tiles inside one glassPanel
// is unnecessary GPU cost for the same visual read; a translucent tint row
// (matching the §4 Tables hover pattern) reads identically without it.
const DayCard = styled.div<{ $isToday?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: ${({ $isToday }) =>
    $isToday ? 'rgba(107, 138, 224, 0.12)' : 'rgba(180, 200, 220, 0.04)'};
  border-radius: 12px;
  border: 1px solid ${({ $isToday }) => ($isToday ? 'rgba(107, 138, 224, 0.4)' : 'transparent')};
  transition: all 150ms ease-in-out;

  &:hover {
    transform: translateY(-2px);
    background: rgba(180, 200, 220, 0.08);
  }
`;

const DayName = styled.div<{ $isToday?: boolean }>`
  ${monoLabel}
  font-size: 0.66rem;
  font-weight: ${({ $isToday }) => ($isToday ? '700' : '600')};
  color: ${({ $isToday, theme }) => ($isToday ? theme.colors.bright.lapis : theme.colors.celeste)};
  margin-bottom: 8px;
`;

const WeatherIcon = styled.img`
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
`;

const WeatherIconFallback = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
  color: ${({ theme }) => theme.colors.celeste};
`;

const TempRange = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  ${monoLabel}
  font-size: 0.8rem;
  letter-spacing: 0.02em;

  .high {
    font-weight: 700;
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  .low {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Precipitation = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  ${monoLabel}
  font-size: 0.62rem;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.bright.lapis};

  .icon {
    display: flex;
  }
`;

const Description = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
  margin-top: 4px;
  text-transform: capitalize;
`;

const EvapotranspirationBadge = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.success};
  background: ${({ theme }) => theme.colors.successBg};
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 6px;
`;

const NoDataMessage = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

interface ForecastCardProps {
  forecast: AgriWeatherForecast;
}

// Weather-condition icon — categorical (sunny/cloudy/rainy/...), not an
// ordinal severity ramp, so icon SHAPE carries the meaning (as the spec's
// emoji->lucide table already does for 🌫->CloudFog, 💨->Wind, ☀->Sun etc.)
// rather than colour; colour stays the informational `celeste` used above.
function getWeatherIcon(description?: string, icon?: string): LucideIcon {
  if (!description && !icon) return CloudSun;

  const desc = (description || '').toLowerCase();
  const iconCode = (icon || '').toLowerCase();

  if (desc.includes('clear') || iconCode.includes('c01')) return Sun;
  if (desc.includes('cloud') && desc.includes('few')) return CloudSun;
  if (desc.includes('cloud') && desc.includes('scattered')) return Cloud;
  if (desc.includes('cloud') || desc.includes('overcast')) return Cloud;
  if (desc.includes('rain') && desc.includes('heavy')) return CloudRain;
  if (desc.includes('rain') || desc.includes('drizzle')) return CloudDrizzle;
  if (desc.includes('thunder') || desc.includes('storm')) return CloudLightning;
  if (desc.includes('snow')) return CloudSnow;
  if (desc.includes('fog') || desc.includes('mist')) return CloudFog;
  if (desc.includes('wind')) return Wind;

  return CloudSun;
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const date = new Date(dateStr);
  return (
    today.getFullYear() === date.getFullYear() &&
    today.getMonth() === date.getMonth() &&
    today.getDate() === date.getDate()
  );
}

export function ForecastCard({ forecast }: ForecastCardProps) {
  if (!forecast.days || forecast.days.length === 0) {
    return (
      <Card>
        <Title><Calendar size={16} strokeWidth={1.6} /> 8-Day Forecast</Title>
        <NoDataMessage>No forecast data available</NoDataMessage>
      </Card>
    );
  }

  return (
    <Card>
      <Title><Calendar size={16} strokeWidth={1.6} /> 8-Day Forecast</Title>

      <ForecastGrid>
        {forecast.days.slice(0, 8).map((day) => {
          const iconUrl = getWeatherIconUrl(day.icon);
          const todayFlag = isToday(day.date);
          const ConditionIcon = getWeatherIcon(day.description, day.icon);

          return (
            <DayCard key={day.date} $isToday={todayFlag}>
              <DayName $isToday={todayFlag}>
                {todayFlag ? 'Today' : formatWeatherDate(day.date)}
              </DayName>

              {iconUrl ? (
                <WeatherIcon src={iconUrl} alt={day.description || ''} />
              ) : (
                <WeatherIconFallback>
                  <ConditionIcon size={26} strokeWidth={1.6} />
                </WeatherIconFallback>
              )}

              <TempRange>
                <span className="high">
                  {day.tempHigh !== undefined ? `${Math.round(day.tempHigh)}°` : '--'}
                </span>
                <span className="low">
                  {day.tempLow !== undefined ? `${Math.round(day.tempLow)}°` : '--'}
                </span>
              </TempRange>

              {(day.precipitation !== undefined && day.precipitation > 0) && (
                <Precipitation>
                  <span className="icon"><Droplet size={12} strokeWidth={1.6} /></span>
                  <span>{formatPrecipitation(day.precipitation)}</span>
                </Precipitation>
              )}

              {day.precipitationProbability !== undefined && day.precipitationProbability > 0 && (
                <Precipitation>
                  <span>{day.precipitationProbability}% chance</span>
                </Precipitation>
              )}

              {day.evapotranspiration !== undefined && (
                <EvapotranspirationBadge>
                  ET0: {day.evapotranspiration.toFixed(1)}mm
                </EvapotranspirationBadge>
              )}

              {day.description && (
                <Description>{day.description}</Description>
              )}
            </DayCard>
          );
        })}
      </ForecastGrid>
    </Card>
  );
}
