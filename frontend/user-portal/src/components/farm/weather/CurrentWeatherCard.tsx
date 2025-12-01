/**
 * CurrentWeatherCard Component
 *
 * Displays current weather conditions for a farm.
 */

import styled from 'styled-components';
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

const Card = styled.div`
  background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
  border-radius: 16px;
  padding: 24px;
  color: white;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
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
  }

  p {
    font-size: 13px;
    opacity: 0.8;
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
`;

const TempDetails = styled.div`
  padding-top: 8px;

  .description {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 4px;
    text-transform: capitalize;
  }

  .feels-like {
    font-size: 14px;
    opacity: 0.8;
  }
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
`;

const Metric = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  .icon {
    font-size: 20px;
  }

  .content {
    .label {
      font-size: 11px;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .value {
      font-size: 15px;
      font-weight: 500;
    }
  }
`;

const UpdatedAt = styled.div`
  font-size: 11px;
  opacity: 0.6;
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
              : `${weather.latitude.toFixed(2)}°, ${weather.longitude.toFixed(2)}°`}
          </p>
        </Location>
        {iconUrl && <WeatherIcon src={iconUrl} alt={weather.description} />}
      </Header>

      <MainTemp>
        <Temperature>{Math.round(weather.temperature)}°</Temperature>
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
          <span className="icon">💧</span>
          <div className="content">
            <div className="label">Humidity</div>
            <div className="value">{formatHumidity(weather.humidity)}</div>
          </div>
        </Metric>

        <Metric>
          <span className="icon">🌬️</span>
          <div className="content">
            <div className="label">Wind</div>
            <div className="value">
              {formatWindSpeed(weather.windSpeed)}{' '}
              {getWindDirectionArrow(weather.windDirection)}
            </div>
          </div>
        </Metric>

        <Metric>
          <span className="icon">🌧️</span>
          <div className="content">
            <div className="label">Precipitation</div>
            <div className="value">{formatPrecipitation(weather.precipitation)}</div>
          </div>
        </Metric>

        <Metric>
          <span className="icon">☀️</span>
          <div className="content">
            <div className="label">UV Index</div>
            <div className="value">
              {weather.uvIndex !== undefined ? weather.uvIndex.toFixed(1) : 'N/A'}
            </div>
          </div>
        </Metric>

        {weather.visibility !== undefined && (
          <Metric>
            <span className="icon">👁️</span>
            <div className="content">
              <div className="label">Visibility</div>
              <div className="value">{weather.visibility.toFixed(1)} km</div>
            </div>
          </Metric>
        )}

        {weather.pressure !== undefined && (
          <Metric>
            <span className="icon">📊</span>
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
