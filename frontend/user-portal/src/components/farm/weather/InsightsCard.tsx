/**
 * InsightsCard Component
 *
 * Displays agricultural insights, risk assessments, and recommendations.
 */

import styled from 'styled-components';
import { BarChart3, Snowflake, Sun, Waves, Thermometer, AlertTriangle, Check } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import type { AgriculturalInsights, RiskLevel, GrowingConditions } from '../../../types/farm';
import {
  RISK_LEVEL_COLORS,
  RISK_LEVEL_LABELS,
  GROWING_CONDITIONS_COLORS,
  GROWING_CONDITIONS_LABELS,
} from '../../../types/farm';

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

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.celeste};
  }
`;

const GrowingConditionsBadge = styled.div<{ $condition: GrowingConditions }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: ${({ $condition }) => `${GROWING_CONDITIONS_COLORS[$condition]}29`};
  border: 1px solid ${({ $condition }) => `${GROWING_CONDITIONS_COLORS[$condition]}73`};
  border-radius: 99px;
  margin-bottom: 20px;

  .label {
    ${monoLabel}
    color: ${({ theme }) => theme.colors.muted};
  }

  .value {
    ${monoLabel}
    font-size: 0.72rem;
    font-weight: 700;
    color: ${({ $condition }) => GROWING_CONDITIONS_COLORS[$condition]};
  }
`;

const RisksGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
`;

const RiskItem = styled.div<{ $level: RiskLevel }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: ${({ $level }) => `${RISK_LEVEL_COLORS[$level]}1A`};
  border-radius: 8px;
  border-left: 3px solid ${({ $level }) => RISK_LEVEL_COLORS[$level]};

  .icon {
    display: flex;
    flex-shrink: 0;
    color: ${({ $level }) => RISK_LEVEL_COLORS[$level]};
  }

  .content {
    flex: 1;

    .label {
      ${monoLabel}
      color: ${({ theme }) => theme.colors.muted};
    }

    .value {
      font-size: 14px;
      font-weight: 600;
      color: ${({ $level }) => RISK_LEVEL_COLORS[$level]};
    }
  }
`;

const Section = styled.div`
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }

  h4 {
    ${monoLabel}
    font-size: 0.68rem;
    color: ${({ theme }) => theme.colors.muted};
    margin: 0 0 12px 0;
  }
`;

const AssessmentRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &:last-child {
    border-bottom: none;
  }

  .label {
    font-size: 14px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }

  .value {
    font-size: 14px;
    font-weight: 500;
    color: ${({ theme }) => theme.colors.textPrimary};
    text-transform: capitalize;
  }
`;

const AlertsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AlertItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 8px;
  border-left: 3px solid ${({ theme }) => theme.colors.error};

  .icon {
    display: flex;
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.error};
    margin-top: 1px;
  }

  .text {
    font-size: 13px;
    color: ${({ theme }) => theme.colors.onDark};
    line-height: 1.4;
  }
`;

const RecommendationsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RecommendationItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: ${({ theme }) => theme.colors.successBg};
  border-radius: 8px;

  .icon {
    display: flex;
    flex-shrink: 0;
    margin-top: 1px;
    color: ${({ theme }) => theme.colors.bright.emerald};
  }

  .text {
    font-size: 13px;
    color: ${({ theme }) => theme.colors.onDark};
    line-height: 1.4;
  }
`;

interface InsightsCardProps {
  insights: AgriculturalInsights;
}

export function InsightsCard({ insights }: InsightsCardProps) {
  // Night Observatory (T-901): risk icons are lucide-react line icons, not
  // emoji — 13px inline, currentColor via the parent's `.icon` color.
  const riskIcons: Record<string, React.ReactNode> = {
    frost: <Snowflake size={13} strokeWidth={1.6} />,
    drought: <Sun size={13} strokeWidth={1.6} />,
    flood: <Waves size={13} strokeWidth={1.6} />,
    heat: <Thermometer size={13} strokeWidth={1.6} />,
  };

  return (
    <Card>
      <Title><BarChart3 size={16} strokeWidth={1.6} /> Agricultural Insights</Title>

      <GrowingConditionsBadge $condition={insights.growingConditions}>
        <span className="label">Growing Conditions:</span>
        <span className="value">{GROWING_CONDITIONS_LABELS[insights.growingConditions]}</span>
      </GrowingConditionsBadge>

      <Section>
        <h4>Risk Assessment</h4>
        <RisksGrid>
          <RiskItem $level={insights.frostRisk}>
            <span className="icon">{riskIcons.frost}</span>
            <div className="content">
              <div className="label">Frost Risk</div>
              <div className="value">{RISK_LEVEL_LABELS[insights.frostRisk]}</div>
            </div>
          </RiskItem>

          <RiskItem $level={insights.droughtRisk}>
            <span className="icon">{riskIcons.drought}</span>
            <div className="content">
              <div className="label">Drought Risk</div>
              <div className="value">{RISK_LEVEL_LABELS[insights.droughtRisk]}</div>
            </div>
          </RiskItem>

          <RiskItem $level={insights.floodRisk}>
            <span className="icon">{riskIcons.flood}</span>
            <div className="content">
              <div className="label">Flood Risk</div>
              <div className="value">{RISK_LEVEL_LABELS[insights.floodRisk]}</div>
            </div>
          </RiskItem>

          <RiskItem $level={insights.heatStressRisk}>
            <span className="icon">{riskIcons.heat}</span>
            <div className="content">
              <div className="label">Heat Stress</div>
              <div className="value">{RISK_LEVEL_LABELS[insights.heatStressRisk]}</div>
            </div>
          </RiskItem>
        </RisksGrid>
      </Section>

      <Section>
        <h4>Field Assessment</h4>
        <AssessmentRow>
          <span className="label">Soil Workability</span>
          <span className="value">{insights.soilWorkability}</span>
        </AssessmentRow>
        <AssessmentRow>
          <span className="label">Irrigation Need</span>
          <span className="value">{insights.irrigationNeed}</span>
        </AssessmentRow>
      </Section>

      {insights.alerts.length > 0 && (
        <Section>
          <h4>Weather Alerts</h4>
          <AlertsList>
            {insights.alerts.map((alert, index) => (
              <AlertItem key={index}>
                <span className="icon"><AlertTriangle size={13} strokeWidth={1.6} /></span>
                <span className="text">{alert}</span>
              </AlertItem>
            ))}
          </AlertsList>
        </Section>
      )}

      {insights.recommendations.length > 0 && (
        <Section>
          <h4>Recommendations</h4>
          <RecommendationsList>
            {insights.recommendations.map((rec, index) => (
              <RecommendationItem key={index}>
                <span className="icon"><Check size={13} strokeWidth={1.6} /></span>
                <span className="text">{rec}</span>
              </RecommendationItem>
            ))}
          </RecommendationsList>
        </Section>
      )}
    </Card>
  );
}
