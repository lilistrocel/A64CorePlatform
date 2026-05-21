import styled from 'styled-components';
import { WidgetProps, StatWidgetData } from '../../types/widget.types';
import { Card } from '../common/Card';
import { Spinner } from '../common/Spinner';

export function StatWidget({ widget, data, loading, error, onRefresh }: WidgetProps) {
  if (loading) {
    return (
      <Card title={widget.title} subtitle={widget.description}>
        <LoadingContainer>
          <Spinner size="medium" />
        </LoadingContainer>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title={widget.title} subtitle={widget.description}>
        <ErrorContainer>
          <ErrorText>Failed to load data</ErrorText>
          {onRefresh && <RetryLink onClick={onRefresh}>Retry</RetryLink>}
        </ErrorContainer>
      </Card>
    );
  }

  const statData = data as StatWidgetData;

  return (
    <Card title={widget.title} subtitle={widget.description}>
      {onRefresh && (
        <RefreshRow>
          <StatRefreshButton onClick={onRefresh} aria-label={`Refresh ${widget.title}`}>
            🔄
          </StatRefreshButton>
        </RefreshRow>
      )}
      <StatContainer>
        <StatValue>{statData.value}</StatValue>
        <StatLabel>{statData.label}</StatLabel>

        {statData.trend !== undefined && (
          <TrendContainer>
            <TrendIndicator $positive={statData.trend >= 0}>
              <TrendArrow>{statData.trend >= 0 ? '↑' : '↓'}</TrendArrow>
              <TrendValue>{Math.abs(statData.trend)}%</TrendValue>
            </TrendIndicator>
            {statData.trendLabel && (
              <TrendLabel>{statData.trendLabel}</TrendLabel>
            )}
          </TrendContainer>
        )}

        {statData.secondaryMetrics && statData.secondaryMetrics.length > 0 && (
          <SecondaryMetrics>
            {statData.secondaryMetrics.map((metric, index) => (
              <SecondaryMetric key={index}>
                <SecondaryValue>{metric.value}</SecondaryValue>
                <SecondaryLabel>{metric.label}</SecondaryLabel>
              </SecondaryMetric>
            ))}
          </SecondaryMetrics>
        )}
      </StatContainer>
    </Card>
  );
}

const StatContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => theme.space['6']} 0;
`;

const StatValue = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h1};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.accent.sage};
  line-height: ${({ theme }) => theme.lineHeights.snug};
`;

const StatLabel = styled.div`
  font-size: ${({ theme}) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: ${({ theme }) => theme.space['2']};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TrendContainer = styled.div`
  margin-top: ${({ theme }) => theme.space['4']};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
`;

const TrendIndicator = styled.div<{ $positive: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.status.success : theme.colors.status.danger};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const TrendArrow = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
`;

const TrendValue = styled.span``;

const TrendLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const SecondaryMetrics = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['8']};
  margin-top: ${({ theme }) => theme.space['6']};
  padding-top: ${({ theme }) => theme.space['6']};
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const SecondaryMetric = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const SecondaryValue = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const SecondaryLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: ${({ theme }) => theme.space['1']};
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.space['12']} 0;
`;

const ErrorContainer = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.space['8']} ${({ theme }) => theme.space['6']};
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.colors.status.danger};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const RetryLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.accent.sage};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  margin-top: ${({ theme }) => theme.space['2']};
  text-decoration: underline;

  &:hover {
    color: ${({ theme }) => theme.colors.accent.sageDeep};
  }
`;

const RefreshRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: -${({ theme }) => theme.space['2']};
`;

const StatRefreshButton = styled.button`
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  padding: 0.25rem;
  color: ${({ theme }) => theme.colors.text.secondary};
  transition: color 0.2s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.accent.sage};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
    border-radius: 4px;
  }
`;