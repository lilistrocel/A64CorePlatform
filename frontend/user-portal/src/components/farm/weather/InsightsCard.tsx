/**
 * InsightsCard Component
 *
 * Displays agricultural insights, risk assessments, and recommendations.
 */

import styled from 'styled-components';
import type { AgriculturalInsights, RiskLevel, GrowingConditions } from '../../../types/farm';
import {
  RISK_LEVEL_COLORS,
  RISK_LEVEL_LABELS,
  GROWING_CONDITIONS_COLORS,
  GROWING_CONDITIONS_LABELS,
} from '../../../types/farm';

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

const GrowingConditionsBadge = styled.div<{ $condition: GrowingConditions }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: ${({ $condition }) => `${GROWING_CONDITIONS_COLORS[$condition]}15`};
  border: 2px solid ${({ $condition }) => GROWING_CONDITIONS_COLORS[$condition]};
  border-radius: 12px;
  margin-bottom: 20px;

  .label {
    font-size: 13px;
    color: #616161;
  }

  .value {
    font-size: 16px;
    font-weight: 600;
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
  background: ${({ $level }) => `${RISK_LEVEL_COLORS[$level]}10`};
  border-radius: 8px;
  border-left: 4px solid ${({ $level }) => RISK_LEVEL_COLORS[$level]};

  .icon {
    font-size: 20px;
  }

  .content {
    flex: 1;

    .label {
      font-size: 12px;
      color: #616161;
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
    font-size: 13px;
    font-weight: 600;
    color: #616161;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px 0;
  }
`;

const AssessmentRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }

  .label {
    font-size: 14px;
    color: #616161;
  }

  .value {
    font-size: 14px;
    font-weight: 500;
    color: #212121;
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
  background: #FEE2E2;
  border-radius: 8px;
  border-left: 4px solid #EF4444;

  .icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .text {
    font-size: 13px;
    color: #7F1D1D;
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
  background: #F0FDF4;
  border-radius: 8px;

  .icon {
    font-size: 14px;
    flex-shrink: 0;
    color: #16A34A;
  }

  .text {
    font-size: 13px;
    color: #166534;
    line-height: 1.4;
  }
`;

interface InsightsCardProps {
  insights: AgriculturalInsights;
}

export function InsightsCard({ insights }: InsightsCardProps) {
  const riskIcons: Record<string, string> = {
    frost: '❄️',
    drought: '🏜️',
    flood: '🌊',
    heat: '🌡️',
  };

  return (
    <Card>
      <Title>📊 Agricultural Insights</Title>

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
                <span className="icon">⚠️</span>
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
                <span className="icon">✓</span>
                <span className="text">{rec}</span>
              </RecommendationItem>
            ))}
          </RecommendationsList>
        </Section>
      )}
    </Card>
  );
}
