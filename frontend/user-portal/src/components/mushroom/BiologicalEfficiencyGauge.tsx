/**
 * BiologicalEfficiencyGauge Component
 *
 * Visual gauge showing biological efficiency percentage with color coding.
 * BE% = (Fresh Mushroom Weight / Dry Substrate Weight) * 100
 */

import styled from 'styled-components';

interface BiologicalEfficiencyGaugeProps {
  value: number | undefined | null;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

function getBEColor(value: number): string {
  if (value >= 80) return '#10B981'; // Excellent
  if (value >= 60) return '#3B82F6'; // Good
  if (value >= 40) return '#F59E0B'; // Fair
  return '#EF4444';                  // Poor
}

function getBELabel(value: number): string {
  if (value >= 80) return 'Excellent';
  if (value >= 60) return 'Good';
  if (value >= 40) return 'Fair';
  return 'Poor';
}

const SIZE_CONFIG = {
  small: { diameter: 60, stroke: 5, fontSize: 13, labelSize: 10 },
  medium: { diameter: 90, stroke: 7, fontSize: 18, labelSize: 11 },
  large: { diameter: 120, stroke: 9, fontSize: 24, labelSize: 13 },
};

export function BiologicalEfficiencyGauge({
  value,
  size = 'medium',
  showLabel = true,
}: BiologicalEfficiencyGaugeProps) {
  const config = SIZE_CONFIG[size];
  const radius = (config.diameter - config.stroke * 2) / 2;
  const circumference = radius * 2 * Math.PI;

  if (value == null) {
    return (
      <GaugeWrapper $size={config.diameter}>
        <Svg width={config.diameter} height={config.diameter} viewBox={`0 0 ${config.diameter} ${config.diameter}`}>
          <TrackCircle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={radius}
            $stroke={config.stroke}
          />
        </Svg>
        <CenterLabel>
          <ValueText $fontSize={config.fontSize} $color="#bdbdbd">
            N/A
          </ValueText>
        </CenterLabel>
      </GaugeWrapper>
    );
  }

  const clampedValue = Math.min(100, Math.max(0, value));
  const offset = circumference - (clampedValue / 100) * circumference;
  const color = getBEColor(clampedValue);
  const label = getBELabel(clampedValue);

  return (
    <GaugeWrapper $size={config.diameter}>
      <Svg
        width={config.diameter}
        height={config.diameter}
        viewBox={`0 0 ${config.diameter} ${config.diameter}`}
        role="img"
        aria-label={`Biological Efficiency: ${clampedValue.toFixed(1)}% - ${label}`}
      >
        {/* Background track */}
        <TrackCircle
          cx={config.diameter / 2}
          cy={config.diameter / 2}
          r={radius}
          $stroke={config.stroke}
        />
        {/* Progress arc - start from top (rotated -90deg) */}
        <ProgressCircle
          cx={config.diameter / 2}
          cy={config.diameter / 2}
          r={radius}
          $stroke={config.stroke}
          $color={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </Svg>

      <CenterLabel>
        <ValueText $fontSize={config.fontSize} $color={color}>
          {clampedValue.toFixed(0)}%
        </ValueText>
        {showLabel && (
          <LabelText $fontSize={config.labelSize} $color={color}>
            {label}
          </LabelText>
        )}
      </CenterLabel>
    </GaugeWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

interface GaugeWrapperProps {
  $size: number;
}

const GaugeWrapper = styled.div<GaugeWrapperProps>`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
`;

const Svg = styled.svg`
  transform: rotate(-90deg);
  position: absolute;
  top: 0;
  left: 0;
`;

interface TrackCircleProps {
  $stroke: number;
}

const TrackCircle = styled.circle<TrackCircleProps>`
  fill: none;
  stroke: #e0e0e0;
  stroke-width: ${({ $stroke }) => $stroke}px;
`;

interface ProgressCircleProps {
  $stroke: number;
  $color: string;
}

const ProgressCircle = styled.circle<ProgressCircleProps>`
  fill: none;
  stroke: ${({ $color }) => $color};
  stroke-width: ${({ $stroke }) => $stroke}px;
  stroke-linecap: round;
  transition: stroke-dashoffset 600ms ease-in-out, stroke 300ms ease-in-out;
`;

const CenterLabel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1;
`;

interface ValueTextProps {
  $fontSize: number;
  $color: string;
}

const ValueText = styled.span<ValueTextProps>`
  font-size: ${({ $fontSize }) => $fontSize}px;
  font-weight: 700;
  color: ${({ $color }) => $color};
  line-height: 1;
`;

interface LabelTextProps {
  $fontSize: number;
  $color: string;
}

const LabelText = styled.span<LabelTextProps>`
  font-size: ${({ $fontSize }) => $fontSize}px;
  font-weight: 500;
  color: ${({ $color }) => $color};
  margin-top: 2px;
`;
