/**
 * Genetics Repo — Public Label Info Page (T-804 step 5, spec §7.1)
 *
 * Renders `GET /api/v1/public/genetics/i/{token}` and
 * `.../i/{token}/{vesselNo}` — the page a lab technician lands on after
 * scanning a printed vessel label with a phone. Unauthenticated by design:
 * no MainLayout, no sidebar, no division context, no auth store. It DOES
 * render inside the app's shared <ThemeProvider>/<Sky /> (mounted once in
 * App.tsx above every route, including /login), so Night Observatory
 * theming applies automatically — this file only needs to build against
 * `theme`, same as every other genetics screen.
 *
 * Backend contract: src/modules/genetics/api/v1/public.py — `PublicAccessionInfo`
 * and its nested models, hand-mirrored below as local TS interfaces (never
 * import a backend Pydantic model). Every optional field on the backend
 * model is genuinely optional here too — a tenant's PublicInfoPageConfig can
 * turn each of medium/protocol/operator/facility/ingredients/steps off
 * independently, so every one of those is rendered only when present.
 *
 * 404 is deliberately byte-identical for unknown token, disabled org, and
 * out-of-range vessel number (anti-enumeration, spec §5.2 rule 4) — this
 * page must not add any extra hinting text that would undo that.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { css, keyframes } from 'styled-components';
import { AlertTriangle, MapPin, Scissors, WifiOff } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import { useCreateObservation, useSplitAccession } from '../../hooks/genetics/useGenetics';
import { Modal } from '../../components/genetics/Modal';
import {
  Banner,
  Button,
  Card,
  CodeChip,
  Field,
  GenerationBadge,
  Hint,
  Label,
  Select,
  StatusBadge,
  TextArea,
} from '../../components/genetics/styled';
import {
  KIND_LABELS,
  METHOD_LABELS,
  OBSERVATION_LABELS,
  STATUS_LABELS,
  VESSEL_LABELS,
  type AccessionStatus,
  type ObservationTypeValue,
  type OrganismKind,
  type PropagationMethodValue,
  type VesselForm,
} from '../../types/genetics';

// ============================================================================
// Local response shape — hand-mirrored from PublicAccessionInfo (spec §5.2 /
// src/modules/genetics/api/v1/public.py). Nothing here is imported from the
// backend; this is the frontend's own contract with the JSON on the wire.
// ============================================================================

interface PublicVesselInfo {
  number: number;
  of: number;
  splitOff: boolean;
  fromVesselNo: number | null;
}

interface PublicLineInfo {
  code: string;
  commonName: string;
  scientificName: string | null;
  kind: string;
}

interface PublicIngredientInfo {
  name: string;
  amount: number | null;
  unit: string | null;
}

interface PublicMediumInfo {
  batchCode: string | null;
  recipeName: string | null;
  ingredients: PublicIngredientInfo[] | null;
}

interface PublicProtocolInfo {
  code: string | null;
  title: string | null;
  version: number | null;
  steps: string[] | null;
}

interface PublicLineageStep {
  depth: number;
  accessionCode: string;
  generationLabel: string;
  method: string | null;
  performedAt: string | null;
  provenance: string | null;
  fromVesselNo: number | null;
}

// PublicLineageGraph — mirrors src/modules/genetics/api/v1/public.py's
// PublicLineageGraphNode / PublicLineageGraphEdge / PublicLineageGraph.
// Keyed by accessionCode, never an internal accessionId UUID (spec §5.2
// rule 3). Depth here is NOT the same axis as PublicLineageStep.depth above:
// LineageService._collect_around normalises so the shallowest ANCESTOR sits
// at depth 0, the scanned accession at a positive offset, and descendants
// deeper still — ascending depth reads oldest-ancestor-to-newest-descendant.
// The flat `lineage` breadcrumb above uses the opposite convention (depth 0
// = the scanned accession itself). Don't conflate the two.
interface PublicLineageGraphNode {
  code: string;
  generationLabel: string;
  form: string;
  status: string;
  isScanned: boolean;
  depth: number;
}

interface PublicLineageGraphEdge {
  from: string;
  to: string;
  // 'propagation' (new generation, the default) vs 'split' (same
  // material carved off with no generation change — see
  // AccessionService.split_accession / public.py's PublicLineageGraphEdge
  // docstring). Typed as a plain string, not a union, so an unrecognised
  // future value falls back to the propagation (unstyled) rendering
  // rather than failing a type guard.
  kind: string;
  fromVesselNo: number | null;
}

interface PublicLineageGraph {
  nodes: PublicLineageGraphNode[];
  edges: PublicLineageGraphEdge[];
  truncated: boolean;
}

// ============================================================================
// Two-tier response (T-806 part 3) — mirrors public.py's own split: a shared
// base (every field both `PublicAccessionInfo` and `AuthenticatedAccessionInfo`
// carry) plus exactly what the authenticated shape adds and never has nulled
// out — `accessionId`, and a `token` on every lineageGraph node. Two distinct
// types, not one type with an optional `accessionId?`, matching the backend's
// own "two hand-built shapes, never one shape with fields conditionally
// blanked" rule so a `token`/`accessionId` typo can't silently type-check as
// "present but empty" on the anonymous shape.
// ============================================================================

interface AccessionInfoBase {
  accessionCode: string;
  vessel: PublicVesselInfo | null;
  generationLabel: string;
  line: PublicLineInfo;
  form: string;
  status: string;
  acquiredAt: string | null;
  medium: PublicMediumInfo | null;
  protocol: PublicProtocolInfo | null;
  operator: string | null;
  facility: string | null;
  lineage: PublicLineageStep[];
}

interface PublicAccessionInfo extends AccessionInfoBase {
  lineageGraph: PublicLineageGraph;
}

/** Same six fields as `PublicLineageGraphNode`, plus the node's own
 * `publicToken` — present only when the caller carries a positively-resolved
 * session (see public.py's `AuthenticatedLineageGraphNode`). This is what
 * makes a tree node clickable: `token` is exactly the path segment `/i/:token`
 * already accepts. */
interface AuthenticatedLineageGraphNode extends PublicLineageGraphNode {
  token: string;
}

interface AuthenticatedLineageGraph {
  nodes: AuthenticatedLineageGraphNode[];
  edges: PublicLineageGraphEdge[];
  truncated: boolean;
}

interface AuthenticatedAccessionInfo extends AccessionInfoBase {
  /** Internal accession id — only ever present once `_optional_current_user`
   * has positively resolved an active session server-side. Its mere presence
   * on the parsed response IS the authenticated-session signal this page
   * uses; there is no separate auth check. */
  accessionId: string;
  lineageGraph: AuthenticatedLineageGraph;
}

type AccessionInfo = PublicAccessionInfo | AuthenticatedAccessionInfo;

function isAuthenticatedInfo(data: AccessionInfo): data is AuthenticatedAccessionInfo {
  return 'accessionId' in data;
}

// ============================================================================
// Fetch state — plain fetch() against a relative path, deliberately NOT the
// authenticated axios instance (services/api.ts attaches a bearer token and
// redirects to /login on 401 — exactly wrong for a public page). A relative
// path also means this works when a phone hits the LAN IP directly.
// ============================================================================

type LoadState =
  | { kind: 'loading' }
  | { kind: 'success'; data: AccessionInfo }
  | { kind: 'not-found' }
  | { kind: 'error' };

const NOT_FOUND_MESSAGE = 'No record found for this label.';

function buildUrl(token: string, vesselNo?: string): string {
  // Cosmetic lowercase only — the backend already normalises the token to
  // uppercase before its DB lookup (case-insensitive match), so this is not
  // required for correctness. It IS required that the request still fires
  // when the URL segment is uppercase (a real 17mm-label scan arrives as
  // /I/TOKEN/N — see App.tsx's case-duplicated routes).
  const t = encodeURIComponent(token.toLowerCase());
  if (vesselNo) {
    return `/api/v1/public/genetics/i/${t}/${encodeURIComponent(vesselNo.toLowerCase())}`;
  }
  return `/api/v1/public/genetics/i/${t}`;
}

/**
 * Best-effort bearer header for the info request — the ENTIRE session-
 * detection mechanism (no auth store, no session hook, no second request).
 * `services/api.ts`'s `accessToken` key is read directly (this page
 * deliberately does not use the authenticated `apiClient`, which redirects
 * to `/login` on 401 — exactly wrong for a route anyone can land on with no
 * session at all).
 *
 * Whatever comes back — missing key, empty string, an expired or outright
 * garbage token — is sent as-is. The backend's `_optional_current_user`
 * (public.py) fails closed on every one of those to the anonymous tier, so
 * there is nothing to validate here: sending a bad token is exactly as safe
 * as sending none, and the response shape (does `accessionId` show up?) is
 * the only signal this page ever acts on.
 */
function buildAuthHeaders(): HeadersInit | undefined {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

/** Extract the clone-generation number GenerationBadge needs for its colour
 * threshold, from a rendered label like "G3" or "F1-G2" (services/common.py
 * `generation_label`). The G digits always follow the literal "G". */
function parseCloneGeneration(label: string): number {
  const match = /G(\d+)/.exec(label);
  return match ? parseInt(match[1], 10) : 0;
}

function isKnownStatus(status: string): status is AccessionStatus {
  return status in STATUS_LABELS;
}

function isKnownKind(kind: string): kind is OrganismKind {
  return kind in KIND_LABELS;
}

function isKnownForm(form: string): form is VesselForm {
  return form in VESSEL_LABELS;
}

function isKnownMethod(method: string): method is PropagationMethodValue {
  return method in METHOD_LABELS;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Either tier's node shape — plain union rather than a generic, since this
 * function only ever reads fields both share (`depth`, `code`); the caller
 * narrows with `'token' in node` where it actually matters (tree-node
 * click-through). */
type AnyLineageGraphNode = PublicLineageGraphNode | AuthenticatedLineageGraphNode;

/** Group lineageGraph nodes into generation rows (ascending depth — oldest
 * ancestor first, newest descendant last) and index incoming edges by the
 * `to` code, so each card can caption which parent(s)/vessel it came from
 * without a measurement or SVG pass. Accepts either tier's graph shape. */
function buildLineageTreeRows(graph: {
  nodes: AnyLineageGraphNode[];
  edges: PublicLineageGraphEdge[];
  truncated: boolean;
}): {
  depths: number[];
  rowsByDepth: Map<number, AnyLineageGraphNode[]>;
  incomingByCode: Map<string, PublicLineageGraphEdge[]>;
} {
  const rowsByDepth = new Map<number, AnyLineageGraphNode[]>();
  graph.nodes.forEach((node) => {
    const row = rowsByDepth.get(node.depth) ?? [];
    row.push(node);
    rowsByDepth.set(node.depth, row);
  });
  rowsByDepth.forEach((row) => row.sort((a, b) => a.code.localeCompare(b.code)));

  const incomingByCode = new Map<string, PublicLineageGraphEdge[]>();
  graph.edges.forEach((edge) => {
    const list = incomingByCode.get(edge.to) ?? [];
    list.push(edge);
    incomingByCode.set(edge.to, list);
  });

  const depths = [...rowsByDepth.keys()].sort((a, b) => a - b);
  return { depths, rowsByDepth, incomingByCode };
}

/** One caption per incoming edge, rather than one joined string — a node
 * can have more than one incoming edge of DIFFERENT kinds at once (e.g.
 * live data: a plate reachable by both a `propagation` edge from a shared
 * grandparent AND a `split` edge from the batch it was lifted out of —
 * both are simultaneously true and both must render). A `split` edge is
 * the same physical material with no new generation — drawing it like a
 * `propagation` edge would state something biologically false, so it gets
 * a visibly distinct dashed/tinted treatment (SplitCaption) instead of
 * plain muted text. Renders nothing when there is no incoming edge (the
 * shallowest ancestor(s) in view), and never renders a vessel marker when
 * fromVesselNo is null — expected on live data today (T-805a vessel
 * numbers not always recorded), not a bug. */
function renderIncomingEdgeCaptions(edges: PublicLineageGraphEdge[]) {
  if (edges.length === 0) return null;
  return (
    <TreeFromCaptions>
      {edges.map((edge) => {
        const target = edge.fromVesselNo != null ? `${edge.from} #${edge.fromVesselNo}` : edge.from;
        if (edge.kind === 'split') {
          return (
            <SplitCaption key={`split-${edge.from}-${edge.to}`}>
              <Scissors size={10} strokeWidth={2.4} aria-hidden="true" />
              split from {target}
            </SplitCaption>
          );
        }
        return (
          <TreeFromCaption key={`prop-${edge.from}-${edge.to}`}>from {target}</TreeFromCaption>
        );
      })}
    </TreeFromCaptions>
  );
}

/** The old flat ancestry breadcrumb (newest-first). Shared between the
 * "Ancestry details" disclosure that sits under the tree, and the standalone
 * fallback section used when `lineageGraph` came back empty (its build can
 * fail independently of the flat walk — see `_build_lineage_graph`'s own
 * try/except in public.py) but `lineage` did not. */
function renderFlatLineageList(steps: PublicLineageStep[]) {
  return (
    <LineageList>
      {steps.map((step) => {
        const stepClone = parseCloneGeneration(step.generationLabel);
        const date = formatDate(step.performedAt);
        const methodLabel =
          step.method && isKnownMethod(step.method) ? METHOD_LABELS[step.method] : step.method;

        return (
          <LineageItem key={`${step.depth}-${step.accessionCode}`}>
            <LineageDot $current={step.depth === 0} />
            <LineageHead>
              <CodeChip>{step.accessionCode}</CodeChip>
              <GenerationBadge $clone={stepClone}>{step.generationLabel}</GenerationBadge>
              {step.fromVesselNo != null && (
                <LineageFromVessel>← #{step.fromVesselNo}</LineageFromVessel>
              )}
            </LineageHead>
            {step.method === null ? (
              <LineageMeta>{step.provenance ?? 'Founding material'}</LineageMeta>
            ) : (
              <LineageMeta>
                {methodLabel}
                {date ? ` · ${date}` : ''}
              </LineageMeta>
            )}
          </LineageItem>
        );
      })}
    </LineageList>
  );
}

// ============================================================================
// Styled — mobile-first. Read one-handed over a petri dish in poor light, so
// generous font sizes and a single narrow column at every breakpoint rather
// than a layout that only tightens up below a media query.
// ============================================================================

const PageRoot = styled.div`
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  padding: 28px 16px 56px;
`;

const ContentWrap = styled.div`
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const HeaderCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const CodeRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
`;

const AccessionCode = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 1.55rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: -0.01em;
  word-break: break-word;
`;

const VesselTag = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 1.15rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
`;

const CommonName = styled.div`
  font-size: 1.05rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ScientificName = styled.div`
  font-size: 0.85rem;
  font-style: italic;
  color: ${({ theme }) => theme.colors.muted};
`;

const BadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
`;

const InfoSection = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const ActionsRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const InfoRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const InfoLabel = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoValue = styled.span`
  font-size: 0.95rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
`;

const IngredientList = styled.ul`
  margin: 2px 0 0;
  padding-left: 18px;
  font-size: 0.88rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.6;
`;

const StepList = styled.ol`
  margin: 2px 0 0;
  padding-left: 18px;
  font-size: 0.88rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.6;
`;

const SectionTitle = styled.h2`
  ${monoLabel}
  margin: 0;
  color: ${({ theme }) => theme.colors.celeste};
`;

const LineageList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const LineageItem = styled.li`
  position: relative;
  padding: 0 0 18px 22px;
  border-left: 2px solid ${({ theme }) => theme.colors.glass.border};

  &:last-child {
    padding-bottom: 0;
    border-left-color: transparent;
  }
`;

const LineageDot = styled.span<{ $current: boolean }>`
  position: absolute;
  left: -7px;
  top: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.colors.celeste};
  background: ${({ $current, theme }) =>
    $current ? theme.colors.secondary[500] : theme.colors.glass.base};
`;

const LineageHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const LineageMeta = styled.div`
  margin-top: 4px;
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`;

const LineageFromVessel = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// Family tree — renders `lineageGraph` (ancestors AND descendants, spec
// follow-up). Deliberately NOT components/genetics/LineageTree.tsx: that
// component absolutely-positions generation rows and connects them with SVG
// bezier curves, sized for the authenticated graph (up to 500 nodes, keyed
// by accessionId UUID, richer node shape with quantity/unit/mediumBatchCode).
// The public graph is capped far smaller (60 nodes / depth 8) and keyed by
// accessionCode only — adapting LineageTree would mean fabricating fields it
// needs but this payload doesn't carry. A plain wrapping generation-row list
// needs no measurement/SVG pass and reads better one-handed on a phone.
// Horizontal overflow is contained to TreeScroll (never the page body) as a
// defensive fallback — in practice flex-wrap keeps each row from needing it.
// ============================================================================

const TreeScroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const TreeRows = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const TreeRowConnector = styled.div`
  width: 2px;
  height: 14px;
  margin: 0 0 0 14px;
  background: ${({ theme }) => theme.colors.glass.border};
`;

const TreeRowCards = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
`;

// Rendered as a real <button> (via the `as` prop) for an authenticated node
// that carries its own `token` — clickable, and gets keyboard activation
// (Enter/Space) and screen-reader semantics for free from the native
// element, rather than a div with a synthetic click handler. An anonymous
// node (no token) stays a plain, non-interactive <div> — spec: "Anonymous
// nodes stay non-interactive — do not render a dead-looking link."
const TreeNodeCard = styled.div<{ $scanned: boolean; $clickable: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid
    ${({ theme, $scanned }) => ($scanned ? theme.colors.primary[400] : theme.colors.glass.border)};
  /* Scanned card is a low-alpha tint of the 500 step, never [50]/[100] —
     under Night Observatory those steps are near-white while body text is
     cream-coloured, which reads as invisible (fixed the same way on
     AccessionDetailPage's current-breadcrumb chip; see that file's Crumb
     styled component for the worked precedent). Text stays textPrimary
     throughout — only the background/border shift for "you are here". */
  background: ${({ theme, $scanned }) =>
    $scanned ? `${theme.colors.primary[500]}29` : theme.colors.glass.base};

  /* Reset button-element defaults so this reads identically whether it
     renders as a <div> or a <button> — font/color/text-align do not inherit
     into a native <button> the way they do into a <div>. */
  ${({ $clickable, theme }) =>
    $clickable &&
    css`
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;

      &:hover {
        border-color: ${theme.colors.celeste};
      }
      &:focus-visible {
        outline: 2px solid ${theme.colors.secondary[500]};
        outline-offset: 2px;
      }
    `}
`;

const TreeNodeHead = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const TreeFromCaptions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
`;

const TreeFromCaption = styled.div`
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.muted};
  word-break: break-word;
`;

// Split-edge treatment (spec: "a reader must be able to tell them apart
// without a legend"). Dashed border reads as "not a solid connection" —
// same material carved off, not a new generation — and the warning token
// (gold-b, a flat semantic colour, never a [50]/[100] ramp step) keeps
// contrast solid on both themes. Background is a low-alpha tint of that
// same flat colour, per the contrast rule that has bitten twice: never
// wash a background with a [50]/[100] step directly.
const SplitCaption = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px dashed ${({ theme }) => theme.colors.warning};
  background: ${({ theme }) => `${theme.colors.warning}1F`};
  color: ${({ theme }) => theme.colors.warning};
  font-size: 0.74rem;
  font-weight: 700;
  word-break: break-word;
`;

const TreeLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: -4px;
`;

const TreeLegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const TreeLegendSwatch = styled.span<{ $split: boolean }>`
  display: inline-block;
  width: 18px;
  border-top: 2px ${({ $split }) => ($split ? 'dashed' : 'solid')}
    ${({ theme, $split }) => ($split ? theme.colors.warning : theme.colors.glass.border)};
`;

const ScannedPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Compact, collapsed-by-default wrapper for the old flat breadcrumb — kept
// for the method/date-per-hop detail the graph doesn't carry (graph nodes
// have no `method`/`performedAt`), but demoted so it never competes with the
// tree above as an equally-prominent full-size section (spec follow-up).
const AncestryDetails = styled.details`
  &[open] summary {
    margin-bottom: 10px;
  }
`;

const AncestrySummary = styled.summary`
  ${monoLabel}
  cursor: pointer;
  color: ${({ theme }) => theme.colors.celeste};
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  &::before {
    content: '▸ ';
  }

  details[open] > &::before {
    content: '▾ ';
  }
`;

// Loading / error states
const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const CenteredState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 64px 20px;
  color: ${({ theme }) => theme.colors.muted};
`;

const Spinner = styled.div`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid ${({ theme }) => theme.colors.glass.border};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
  animation: ${spin} 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2.4s;
  }
`;

const StateCard = styled.div`
  ${glassPanel}
  padding: 32px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`;

const StateTitle = styled.div`
  font-size: 1.05rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StateMessage = styled.p`
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
`;

// ============================================================================
// Component
// ============================================================================

export function LabelInfoPage() {
  const { token, vesselNo } = useParams<{ token: string; vesselNo?: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  // Extracted out of the mount effect so the scan-to-act actions below can
  // re-run it after a successful write (e.g. "Mark contaminated" splits the
  // vessel off — the page needs the fresh `splitOff: true` to reflect that),
  // without duplicating the fetch/parse logic.
  const fetchInfo = useCallback(
    (signal?: AbortSignal) => {
      if (!token) {
        setState({ kind: 'not-found' });
        return;
      }
      setState({ kind: 'loading' });
      // `buildAuthHeaders()` is the entire session-detection mechanism — see
      // its own docstring. No separate "am I logged in" call exists anywhere
      // on this page.
      fetch(buildUrl(token, vesselNo), { signal, headers: buildAuthHeaders() })
        .then(async (res) => {
          if (res.status === 404) {
            setState({ kind: 'not-found' });
            return;
          }
          if (!res.ok) {
            setState({ kind: 'error' });
            return;
          }
          const data = (await res.json()) as AccessionInfo;
          setState({ kind: 'success', data });
        })
        .catch(() => {
          if (signal?.aborted) return;
          setState({ kind: 'error' });
        });
    },
    [token, vesselNo]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchInfo(controller.signal);
    return () => controller.abort();
  }, [fetchInfo]);

  // Scan-to-act mutations (T-806 part 2). Both go through the same
  // authenticated hooks/geneticsApi.ts path every other genetics write uses
  // (apiClient, bearer header from the same `accessToken` key
  // `buildAuthHeaders` reads) — only ever invoked from the actions area
  // below, which itself only renders once `isAuthenticatedInfo(state.data)`
  // is true. A stale/garbage token that already degraded the info GET to the
  // anonymous tier degrades these identically; there is no separate check.
  const accessionId =
    state.kind === 'success' && isAuthenticatedInfo(state.data) ? state.data.accessionId : '';
  const splitAccession = useSplitAccession(accessionId);
  const createObservation = useCreateObservation();

  const [showContaminatedConfirm, setShowContaminatedConfirm] = useState(false);
  const [contaminatedReason, setContaminatedReason] = useState('');
  const [showObserveForm, setShowObserveForm] = useState(false);
  const [observeType, setObserveType] = useState<ObservationTypeValue>('growth');
  const [observeText, setObserveText] = useState('');

  const handleMarkContaminated = async () => {
    if (state.kind !== 'success') return;
    const info = state.data;
    if (!isAuthenticatedInfo(info) || !info.vessel) return;
    await splitAccession.mutateAsync({
      quantity: 1,
      vesselNumbers: [info.vessel.number],
      status: 'contaminated',
      reason: contaminatedReason.trim(),
    });
    setShowContaminatedConfirm(false);
    setContaminatedReason('');
    fetchInfo(); // Refresh so the vessel now reports splitOff: true.
  };

  const handleRecordObservation = async () => {
    if (state.kind !== 'success') return;
    const info = state.data;
    if (!isAuthenticatedInfo(info) || !info.vessel) return;
    await createObservation.mutateAsync({
      accessionId: info.accessionId,
      type: observeType,
      text: observeText.trim() || undefined,
      vesselNo: info.vessel.number,
    });
    setShowObserveForm(false);
    setObserveText('');
  };

  if (state.kind === 'loading') {
    return (
      <PageRoot>
        <ContentWrap>
          <CenteredState>
            <Spinner role="status" aria-label="Loading label info" />
          </CenteredState>
        </ContentWrap>
      </PageRoot>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <PageRoot>
        <ContentWrap>
          <StateCard role="alert">
            <AlertTriangle size={28} strokeWidth={1.8} />
            <StateTitle>{NOT_FOUND_MESSAGE}</StateTitle>
          </StateCard>
        </ContentWrap>
      </PageRoot>
    );
  }

  if (state.kind === 'error') {
    return (
      <PageRoot>
        <ContentWrap>
          <StateCard role="alert">
            <WifiOff size={28} strokeWidth={1.8} />
            <StateTitle>Couldn&apos;t reach the server</StateTitle>
            <StateMessage>
              Something went wrong loading this label. Check your connection and try again.
            </StateMessage>
          </StateCard>
        </ContentWrap>
      </PageRoot>
    );
  }

  const { data } = state;
  const cloneGeneration = parseCloneGeneration(data.generationLabel);
  const tree = buildLineageTreeRows(data.lineageGraph);
  // Legend only earns its screen space when there's actually a split edge
  // in view — most scanned trees are pure propagation and the dashed-chip
  // language would be dead weight there.
  const hasSplitEdge = data.lineageGraph.edges.some((edge) => edge.kind === 'split');
  // The ONLY authentication check on this page: does the parsed response
  // carry `accessionId`? The server decides that, not this line — see
  // `isAuthenticatedInfo`'s own docstring and public.py rule 3.
  const authed = isAuthenticatedInfo(data) ? data : null;

  return (
    <PageRoot>
      <ContentWrap>
        <HeaderCard>
          <CodeRow>
            <AccessionCode>{data.accessionCode}</AccessionCode>
            {data.vessel && (
              <VesselTag>
                #{data.vessel.number}
                {data.vessel.fromVesselNo != null ? ` ← #${data.vessel.fromVesselNo}` : ''}
              </VesselTag>
            )}
          </CodeRow>
          <CommonName>{data.line.commonName}</CommonName>
          {data.line.scientificName && <ScientificName>{data.line.scientificName}</ScientificName>}
          <BadgeRow>
            <GenerationBadge $clone={cloneGeneration}>{data.generationLabel}</GenerationBadge>
            {isKnownStatus(data.status) && (
              <StatusBadge $status={data.status}>{STATUS_LABELS[data.status]}</StatusBadge>
            )}
            {isKnownKind(data.line.kind) && <CodeChip>{KIND_LABELS[data.line.kind]}</CodeChip>}
            {isKnownForm(data.form) && <CodeChip>{VESSEL_LABELS[data.form]}</CodeChip>}
          </BadgeRow>
        </HeaderCard>

        {data.vessel?.splitOff && (
          <Banner $tone="warning" role="alert">
            This vessel was separated from the batch this label names — it no longer belongs to{' '}
            {data.accessionCode} as printed.
          </Banner>
        )}

        {/* Scan-to-act (T-806 part 2) — only ever rendered once `authed` is
            non-null, i.e. the response itself carried `accessionId`. There is
            a scanned vessel to act on only when this page resolved a specific
            vesselNo (batch-level scans, `data.vessel === null`, have nothing
            for these three actions to target). */}
        {authed && authed.vessel && (
          <InfoSection>
            <SectionTitle>Actions</SectionTitle>
            <ActionsRow>
              {!authed.vessel.splitOff && (
                <Button
                  type="button"
                  $variant="danger"
                  onClick={() => setShowContaminatedConfirm(true)}
                >
                  Mark contaminated
                </Button>
              )}
              <Button type="button" $variant="ghost" onClick={() => setShowObserveForm(true)}>
                Record observation
              </Button>
              <Button
                type="button"
                $variant="ghost"
                onClick={() =>
                  navigate(
                    `/genetics/accessions/${authed.accessionId}?propagate=1&vesselNo=${authed.vessel!.number}`
                  )
                }
              >
                Propagate from this vessel
              </Button>
            </ActionsRow>
          </InfoSection>
        )}

        <InfoSection>
          {data.acquiredAt && formatDate(data.acquiredAt) && (
            <InfoRow>
              <InfoLabel>Acquired</InfoLabel>
              <InfoValue>{formatDate(data.acquiredAt)}</InfoValue>
            </InfoRow>
          )}

          {data.medium && (
            <InfoRow>
              <InfoLabel>Medium</InfoLabel>
              <InfoValue>
                {data.medium.recipeName ?? 'Unlisted recipe'}
                {data.medium.batchCode ? ` · ${data.medium.batchCode}` : ''}
              </InfoValue>
              {data.medium.ingredients && data.medium.ingredients.length > 0 && (
                <IngredientList>
                  {data.medium.ingredients.map((ing, i) => (
                    <li key={`${ing.name}-${i}`}>
                      {ing.name}
                      {ing.amount != null ? ` — ${ing.amount}${ing.unit ? ` ${ing.unit}` : ''}` : ''}
                    </li>
                  ))}
                </IngredientList>
              )}
            </InfoRow>
          )}

          {data.protocol && (
            <InfoRow>
              <InfoLabel>Protocol</InfoLabel>
              <InfoValue>
                {data.protocol.title ?? data.protocol.code ?? 'Unlisted protocol'}
                {data.protocol.code && data.protocol.title ? ` (${data.protocol.code})` : ''}
                {data.protocol.version != null ? ` · v${data.protocol.version}` : ''}
              </InfoValue>
              {data.protocol.steps && data.protocol.steps.length > 0 && (
                <StepList>
                  {data.protocol.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </StepList>
              )}
            </InfoRow>
          )}

          {data.operator && (
            <InfoRow>
              <InfoLabel>Operator</InfoLabel>
              <InfoValue>{data.operator}</InfoValue>
            </InfoRow>
          )}

          {data.facility && (
            <InfoRow>
              <InfoLabel>Facility</InfoLabel>
              <InfoValue>{data.facility}</InfoValue>
            </InfoRow>
          )}
        </InfoSection>

        {data.lineageGraph.nodes.length > 0 && (
          <InfoSection>
            <SectionTitle>Family Tree</SectionTitle>
            {hasSplitEdge && (
              <TreeLegend>
                <TreeLegendItem>
                  <TreeLegendSwatch $split={false} aria-hidden="true" />
                  Propagation — new generation
                </TreeLegendItem>
                <TreeLegendItem>
                  <TreeLegendSwatch $split aria-hidden="true" />
                  Split — same material, no new generation
                </TreeLegendItem>
              </TreeLegend>
            )}
            <TreeScroll>
              <TreeRows>
                {tree.depths.map((depth, rowIndex) => (
                  <div key={depth}>
                    {rowIndex > 0 && <TreeRowConnector aria-hidden="true" />}
                    <TreeRowCards>
                      {(tree.rowsByDepth.get(depth) ?? []).map((node) => {
                        const nodeClone = parseCloneGeneration(node.generationLabel);
                        const incomingEdges = tree.incomingByCode.get(node.code) ?? [];
                        // Only an authenticated response's nodes ever carry a
                        // `token` (public.py rule 3) — an anonymous node has
                        // no address to send a click to, so it stays a plain,
                        // non-interactive <div> (spec: "do not render a
                        // dead-looking link").
                        const nodeToken = 'token' in node ? node.token : null;
                        return (
                          <TreeNodeCard
                            key={node.code}
                            as={nodeToken ? 'button' : 'div'}
                            type={nodeToken ? 'button' : undefined}
                            $scanned={node.isScanned}
                            $clickable={!!nodeToken}
                            aria-current={node.isScanned ? 'location' : undefined}
                            onClick={nodeToken ? () => navigate(`/i/${nodeToken}`) : undefined}
                          >
                            {node.isScanned && (
                              <ScannedPill>
                                <MapPin size={11} strokeWidth={2.5} />
                                You are here
                              </ScannedPill>
                            )}
                            <TreeNodeHead>
                              <CodeChip>{node.code}</CodeChip>
                              <GenerationBadge $clone={nodeClone}>{node.generationLabel}</GenerationBadge>
                              {isKnownStatus(node.status) && (
                                <StatusBadge $status={node.status}>
                                  {STATUS_LABELS[node.status]}
                                </StatusBadge>
                              )}
                            </TreeNodeHead>
                            {renderIncomingEdgeCaptions(incomingEdges)}
                          </TreeNodeCard>
                        );
                      })}
                    </TreeRowCards>
                  </div>
                ))}
              </TreeRows>
            </TreeScroll>

            {data.lineageGraph.truncated && (
              <Banner $tone="warning" role="note">
                This tree is larger than what&apos;s shown here — only part of the full lineage is
                displayed.
              </Banner>
            )}

            {data.lineage.length > 0 && (
              <AncestryDetails>
                <AncestrySummary>Ancestry details (method &amp; dates)</AncestrySummary>
                {renderFlatLineageList(data.lineage)}
              </AncestryDetails>
            )}
          </InfoSection>
        )}

        {data.lineageGraph.nodes.length === 0 && data.lineage.length > 0 && (
          <InfoSection>
            <SectionTitle>Lineage</SectionTitle>
            {renderFlatLineageList(data.lineage)}
          </InfoSection>
        )}
      </ContentWrap>

      {showContaminatedConfirm && authed && authed.vessel && (
        <Modal
          title={`Mark ${data.accessionCode} #${authed.vessel.number} contaminated?`}
          subtitle="This splits the vessel off into its own record — confirm before continuing."
          onClose={() => setShowContaminatedConfirm(false)}
          footer={
            <>
              <Button
                type="button"
                $variant="ghost"
                onClick={() => setShowContaminatedConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                $variant="danger"
                onClick={handleMarkContaminated}
                disabled={!contaminatedReason.trim() || splitAccession.isPending}
              >
                {splitAccession.isPending ? 'Splitting…' : 'Mark contaminated'}
              </Button>
            </>
          }
        >
          {splitAccession.isError && (
            <Banner $tone="error">
              {(splitAccession.error as { response?: { data?: { detail?: string } } } | undefined)
                ?.response?.data?.detail ?? splitAccession.error.message}
            </Banner>
          )}
          <Hint>
            Vessel #{authed.vessel.number} will be split off {data.accessionCode} into its own
            record, status &quot;Contaminated&quot;.
          </Hint>
          <Field>
            <Label>Reason</Label>
            <TextArea
              value={contaminatedReason}
              onChange={(e) => setContaminatedReason(e.target.value)}
              placeholder="Green mould visible on plate surface"
            />
          </Field>
        </Modal>
      )}

      {showObserveForm && authed && authed.vessel && (
        <Modal
          title={`Observe ${data.accessionCode} #${authed.vessel.number}`}
          subtitle="Dated note against this vessel."
          onClose={() => setShowObserveForm(false)}
          footer={
            <>
              <Button type="button" $variant="ghost" onClick={() => setShowObserveForm(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleRecordObservation}
                disabled={!observeText.trim() || createObservation.isPending}
              >
                {createObservation.isPending ? 'Saving…' : 'Record'}
              </Button>
            </>
          }
        >
          {createObservation.isError && (
            <Banner $tone="error">
              {(
                createObservation.error as
                  | { response?: { data?: { detail?: string } } }
                  | undefined
              )?.response?.data?.detail ?? createObservation.error.message}
            </Banner>
          )}
          <Field>
            <Label>Type</Label>
            <Select
              value={observeType}
              onChange={(e) => setObserveType(e.target.value as ObservationTypeValue)}
            >
              {(Object.keys(OBSERVATION_LABELS) as ObservationTypeValue[]).map((t) => (
                <option key={t} value={t}>
                  {OBSERVATION_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>What did you see?</Label>
            <TextArea
              value={observeText}
              onChange={(e) => setObserveText(e.target.value)}
              placeholder="Colonisation looks even, no signs of stress"
            />
          </Field>
          <Hint>Recorded against vessel #{authed.vessel.number} of {data.accessionCode}.</Hint>
        </Modal>
      )}
    </PageRoot>
  );
}
