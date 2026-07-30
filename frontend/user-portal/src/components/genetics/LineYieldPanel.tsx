/**
 * Genetics Repo - Yield by Generation (T-803 step 3)
 *
 * Harvest performance for one genetic line, broken down by clone generation.
 *
 * This is the readout the whole repo builds toward. A strain library can tell
 * you what Blue Oyster yields in general; only lineage tracking can tell you
 * whether *your* Blue Oyster is declining as you keep transferring it. A
 * falling BE as G climbs is senescence made measurable, and the cue to
 * re-isolate rather than transfer again.
 */

import styled from 'styled-components';
import { useYieldByLine } from '../../hooks/mushroom/useMushroomHarvests';
import { SENESCENCE_WATCH_GENERATION } from '../../types/genetics';
import { Card, EmptyState, GenerationBadge, SectionTitle } from './styled';

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12.5px;
  line-height: 1.5;
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
`;

const BarTrack = styled.div`
  height: 22px;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.neutral[200]};
  overflow: hidden;
`;

const BarFill = styled.div<{ $pct: number; $warm: boolean }>`
  height: 100%;
  width: ${({ $pct }) => Math.max(2, Math.min(100, $pct))}%;
  background: ${({ $warm, theme }) => ($warm ? theme.colors.warning : theme.colors.primary[500])};
  transition: width 200ms ease;
`;

const Figures = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 108px;
`;

const Be = styled.span<{ $warm: boolean }>`
  font-size: 14px;
  font-weight: 700;
  color: ${({ $warm, theme }) => ($warm ? theme.colors.gold[800] : theme.colors.textPrimary)};
`;

const Sub = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Trend = styled.div<{ $declining: boolean }>`
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 13px;
  line-height: 1.55;
  background: ${({ $declining, theme }) =>
    $declining ? theme.colors.warningBg : theme.colors.successBg};
  color: ${({ $declining, theme }) => ($declining ? theme.colors.gold[800] : theme.colors.emerald[700])};
`;

interface LineYieldPanelProps {
  lineId: string;
  lineCode?: string;
}

export function LineYieldPanel({ lineId, lineCode }: LineYieldPanelProps) {
  const { data: allRows, isLoading } = useYieldByLine();

  const rows = (allRows ?? [])
    .filter((r) => r.lineId === lineId)
    .sort((a, b) => (a.cloneGeneration ?? 0) - (b.cloneGeneration ?? 0));

  if (isLoading) {
    return (
      <Card>
        <SectionTitle>Yield by generation</SectionTitle>
        <Muted>Loading…</Muted>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <SectionTitle>Yield by generation</SectionTitle>
        <EmptyState style={{ padding: '24px 16px' }}>
          No harvests recorded against blocks from this line yet.
          <br />
          Record a harvest with the fruiting block selected, and yield will be
          attributed to the generation that produced it.
        </EmptyState>
      </Card>
    );
  }

  const withBE = rows.filter((r) => r.avgBE != null);
  const maxBE = Math.max(...withBE.map((r) => r.avgBE as number), 1);

  // Only claim a trend when there are at least two generations to compare —
  // one data point is not a direction.
  const first = withBE[0];
  const last = withBE[withBE.length - 1];
  const comparable = withBE.length >= 2 && first !== last;
  const declining =
    comparable && (last.avgBE as number) < (first.avgBE as number) * 0.85;

  return (
    <Card>
      <Head>
        <SectionTitle style={{ margin: 0 }}>Yield by generation</SectionTitle>
        <Muted>{lineCode}</Muted>
      </Head>

      <Rows>
        {rows.map((r) => {
          const gen = r.cloneGeneration ?? 0;
          const warm = gen >= SENESCENCE_WATCH_GENERATION;
          return (
            <Row key={`${r.lineId}-${gen}`}>
              <GenerationBadge $clone={gen}>G{gen}</GenerationBadge>
              <BarTrack>
                <BarFill $pct={((r.avgBE ?? 0) / maxBE) * 100} $warm={warm} />
              </BarTrack>
              <Figures>
                <Be $warm={warm}>
                  {r.avgBE != null ? `${r.avgBE}% BE` : '—'}
                </Be>
                <Sub>
                  {r.totalKg} kg · {r.harvests} harvest{r.harvests === 1 ? '' : 's'} ·{' '}
                  {r.blockCount} block{r.blockCount === 1 ? '' : 's'}
                </Sub>
              </Figures>
            </Row>
          );
        })}
      </Rows>

      {comparable && (
        <Trend $declining={declining}>
          {declining ? (
            <>
              Biological efficiency has fallen from <strong>{first.avgBE}%</strong> at G
              {first.cloneGeneration} to <strong>{last.avgBE}%</strong> at G
              {last.cloneGeneration}. That is the pattern senescence produces —
              worth re-isolating from a spore print or a stored early generation
              rather than transferring this line again.
            </>
          ) : (
            <>
              Holding up: <strong>{first.avgBE}%</strong> at G{first.cloneGeneration} to{' '}
              <strong>{last.avgBE}%</strong> at G{last.cloneGeneration}. No decline
              worth acting on yet.
            </>
          )}
        </Trend>
      )}

      {!comparable && (
        <Muted style={{ display: 'block', marginTop: 12 }}>
          Only one generation has yield data — no trend to read yet.
        </Muted>
      )}
    </Card>
  );
}
