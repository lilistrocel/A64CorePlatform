/**
 * AgriDataTab Component
 *
 * Main tab component for displaying agricultural weather data.
 * Combines current weather, forecast, soil conditions, and insights.
 */

import styled from 'styled-components';
import { useWeatherData, useHasWeatherCapability } from '../../../hooks/farm/useWeatherData';
import { CurrentWeatherCard } from './CurrentWeatherCard';
import { SoilConditionsCard } from './SoilConditionsCard';
import { SolarLightCard } from './SolarLightCard';
import { AirQualityCard } from './AirQualityCard';
import { InsightsCard } from './InsightsCard';
import { ForecastCard } from './ForecastCard';
import type { Farm } from '../../../types/farm';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: #212121;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #f5f5f5;
  color: #616161;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #e0e0e0;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DataSourceBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: #EFF6FF;
  color: #3B82F6;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
`;

const LastUpdated = styled.span`
  font-size: 12px;
  color: #9e9e9e;
`;

const MainGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const FullWidthSection = styled.div`
  grid-column: 1 / -1;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 16px;
`;

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid #e0e0e0;
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.p`
  color: #616161;
  font-size: 14px;
  margin: 0;
`;

const ErrorContainer = styled.div`
  padding: 24px;
  background: #FEE2E2;
  border: 1px solid #EF4444;
  border-radius: 12px;
  text-align: center;
`;

const ErrorTitle = styled.h3`
  color: #B91C1C;
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
`;

const ErrorMessage = styled.p`
  color: #7F1D1D;
  font-size: 14px;
  margin: 0;
`;

const NoLocationContainer = styled.div`
  padding: 48px;
  background: #f5f5f5;
  border-radius: 12px;
  text-align: center;
`;

const NoLocationIcon = styled.div`
  font-size: 48px;
  margin-bottom: 16px;
`;

const NoLocationTitle = styled.h3`
  color: #212121;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
`;

const NoLocationMessage = styled.p`
  color: #616161;
  font-size: 14px;
  margin: 0;
  max-width: 400px;
  margin: 0 auto;
`;

interface AgriDataTabProps {
  farm: Farm;
}

export function AgriDataTab({ farm }: AgriDataTabProps) {
  const hasWeatherCapability = useHasWeatherCapability(farm);
  const { data, loading, error, refetch, lastUpdated } = useWeatherData(
    hasWeatherCapability ? farm.farmId : null
  );

  // Farm doesn't have coordinates
  if (!hasWeatherCapability) {
    return (
      <Container>
        <Header>
          <Title>🌾 Agricultural Data</Title>
        </Header>

        <NoLocationContainer>
          <NoLocationIcon>📍</NoLocationIcon>
          <NoLocationTitle>Location Required</NoLocationTitle>
          <NoLocationMessage>
            To view agricultural weather data, this farm needs GPS coordinates configured.
            Edit the farm to add latitude and longitude coordinates.
          </NoLocationMessage>
        </NoLocationContainer>
      </Container>
    );
  }

  // Loading state
  if (loading && !data) {
    return (
      <Container>
        <Header>
          <Title>🌾 Agricultural Data</Title>
        </Header>

        <LoadingContainer>
          <Spinner />
          <LoadingText>Loading weather data...</LoadingText>
        </LoadingContainer>
      </Container>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <Container>
        <Header>
          <Title>🌾 Agricultural Data</Title>
          <RefreshButton onClick={refetch}>
            🔄 Retry
          </RefreshButton>
        </Header>

        <ErrorContainer>
          <ErrorTitle>Unable to Load Weather Data</ErrorTitle>
          <ErrorMessage>{error}</ErrorMessage>
        </ErrorContainer>
      </Container>
    );
  }

  // No data
  if (!data) {
    return (
      <Container>
        <Header>
          <Title>🌾 Agricultural Data</Title>
          <RefreshButton onClick={refetch}>
            🔄 Refresh
          </RefreshButton>
        </Header>

        <NoLocationContainer>
          <NoLocationIcon>📊</NoLocationIcon>
          <NoLocationTitle>No Data Available</NoLocationTitle>
          <NoLocationMessage>
            Weather data is not available at this time. Please try again later.
          </NoLocationMessage>
        </NoLocationContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <div>
          <Title>🌾 Agricultural Data</Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <DataSourceBadge>
              <span>⚡</span> WeatherBit
            </DataSourceBadge>
            {lastUpdated && (
              <LastUpdated>
                Updated {lastUpdated.toLocaleTimeString()}
              </LastUpdated>
            )}
          </div>
        </div>
        <RefreshButton onClick={refetch} disabled={loading}>
          {loading ? '⏳' : '🔄'} Refresh
        </RefreshButton>
      </Header>

      <MainGrid>
        {/* Current Weather */}
        {data.current && (
          <CurrentWeatherCard weather={data.current} />
        )}

        {/* Agricultural Insights */}
        {data.insights && (
          <InsightsCard insights={data.insights} />
        )}

        {/* Soil Conditions */}
        {data.soil && (
          <SoilConditionsCard soil={data.soil} />
        )}

        {/* Solar & Light Data */}
        {data.solar && (
          <SolarLightCard solar={data.solar} />
        )}

        {/* Air Quality */}
        {data.airQuality && (
          <AirQualityCard airQuality={data.airQuality} />
        )}

        {/* Forecast */}
        {data.forecast && (
          <FullWidthSection>
            <ForecastCard forecast={data.forecast} />
          </FullWidthSection>
        )}
      </MainGrid>
    </Container>
  );
}
