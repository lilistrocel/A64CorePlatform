/**
 * A20Core — KPICard.
 *
 * The signature Slate KPI component: a small mono label, a massive Playfair
 * number, an optional delta chip. This pattern matters because it's how
 * A20Core conveys authority — the number IS the brand.
 *
 *   <KPICard
 *     label="KG TRACKED"
 *     value="5,047,318"
 *     unit="kg"
 *     delta={{ direction: 'up', value: '+12.4%', period: 'WoW' }}
 *   />
 */

import styled, { css } from 'styled-components'
import { Card } from './Card'

interface DeltaProps {
  direction: 'up' | 'down' | 'flat'
  value: string
  period?: string
}

interface KPICardProps {
  label: string
  value: string | number
  unit?: string
  delta?: DeltaProps
  variant?: 'default' | 'hero' // hero = bigger, used on landing dashboards
}

export function KPICard({ label, value, unit, delta, variant = 'default' }: KPICardProps) {
  return (
    <Card $variant="accent" $padding="md">
      <Label>{label}</Label>
      <ValueRow $hero={variant === 'hero'}>
        <Value $hero={variant === 'hero'}>{value}</Value>
        {unit && <Unit>{unit}</Unit>}
      </ValueRow>
      {delta && (
        <Delta $direction={delta.direction}>
          <DeltaArrow>{delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '·'}</DeltaArrow>
          {delta.value}
          {delta.period && <DeltaPeriod>{delta.period}</DeltaPeriod>}
        </Delta>
      )}
    </Card>
  )
}

// ── Styled parts ────────────────────────────────────────────────────────

const Label = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.monoSm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  letter-spacing: ${({ theme }) => theme.letterSpacings.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: ${({ theme }) => theme.space['3']};
`

const ValueRow = styled.div<{ $hero: boolean }>`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space['2']};
  ${({ $hero }) => $hero && css`margin-bottom: ${({ theme }) => theme.space['2']};`}
`

const Value = styled.div<{ $hero: boolean }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: ${({ theme, $hero }) =>
    $hero ? theme.fontSizes.displayLg : theme.fontSizes.displaySm};
  line-height: ${({ theme }) => theme.lineHeights.tight};
  letter-spacing: ${({ theme }) => theme.letterSpacings.tight};
  color: ${({ theme }) => theme.colors.text.primary};
  font-variant-numeric: tabular-nums;     /* numbers don't dance during updates */
`

const Unit = styled.span`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
  font-weight: ${({ theme }) => theme.fontWeights.regular};
  color: ${({ theme }) => theme.colors.text.secondary};
`

const Delta = styled.div<{ $direction: DeltaProps['direction'] }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
  margin-top: ${({ theme }) => theme.space['2']};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.monoSm};
  letter-spacing: ${({ theme }) => theme.letterSpacings.wide};
  color: ${({ theme, $direction }) =>
    $direction === 'up'
      ? theme.colors.status.success
      : $direction === 'down'
      ? theme.colors.status.danger
      : theme.colors.text.secondary};
`

const DeltaArrow = styled.span`
  font-family: ${({ theme }) => theme.fonts.body}; /* arrows render better in Inter */
  margin-right: 2px;
`

const DeltaPeriod = styled.span`
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-left: ${({ theme }) => theme.space['2']};
`
