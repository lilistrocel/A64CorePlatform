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

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import {
  Banner,
  Card,
  CodeChip,
  GenerationBadge,
  StatusBadge,
} from '../../components/genetics/styled';
import {
  KIND_LABELS,
  METHOD_LABELS,
  STATUS_LABELS,
  VESSEL_LABELS,
  type AccessionStatus,
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

interface PublicAccessionInfo {
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

// ============================================================================
// Fetch state — plain fetch() against a relative path, deliberately NOT the
// authenticated axios instance (services/api.ts attaches a bearer token and
// redirects to /login on 401 — exactly wrong for a public page). A relative
// path also means this works when a phone hits the LAN IP directly.
// ============================================================================

type LoadState =
  | { kind: 'loading' }
  | { kind: 'success'; data: PublicAccessionInfo }
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
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'not-found' });
      return;
    }

    const controller = new AbortController();
    setState({ kind: 'loading' });

    fetch(buildUrl(token, vesselNo), { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setState({ kind: 'not-found' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error' });
          return;
        }
        const data = (await res.json()) as PublicAccessionInfo;
        setState({ kind: 'success', data });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error' });
      });

    return () => controller.abort();
  }, [token, vesselNo]);

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

        {data.lineage.length > 0 && (
          <InfoSection>
            <SectionTitle>Lineage</SectionTitle>
            <LineageList>
              {data.lineage.map((step) => {
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
          </InfoSection>
        )}
      </ContentWrap>
    </PageRoot>
  );
}
