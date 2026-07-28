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
import styled from 'styled-components';
import type { LineageGraph, LineageNode } from '../../types/genetics';
import { METHOD_LABELS, STATUS_LABELS, VESSEL_LABELS } from '../../types/genetics';

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
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  background: ${({ theme }) => theme.colors.surface};
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
  background: ${({ theme }) => theme.colors.background};
  border: ${({ $root, theme }) =>
    $root ? `2px solid ${theme.colors.primary[600]}` : `1px solid ${theme.colors.neutral[300]}`};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  opacity: ${({ $dim }) => ($dim ? 0.55 : 1)};
  transition: box-shadow 0.15s ease, transform 0.15s ease;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
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
  color: ${({ theme }) => theme.colors.textSecondary};
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

const Gen = styled.span<{ $warm: boolean }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ $warm, theme }) => ($warm ? theme.colors.warningBg : theme.colors.primary[50])};
  color: ${({ $warm, theme }) => ($warm ? '#92400e' : theme.colors.primary[800])};
`;

const Legend = styled.div`
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  padding: 10px 4px 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
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
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const STATUS_DOT: Record<string, string> = {
  active: '#10B981',
  contaminated: '#EF4444',
  senescent: '#F59E0B',
  consumed: '#9e9e9e',
  archived: '#9e9e9e',
  discarded: '#bdbdbd',
};

const ASEXUAL_COLOR = '#2196f3';
const SEXUAL_COLOR = '#F59E0B';
const UNKNOWN_COLOR = '#bdbdbd';

interface LineageTreeProps {
  graph: LineageGraph;
  onSelectNode?: (accessionId: string) => void;
  /** Accession to highlight; falls back to the graph's own root. */
  highlightId?: string;
}

export function LineageTree({ graph, onSelectNode, highlightId }: LineageTreeProps) {
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
                <Dot $color={STATUS_DOT[node.status] ?? '#9e9e9e'} />
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
          <LegendItem style={{ color: '#92400e' }}>
            ⚠ Graph truncated — showing the first {graph.nodes.length} accessions
          </LegendItem>
        )}
      </Legend>
    </>
  );
}
