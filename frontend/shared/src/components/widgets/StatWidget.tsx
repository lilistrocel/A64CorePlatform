import styled from 'styled-components';
import { RefreshCw } from 'lucide-react';
import { WidgetProps, StatWidgetData } from '../../types/widget.types';
import { monoLabel } from '../../theme/mixins';
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
            <RefreshCw size={13} strokeWidth={1.8} />
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
  padding: ${({ theme }) => theme.spacing.lg} 0;
`;

const StatValue = styled.div`
  /* Primary stat numerals are on the gold budget (spec §3) with the mockup's
     signature glow (l.127). */
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.secondary[500]};
  text-shadow: 0 0 22px rgba(220, 185, 79, 0.4);
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};
`;

const StatLabel = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const TrendContainer = styled.div`
  margin-top: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const TrendIndicator = styled.div<{ $positive: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success : theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const TrendArrow = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
`;

const TrendValue = styled.span``;

const TrendLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.celeste};
`;

const SecondaryMetrics = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xl};
  margin-top: ${({ theme }) => theme.spacing.lg};
  padding-top: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const SecondaryMetric = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const SecondaryValue = styled.div`
  /* Secondary emphasis is celeste, never gold (spec §3). */
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SecondaryLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.celeste};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing['2xl']} 0;
`;

const ErrorContainer = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl} ${({ theme }) => theme.spacing.lg};
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const RetryLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  margin-top: ${({ theme }) => theme.spacing.sm};
  text-decoration: underline;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const RefreshRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: -${({ theme }) => theme.spacing.sm};
`;

const StatRefreshButton = styled.button`
  display: flex;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: ${({ theme }) => theme.colors.muted};
  transition: color 0.2s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.celeste};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
    border-radius: 4px;
  }
`;