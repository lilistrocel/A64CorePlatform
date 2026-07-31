/**
 * CurrentWeatherCard Component
 *
 * Displays current weather conditions for a farm.
 */

import styled from 'styled-components';
import { Droplet, Wind, CloudRain, Sun, Eye, Gauge } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import type { CurrentWeather } from '../../../types/farm';
import {
  formatTemperature,
  formatWindSpeed,
  formatHumidity,
  formatPrecipitation,
  getWeatherIconUrl,
  formatWeatherDateTime,
  getWindDirectionArrow,
} from '../../../services/weatherApi';
import { formatNumber } from '../../../utils';

// Night Observatory (T-901): was a solid lapis gradient hero card with
// onAccent (white) text. Restyled to the standard glassPanel treatment —
// hero-stat cards elsewhere in the redesign (e.g. BlockMonitorHero) use glass
// too, not a solid accent fill; solid gradient fills are reserved for the
// gold primary-button treatment. onAccent removed entirely (was sitting on a
// lapis fill, not gold) in favour of the normal textPrimary/celeste/muted
// tokens the glass surface already contrasts correctly against.
const Card = styled.div`
  ${glassPanel}
  padding: 24px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
`;

const Location = styled.div`
  h3 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 4px 0;
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  p {
    font-size: 13px;
    color: ${({ theme }) => theme.colors.muted};
    margin: 0;
  }
`;

const WeatherIcon = styled.img`
  width: 64px;
  height: 64px;
`;

const MainTemp = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
`;

const Temperature = styled.div`
  font-size: 64px;
  font-weight: 300;
  line-height: 1;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TempDetails = styled.div`
  padding-top: 8px;

  .description {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 4px;
    text-transform: capitalize;
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  .feels-like {
    font-size: 14px;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const Metric = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  .icon {
    display: flex;
    color: ${({ theme }) => theme.colors.celeste};
    flex-shrink: 0;
  }

  .content {
    .label {
      ${monoLabel}
      font-size: 0.62rem;
      color: ${({ theme }) => theme.colors.muted};
    }

    .value {
      ${monoLabel}
      font-size: 0.82rem;
      letter-spacing: 0.02em;
      color: ${({ theme }) => theme.colors.textPrimary};
      margin-top: 2px;
    }
  }
`;

const UpdatedAt = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  text-align: right;
  margin-top: 16px;
`;

interface CurrentWeatherCardProps {
  weather: CurrentWeather;
}

export function CurrentWeatherCard({ weather }: CurrentWeatherCardProps) {
  const iconUrl = getWeatherIconUrl(weather.icon);

  return (
    <Card>
      <Header>
        <Location>
          <h3>Current Weather</h3>
          <p>
            {weather.city && weather.country
              ? `${weather.city}, ${weather.country}`
              : `${formatNumber(weather.latitude, { decimals: 2 })}°, ${formatNumber(weather.longitude, { decimals: 2 })}°`}
          </p>
        </Location>
        {iconUrl && <WeatherIcon src={iconUrl} alt={weather.description} />}
      </Header>

      <MainTemp>
        <Temperature>{formatNumber(Math.round(weather.temperature))}°</Temperature>
        <TempDetails>
          <div className="description">{weather.description}</div>
          {weather.feelsLike !== undefined && (
            <div className="feels-like">
              Feels like {formatTemperature(weather.feelsLike, 0)}
            </div>
          )}
        </TempDetails>
      </MainTemp>

      <MetricsGrid>
        <Metric>
          <span className="icon"><Droplet size={16} strokeWidth={1.6} /></span>
          <div className="content">
            <div className="label">Humidity</div>
            <div className="value">{formatHumidity(weather.humidity)}</div>
          </div>
        </Metric>

        <Metric>
          <span className="icon"><Wind size={16} strokeWidth={1.6} /></span>
          <div className="content">
            <div className="label">Wind</div>
            <div className="value">
              {formatWindSpeed(weather.windSpeed)}{' '}
              {getWindDirectionArrow(weather.windDirection)}
            </div>
          </div>
        </Metric>

        <Metric>
          <span className="icon"><CloudRain size={16} strokeWidth={1.6} /></span>
          <div className="content">
            <div className="label">Precipitation</div>
            <div className="value">{formatPrecipitation(weather.precipitation)}</div>
          </div>
        </Metric>

        <Metric>
          <span className="icon"><Sun size={16} strokeWidth={1.6} /></span>
          <div className="content">
            <div className="label">UV Index</div>
            <div className="value">
              {weather.uvIndex !== undefined ? weather.uvIndex.toFixed(1) : 'N/A'}
            </div>
          </div>
        </Metric>

        {weather.visibility !== undefined && (
          <Metric>
            <span className="icon"><Eye size={16} strokeWidth={1.6} /></span>
            <div className="content">
              <div className="label">Visibility</div>
              <div className="value">{weather.visibility.toFixed(1)} km</div>
            </div>
          </Metric>
        )}

        {weather.pressure !== undefined && (
          <Metric>
            <span className="icon"><Gauge size={16} strokeWidth={1.6} /></span>
            <div className="content">
              <div className="label">Pressure</div>
              <div className="value">{Math.round(weather.pressure)} mb</div>
            </div>
          </Metric>
        )}
      </MetricsGrid>

      <UpdatedAt>
        Updated: {formatWeatherDateTime(weather.observedAt)}
      </UpdatedAt>
    </Card>
  );
}
