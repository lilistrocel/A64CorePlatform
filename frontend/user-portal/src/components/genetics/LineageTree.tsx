/**
 * Genetics Repo - Lineage Tree
 *
 * Renders the lineage DAG returned by /lineage/graph.
 *
 * It is a DAG, not a tree: a cross gives a node two parents, so nodes are laid
 * out in generation rows and connected with SVG curves rather than nested in
 * the DOM. Layout is computed deterministically from node dimensions, so no
 * measurement pass is needed and the graph renders identically on first paint.
 *
 * Edge colour encodes reproduction mode — the axis that decides which
 * generation counter moved:
 *   solid blue   = asexual (clone), G advanced
 *   solid amber  = sexual (cross/spore), F advanced and G reset
 *   dashed grey  = a parent that exists but was never identified
 */

import { useMemo } from 'react';
import styled, { useTheme } from 'styled-components';
import { AlertTriangle } from 'lucide-react';
import { glassPanel } from '@a64core/shared';
import type { LineageGraph, LineageNode } from '../../types/genetics';
import { METHOD_LABELS, STATUS_LABELS, VESSEL_LABELS } from '../../types/genetics';
import { ACCESSION_STATUS_TO_PHASE } from './styled';

// Layout constants — node box plus the gaps between boxes and rows.
const NODE_W = 196;
const NODE_H = 78;
const H_GAP = 28;
const V_GAP = 62;
const PAD = 16;
const STUB_H = 26;

interface PositionedNode extends LineageNode {
  x: number;
  y: number;
}

const Wrap = styled.div`
  ${glassPanel}
  overflow: auto;
  padding: 8px;
`;

const Canvas = styled.div<{ $w: number; $h: number }>`
  position: relative;
  width: ${({ $w }) => $w}px;
  height: ${({ $h }) => $h}px;
  margin: 0 auto;
`;

const Edges = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
`;

const NodeBox = styled.button<{ $x: number; $y: number; $root: boolean; $dim: boolean }>`
  position: absolute;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  width: ${NODE_W}px;
  height: ${NODE_H}px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 11px;
  background: ${({ theme }) => theme.colors.cosmosHi};
  border: ${({ $root, theme }) =>
    $root ? `2px solid ${theme.colors.celeste}` : `1px solid ${theme.colors.glass.border}`};
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(4, 6, 18, 0.4);
  opacity: ${({ $dim }) => ($dim ? 0.55 : 1)};
  transition: box-shadow 0.15s ease, transform 0.15s ease;

  &:hover {
    box-shadow: 0 8px 20px rgba(4, 6, 18, 0.5);
    transform: translateY(-1px);
  }
`;

const NodeCode = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12.5px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NodeMeta = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NodeFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
`;

const Dot = styled.span<{ $color: string }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

// Same categorical, non-gold clone-depth cue as GenerationBadge (styled.ts).
const Gen = styled.span<{ $warm: boolean }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 99px;
  background: ${({ $warm, theme }) => ($warm ? `${theme.colors.bright.terra}29` : theme.colors.infoBg)};
  color: ${({ $warm, theme }) => ($warm ? theme.colors.bright.terra : theme.colors.bright.lapis)};
`;

const Legend = styled.div`
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  padding: 10px 4px 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`;

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const Swatch = styled.span<{ $color: string; $dashed?: boolean }>`
  width: 22px;
  height: 0;
  border-top: ${({ $color, $dashed }) => `2px ${$dashed ? 'dashed' : 'solid'} ${$color}`};
`;

const Empty = styled.div`
  padding: 40px;
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

interface LineageTreeProps {
  graph: LineageGraph;
  onSelectNode?: (accessionId: string) => void;
  /** Accession to highlight; falls back to the graph's own root. */
  highlightId?: string;
}

export function LineageTree({ graph, onSelectNode, highlightId }: LineageTreeProps) {
  const theme = useTheme();

  // Same status vocabulary as the accession StatusBadge (genetics styled.ts)
  // — routed through the exact same ACCESSION_STATUS_TO_PHASE map so a given
  // status reads as the same colour everywhere in the app (spec §5).
  const STATUS_DOT: Record<string, string> = Object.fromEntries(
    Object.entries(ACCESSION_STATUS_TO_PHASE).map(([status, phaseKey]) => [
      status,
      theme.colors.phase[phaseKey],
    ])
  );

  // Asexual/sexual is a binary categorical split (which generation counter
  // moved), not a status — bright.lapis/bright.lavender, same pair the
  // ModeBadge chip (genetics styled.ts) uses, never gold (spec §3).
  const ASEXUAL_COLOR = theme.colors.bright.lapis;
  const SEXUAL_COLOR = theme.colors.bright.lavender;
  const UNKNOWN_COLOR = theme.colors.muted;

  const layout = useMemo(() => {
    if (!graph.nodes.length) {
      return { nodes: [] as PositionedNode[], width: 0, height: 0, byId: new Map<string, PositionedNode>() };
    }

    // Group into generation rows. The API already sorts by (depth, code), so
    // sibling order is stable between renders.
    const rows = new Map<number, LineageNode[]>();
    graph.nodes.forEach((n) => {
      const row = rows.get(n.depth) ?? [];
      row.push(n);
      rows.set(n.depth, row);
    });

    const depths = [...rows.keys()].sort((a, b) => a - b);
    const widest = Math.max(
      ...depths.map((d) => (rows.get(d) as LineageNode[]).length * (NODE_W + H_GAP) - H_GAP)
    );

    const positioned: PositionedNode[] = [];
    depths.forEach((depth, rowIndex) => {
      const row = rows.get(depth) as LineageNode[];
      const rowWidth = row.length * (NODE_W + H_GAP) - H_GAP;
      // Centre each row against the widest one so the graph reads symmetrically.
      const startX = PAD + (widest - rowWidth) / 2;
      row.forEach((node, i) => {
        positioned.push({
          ...node,
          x: startX + i * (NODE_W + H_GAP),
          y: PAD + STUB_H + rowIndex * (NODE_H + V_GAP),
        });
      });
    });

    const byId = new Map(positioned.map((n) => [n.accessionId, n]));

    return {
      nodes: positioned,
      width: widest + PAD * 2,
      height: PAD * 2 + STUB_H + depths.length * (NODE_H + V_GAP) - V_GAP,
      byId,
    };
  }, [graph.nodes]);

  if (!graph.nodes.length) {
    return <Empty>No lineage recorded yet.</Empty>;
  }

  const rootId = highlightId ?? graph.rootAccessionId ?? undefined;

  return (
    <>
      <Wrap>
        <Canvas $w={layout.width} $h={layout.height}>
          <Edges>
            {graph.edges.map((edge, i) => {
              const child = layout.byId.get(edge.toAccessionId);
              if (!child) return null;

              const cx = child.x + NODE_W / 2;
              const cy = child.y;

              // An unidentified parent is drawn as a short dashed stub above
              // the child rather than being silently dropped.
              if (!edge.fromAccessionId) {
                return (
                  <g key={`stub-${i}`}>
                    <path
                      d={`M ${cx} ${cy} L ${cx} ${cy - STUB_H}`}
                      stroke={UNKNOWN_COLOR}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      fill="none"
                    />
                    <text
                      x={cx}
                      y={cy - STUB_H - 4}
                      textAnchor="middle"
                      fontSize={10}
                      fill={UNKNOWN_COLOR}
                    >
                      unknown
                    </text>
                  </g>
                );
              }

              const parent = layout.byId.get(edge.fromAccessionId);
              if (!parent) return null;

              const px = parent.x + NODE_W / 2;
              const py = parent.y + NODE_H;
              const mid = (py + cy) / 2;
              const color = edge.reproductionMode === 'sexual' ? SEXUAL_COLOR : ASEXUAL_COLOR;

              return (
                <path
                  key={`${edge.fromAccessionId}-${edge.toAccessionId}-${i}`}
                  d={`M ${px} ${py} C ${px} ${mid}, ${cx} ${mid}, ${cx} ${cy}`}
                  stroke={color}
                  strokeWidth={2}
                  fill="none"
                >
                  <title>
                    {edge.method ? METHOD_LABELS[edge.method] : 'Propagation'}
                    {edge.performedAt
                      ? ` — ${new Date(edge.performedAt).toLocaleDateString()}`
                      : ''}
                    {edge.mediumBatchCode ? ` — on ${edge.mediumBatchCode}` : ''}
                  </title>
                </path>
              );
            })}
          </Edges>

          {layout.nodes.map((node) => (
            <NodeBox
              key={node.accessionId}
              type="button"
              $x={node.x}
              $y={node.y}
              $root={node.accessionId === rootId}
              $dim={node.status === 'discarded' || node.status === 'consumed'}
              onClick={() => onSelectNode?.(node.accessionId)}
              title={`${node.accessionCode} — ${VESSEL_LABELS[node.form]} — ${
                STATUS_LABELS[node.status]
              }`}
            >
              <NodeCode>{node.accessionCode}</NodeCode>
              <NodeMeta>
                {node.quantity} {node.unit} · {VESSEL_LABELS[node.form]}
              </NodeMeta>
              <NodeFooter>
                <Dot $color={STATUS_DOT[node.status] ?? theme.colors.neutral[500]} />
                <Gen $warm={node.cloneGeneration >= 5}>{node.generationLabel}</Gen>
                {node.mediumBatchCode && <NodeMeta>{node.mediumBatchCode}</NodeMeta>}
              </NodeFooter>
            </NodeBox>
          ))}
        </Canvas>
      </Wrap>

      <Legend>
        <LegendItem>
          <Swatch $color={ASEXUAL_COLOR} /> Clone (G advances)
        </LegendItem>
        <LegendItem>
          <Swatch $color={SEXUAL_COLOR} /> Cross or spore (F advances, G resets)
        </LegendItem>
        <LegendItem>
          <Swatch $color={UNKNOWN_COLOR} $dashed /> Unidentified parent
        </LegendItem>
        {graph.truncated && (
          <LegendItem style={{ color: theme.colors.bright.terra }}>
            <AlertTriangle size={13} strokeWidth={1.8} /> Graph truncated — showing the first{' '}
            {graph.nodes.length} accessions
          </LegendItem>
        )}
      </Legend>
    </>
  );
}
