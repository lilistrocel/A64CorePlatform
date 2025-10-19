import styled from 'styled-components';
import { WidgetProps, StatWidgetData } from '../../types/widget.types';
import { Card } from '../common/Card';
import { Spinner } from '../common/Spinner';

export function StatWidget({ widget, data, loading, error }: WidgetProps) {
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
        </ErrorContainer>
      </Card>
    );
  }

  const statData = data as StatWidgetData;

  return (
    <Card title={widget.title} subtitle={widget.description}>
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
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.primary[500]};
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};
`;

const StatLabel = styled.div`
  font-size: ${({ theme}) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.sm};
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SecondaryMetrics = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xl};
  margin-top: ${({ theme }) => theme.spacing.lg};
  padding-top: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const SecondaryMetric = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const SecondaryValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SecondaryLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
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