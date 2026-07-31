import type { ReactNode } from 'react';
import styled from 'styled-components';
import { monoLabel, goldThread, glassPanel } from '../../theme/mixins';

/**
 * PageHeader — the breadcrumb + H1 + description + stat-tile pattern, spec
 * §4 "Page header" / mockup `.topline` (l.111-129). This is the canonical
 * page-header the Phase 3 screen-sweep fleet imports across every screen —
 * do not hand-roll this pattern per page.
 *
 * Import: `import { PageHeader } from '@a64core/shared';`
 *
 * Gold note (spec §3): the breadcrumb kicker and the primary stat numerals
 * are both explicitly gold per spec §4's own text for this component ("Space
 * Mono gold breadcrumb", "gold numeral ... gold thread on top"). Every
 * mounted PageHeader therefore contributes up to 3 gold elements to whatever
 * screen renders it (breadcrumb + stat thread(s) + stat numeral(s)) — this is
 * intentional and budgeted per-page, not part of the persistent app-shell
 * gold count (logo/active-nav/FAB), which is audited separately. The
 * `actions` slot below is deliberately unstyled beyond layout (flex + gap)
 * so it does NOT add to that budget — whatever the caller renders inside it
 * (buttons, filters) keeps its own component's styling, gold or otherwise.
 */

export interface PageHeaderStat {
  /** The number/short value shown large. */
  value: string | number;
  /** Space Mono label under the value. */
  label: string;
  /** Marks a "alive/growing" stat — numeral renders in bright.emerald instead
   * of gold (spec §4 "A stat that is semantically 'alive/growing' may use
   * bright.emerald"). */
  alive?: boolean;
}

export interface PageHeaderProps {
  /** Space Mono gold kicker text above the title, e.g. "Operations · Live".
   * Rendered with the mockup's 20px leading gold dash. Omit for pages that
   * don't need a section kicker. */
  breadcrumb?: string;
  /** The H1 text. */
  title: string;
  /** Italicize the LAST WORD of `title` in Fraunces italic/celeste (spec §4:
   * "last word may be Fraunces italic celeste"). Opt-in — not every title
   * wants an editorial emphasis word, and a single-word title has nothing to
   * split. */
  emphasizeLastWord?: boolean;
  /** One-line muted description under the title. */
  description?: string;
  /** 0..n glass stat tiles on the right side of the header. */
  stats?: PageHeaderStat[];
  /** Optional header actions (buttons, filters) rendered on the right side,
   * per the mockup's header layout. Additive and optional — omitting it
   * renders byte-for-byte what PageHeader rendered before this prop
   * existed, so existing consumers (stats-only or bare) are unaffected.
   * Purely a layout slot: no gold, no glass — the children keep whatever
   * styling the caller gives them (see the gold note above). */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  breadcrumb,
  title,
  emphasizeLastWord = false,
  description,
  stats,
  actions,
  className,
}: PageHeaderProps) {
  const words = title.trim().split(/\s+/);
  const canEmphasize = emphasizeLastWord && words.length > 1;
  const lastWord = canEmphasize ? words[words.length - 1] : undefined;
  const leadWords = canEmphasize ? words.slice(0, -1).join(' ') : undefined;

  const statsNode =
    stats && stats.length > 0 ? (
      <Stats>
        {stats.map((stat, index) => (
          <StatTile key={index}>
            <StatNumber $alive={!!stat.alive}>{stat.value}</StatNumber>
            <StatLabel>{stat.label}</StatLabel>
          </StatTile>
        ))}
      </Stats>
    ) : null;

  return (
    <TopLine className={className}>
      <TitleBlock>
        {breadcrumb && <Crumb>{breadcrumb}</Crumb>}
        <Title>
          {canEmphasize ? (
            <>
              {leadWords}{' '}
              <Emphasis>{lastWord}</Emphasis>
            </>
          ) : (
            title
          )}
        </Title>
        {description && <Description>{description}</Description>}
      </TitleBlock>

      {actions ? (
        // Only introduced when `actions` is supplied — a consumer passing
        // only `stats` (or neither) gets exactly the old DOM below
        // (`statsNode` as the direct, sole TopLine child), unchanged.
        <RightBlock>
          <Actions>{actions}</Actions>
          {statsNode}
        </RightBlock>
      ) : (
        statsNode
      )}
    </TopLine>
  );
}

const TopLine = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 26px;
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const Crumb = styled.div`
  ${monoLabel}
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.secondary[500]};
  margin-bottom: 8px;

  &::before {
    content: '';
    width: 20px;
    height: 1px;
    background: ${({ theme }) => theme.colors.secondary[500]};
  }
`;

const Title = styled.h1`
  font-size: 1.9rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: -0.01em;
  line-height: 1.15;
`;

const Emphasis = styled.em`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.celeste};
`;

const Description = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 6px;
`;

/** Only rendered when `actions` is supplied — groups actions + stats as one
 * flex unit so `TopLine`'s `justify-content: space-between` still splits
 * exactly two sides (title vs. everything on the right), the same as it did
 * before this prop existed. No colour/glass styling of its own — layout
 * only, per the gold note above. */
const RightBlock = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const Stats = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
`;

const StatTile = styled.div`
  ${glassPanel}
  ${goldThread}
  min-width: 118px;
  padding: 16px 20px 14px;
  border-radius: 16px;
`;

const StatNumber = styled.div<{ $alive: boolean }>`
  font-size: 1.7rem;
  font-weight: 800;
  line-height: 1;
  color: ${({ theme, $alive }) => ($alive ? theme.colors.bright.emerald : theme.colors.secondary[500])};
  text-shadow: 0 0 22px ${({ $alive }) => ($alive ? 'rgba(84, 211, 155, 0.4)' : 'rgba(220, 185, 79, 0.4)')};
`;

const StatLabel = styled.div`
  ${monoLabel}
  font-size: 0.58rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-top: 7px;
`;
