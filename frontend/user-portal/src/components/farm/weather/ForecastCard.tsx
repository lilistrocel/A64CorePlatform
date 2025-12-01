/**
 * ForecastCard Component
 *
 * Displays multi-day agricultural weather forecast.
 */

import styled from 'styled-components';
import type { AgriWeatherForecast, AgriWeatherForecastDay } from '../../../types/farm';
import {
  formatTemperature,
  formatPrecipitation,
  getWeatherIconUrl,
  formatWeatherDate,
} from '../../../services/weatherApi';

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

const ForecastGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
`;

const DayCard = styled.div<{ $isToday?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: ${({ $isToday }) => ($isToday ? '#EFF6FF' : '#f5f5f5')};
  border-radius: 12px;
  border: ${({ $isToday }) => ($isToday ? '2px solid #3B82F6' : '1px solid transparent')};
  transition: all 150ms ease-in-out;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
`;

const DayName = styled.div<{ $isToday?: boolean }>`
  font-size: 13px;
  font-weight: ${({ $isToday }) => ($isToday ? '600' : '500')};
  color: ${({ $isToday }) => ($isToday ? '#3B82F6' : '#616161')};
  margin-bottom: 8px;
`;

const WeatherIcon = styled.img`
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
`;

const WeatherEmoji = styled.div`
  font-size: 32px;
  margin-bottom: 8px;
`;

const TempRange = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 8px;

  .high {
    font-size: 15px;
    font-weight: 600;
    color: #212121;
  }

  .low {
    font-size: 15px;
    color: #9e9e9e;
  }
`;

const Precipitation = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #3B82F6;

  .icon {
    font-size: 12px;
  }
`;

const Description = styled.div`
  font-size: 11px;
  color: #616161;
  text-align: center;
  margin-top: 4px;
  text-transform: capitalize;
`;

const EvapotranspirationBadge = styled.div`
  font-size: 10px;
  color: #16A34A;
  background: #F0FDF4;
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 6px;
`;

const NoDataMessage = styled.div`
  text-align: center;
  padding: 24px;
  color: #9e9e9e;
  font-size: 14px;
`;

interface ForecastCardProps {
  forecast: AgriWeatherForecast;
}

function getWeatherEmoji(description?: string, icon?: string): string {
  if (!description && !icon) return '🌤️';

  const desc = (description || '').toLowerCase();
  const iconCode = (icon || '').toLowerCase();

  if (desc.includes('clear') || iconCode.includes('c01')) return '☀️';
  if (desc.includes('cloud') && desc.includes('few')) return '🌤️';
  if (desc.includes('cloud') && desc.includes('scattered')) return '⛅';
  if (desc.includes('cloud') || desc.includes('overcast')) return '☁️';
  if (desc.includes('rain') && desc.includes('heavy')) return '🌧️';
  if (desc.includes('rain') || desc.includes('drizzle')) return '🌦️';
  if (desc.includes('thunder') || desc.includes('storm')) return '⛈️';
  if (desc.includes('snow')) return '🌨️';
  if (desc.includes('fog') || desc.includes('mist')) return '🌫️';
  if (desc.includes('wind')) return '💨';

  return '🌤️';
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
        <Title>📅 8-Day Forecast</Title>
        <NoDataMessage>No forecast data available</NoDataMessage>
      </Card>
    );
  }

  return (
    <Card>
      <Title>📅 8-Day Forecast</Title>

      <ForecastGrid>
        {forecast.days.slice(0, 8).map((day, index) => {
          const iconUrl = getWeatherIconUrl(day.icon);
          const todayFlag = isToday(day.date);

          return (
            <DayCard key={day.date} $isToday={todayFlag}>
              <DayName $isToday={todayFlag}>
                {todayFlag ? 'Today' : formatWeatherDate(day.date)}
              </DayName>

              {iconUrl ? (
                <WeatherIcon src={iconUrl} alt={day.description || ''} />
              ) : (
                <WeatherEmoji>{getWeatherEmoji(day.description, day.icon)}</WeatherEmoji>
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
                  <span className="icon">💧</span>
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
