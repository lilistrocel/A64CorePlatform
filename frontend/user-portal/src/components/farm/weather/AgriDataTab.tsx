/**
 * AgriDataTab Component
 *
 * Main tab component for displaying agricultural weather data.
 * Combines current weather, forecast, soil conditions, and insights.
 */

import styled, { keyframes } from 'styled-components';
import { Wheat, MapPin, BarChart3, RefreshCw, Zap, AlertTriangle } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RefreshButton = styled.button`
  ${glassControl}
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.glass.border};
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const SpinningIcon = styled.span`
  display: flex;
  animation: ${spin} 1s linear infinite;
`;

const DataSourceBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 16px;
  ${monoLabel}
  font-size: 0.62rem;
`;

const LastUpdated = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
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
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const LoadingText = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  margin: 0;
`;

// Empty/error state card — spec §4/§10: glassPanel container, Fraunces
// italic celeste headline, one muted sentence, no emoji/stock art.
const StateCard = styled.div`
  ${glassPanel}
  padding: 48px;
  text-align: center;
`;

const StateIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: ${({ theme }) => theme.colors.celeste};
`;

const ErrorIcon = styled(StateIcon)`
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const StateHeadline = styled.h3`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 20px;
  margin: 0 0 8px 0;
`;

const StateMessage = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  margin: 0;
  max-width: 400px;
  margin: 0 auto;
`;

// Error state uses the coral (quarantined/error) hue explicitly, not the
// neutral celeste empty-state treatment, so a failure still reads as a
// failure at a glance.
const ErrorHeadline = styled(StateHeadline)`
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const ErrorMessage = styled(StateMessage)`
  color: ${({ theme }) => theme.colors.textPrimary};
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
          <Title><Wheat size={18} strokeWidth={1.6} /> Agricultural Data</Title>
        </Header>

        <StateCard>
          <StateIcon><MapPin size={32} strokeWidth={1.6} /></StateIcon>
          <StateHeadline>Location Required</StateHeadline>
          <StateMessage>
            To view agricultural weather data, this farm needs GPS coordinates configured.
            Edit the farm to add latitude and longitude coordinates.
          </StateMessage>
        </StateCard>
      </Container>
    );
  }

  // Loading state
  if (loading && !data) {
    return (
      <Container>
        <Header>
          <Title><Wheat size={18} strokeWidth={1.6} /> Agricultural Data</Title>
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
          <Title><Wheat size={18} strokeWidth={1.6} /> Agricultural Data</Title>
          <RefreshButton onClick={refetch}>
            <RefreshCw size={13} strokeWidth={1.6} /> Retry
          </RefreshButton>
        </Header>

        <StateCard>
          <ErrorIcon><AlertTriangle size={32} strokeWidth={1.6} /></ErrorIcon>
          <ErrorHeadline>Unable to Load Weather Data</ErrorHeadline>
          <ErrorMessage>{error}</ErrorMessage>
        </StateCard>
      </Container>
    );
  }

  // No data
  if (!data) {
    return (
      <Container>
        <Header>
          <Title><Wheat size={18} strokeWidth={1.6} /> Agricultural Data</Title>
          <RefreshButton onClick={refetch}>
            <RefreshCw size={13} strokeWidth={1.6} /> Refresh
          </RefreshButton>
        </Header>

        <StateCard>
          <StateIcon><BarChart3 size={32} strokeWidth={1.6} /></StateIcon>
          <StateHeadline>No Data Available</StateHeadline>
          <StateMessage>
            Weather data is not available at this time. Please try again later.
          </StateMessage>
        </StateCard>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <div>
          <Title><Wheat size={18} strokeWidth={1.6} /> Agricultural Data</Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <DataSourceBadge>
              <Zap size={12} strokeWidth={1.6} /> WeatherBit
            </DataSourceBadge>
            {lastUpdated && (
              <LastUpdated>
                Updated {lastUpdated.toLocaleTimeString()}
              </LastUpdated>
            )}
          </div>
        </div>
        <RefreshButton onClick={refetch} disabled={loading}>
          {loading ? (
            <SpinningIcon><RefreshCw size={13} strokeWidth={1.6} /></SpinningIcon>
          ) : (
            <RefreshCw size={13} strokeWidth={1.6} />
          )}
          {' '}Refresh
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
