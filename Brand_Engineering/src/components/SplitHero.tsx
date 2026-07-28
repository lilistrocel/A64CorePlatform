/**
 * A20Core — SplitHero.
 *
 * The signature Slate landing layout: editorial Playfair headline on the
 * left, full-height photo panel on the right (~40% of width). This is the
 * pattern you see on every cover slide in the latest deck.
 *
 *   <SplitHero
 *     category="SOVEREIGN AGENTIC AI / FARM-TO-FORK / GCC MARKETS"
 *     title="The Cornerstone of"
 *     emphasis="National Food Security."
 *     subtitle="A sovereign-grade agentic AI platform for GCC food systems."
 *     imageUrl="/img/hero-greenhouse.jpg"
 *   />
 *
 * Layout rules:
 *   - The emphasis word is set in italic, same Playfair Bold.
 *   - Category is mono uppercase Sage.
 *   - On mobile, the photo collapses below the text.
 */

import styled from 'styled-components'
import type { ReactNode } from 'react'

interface SplitHeroProps {
  category?: string
  title: string
  emphasis: ReactNode      // gets italicised
  subtitle?: string
  imageUrl?: string
  imageAlt?: string
  metricRow?: ReactNode    // optional <MetricRow> at the bottom
}

export function SplitHero({
  category,
  title,
  emphasis,
  subtitle,
  imageUrl,
  imageAlt = '',
  metricRow,
}: SplitHeroProps) {
  return (
    <Root>
      <TextPanel>
        {category && <Category>{category}</Category>}
        <Title>
          {title}
          <br />
          <em>{emphasis}</em>
        </Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
        {metricRow && <MetricSlot>{metricRow}</MetricSlot>}
      </TextPanel>
      {imageUrl && (
        <ImagePanel>
          <img src={imageUrl} alt={imageAlt} />
        </ImagePanel>
      )}
    </Root>
  )
}

const Root = styled.section`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.space['8']};
  border-top: ${({ theme }) => theme.brandRule.sage};
  padding: ${({ theme }) => theme.space['12']} ${({ theme }) => theme.space['10']};

  ${({ theme }) => theme.media.md} {
    grid-template-columns: 1.4fr 1fr;
    min-height: 80vh;
  }
`

const TextPanel = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: ${({ theme }) => theme.space['5']};
  max-width: 640px;
`

const Category = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.monoSm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  letter-spacing: ${({ theme }) => theme.letterSpacings.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.accent.sage};
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: ${({ theme }) => theme.fontSizes.displayMd};
  line-height: ${({ theme }) => theme.lineHeights.tight};
  letter-spacing: ${({ theme }) => theme.letterSpacings.tight};
  color: ${({ theme }) => theme.colors.text.primary};

  em {
    font-style: italic;
    font-weight: ${({ theme }) => theme.fontWeights.bold};
  }

  ${({ theme }) => theme.media.lg} {
    font-size: ${({ theme }) => theme.fontSizes.displayLg};
  }
`

const Subtitle = styled.p`
  font-family: ${({ theme }) => theme.fonts.body};
  font-style: italic;
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
  color: ${({ theme }) => theme.colors.text.secondary};
  max-width: 56ch;
`

const MetricSlot = styled.div`
  margin-top: ${({ theme }) => theme.space['4']};
`

const ImagePanel = styled.div`
  position: relative;
  min-height: 360px;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface.sunken};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: saturate(0.85) contrast(0.95);   /* Slate photography rule */
  }
`
