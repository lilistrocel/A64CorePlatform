/**
 * Genetics Repo — Accession Detail
 *
 * Everything about one piece of physical material: where it came from, what it
 * is sitting on, what has been seen in it, and what can be done with it next.
 *
 * The ancestry breadcrumb answers the question the whole repo exists for —
 * "where did this come from" — in one line, all the way back to unrecorded
 * origin if that is where the trail ends.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { HelpButton } from '../../components/tutorials/HelpButton';
import { LineageTree } from '../../components/genetics/LineageTree';
import { ObservationModal } from '../../components/genetics/ObservationModal';
import { PromoteTraitModal } from '../../components/genetics/PromoteTraitModal';
import { PropagateModal } from '../../components/genetics/PropagateModal';
import { SplitAccessionModal } from '../../components/genetics/SplitAccessionModal';
import {
  Banner,
  Button,
  Card,
  CodeChip,
  EmptyState,
  Field,
  GenerationBadge,
  Label,
  PageHeader,
  PageTitle,
  PageWrap,
  SectionTitle,
  Select,
  StatusBadge,
  Tag,
} from '../../components/genetics/styled';
import {
  useAccession,
  useAncestry,
  useGeneticLine,
  useLineageGraph,
  useMediumBatches,
  useObservations,
  useUpdateAccession,
} from '../../hooks/genetics/useGenetics';
import type { AccessionStatus, Observation } from '../../types/genetics';
import {
  METHOD_LABELS,
  OBSERVATION_LABELS,
  PROVENANCE_LABELS,
  ROLE_LABELS,
  SENESCENCE_WATCH_GENERATION,
  STATUS_LABELS,
  VESSEL_LABELS,
} from '../../types/genetics';

const BackLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary[700]};
  cursor: pointer;
  margin-bottom: 8px;

  &:hover {
    text-decoration: underline;
  }
`;

const Section = styled.section`
  margin-top: 26px;
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const DefList = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 16px;
  margin: 0;
  font-size: 13.5px;
`;

const Dt = styled.dt`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: 600;
`;

const Dd = styled.dd`
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Breadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const Crumb = styled.button<{ $current?: boolean; $unknown?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: ${({ theme, $current }) =>
    $current ? theme.colors.primary[50] : theme.colors.background};
  border: 1px solid
    ${({ theme, $current }) =>
      $current ? theme.colors.primary[400] : theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 5px 10px;
  cursor: ${({ $unknown }) => ($unknown ? 'default' : 'pointer')};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12.5px;
  font-weight: 700;
  color: ${({ theme, $unknown }) =>
    $unknown ? theme.colors.textDisabled : theme.colors.textPrimary};
  font-style: ${({ $unknown }) => ($unknown ? 'italic' : 'normal')};

  &:hover {
    border-color: ${({ theme, $unknown }) =>
      $unknown ? theme.colors.neutral[300] : theme.colors.primary[500]};
  }
`;

const Arrow = styled.span`
  color: ${({ theme }) => theme.colors.textDisabled};
  font-size: 14px;
`;

const CrumbMeta = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-weight: 500;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Timeline = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ObsCard = styled.div<{ $novel: boolean }>`
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid
    ${({ $novel, theme }) => ($novel ? theme.colors.warning : theme.colors.neutral[200])};
  background: ${({ $novel, theme }) => ($novel ? theme.colors.warningBg : 'transparent')};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ObsHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12.5px;
`;

const MetricRow = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const STATUSES = Object.keys(STATUS_LABELS) as AccessionStatus[];

export function AccessionDetailPage() {
  const { accessionId } = useParams<{ accessionId: string }>();
  const navigate = useNavigate();

  const [showObserve, setShowObserve] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showPropagate, setShowPropagate] = useState(false);
  const [promoting, setPromoting] = useState<Observation | null>(null);

  const { data: accession, isLoading } = useAccession(accessionId);
  const { data: line } = useGeneticLine(accession?.lineId);
  const { data: ancestry } = useAncestry(accessionId);
  const { data: graph } = useLineageGraph({ accessionId });
  const { data: obsPage } = useObservations({ accessionId, perPage: 50 });
  const { data: batchPage } = useMediumBatches({ perPage: 100 });
  const updateAccession = useUpdateAccession(accessionId ?? '');

  if (isLoading) {
    return (
      <PageWrap>
        <EmptyState>Loading…</EmptyState>
      </PageWrap>
    );
  }

  if (!accession) {
    return (
      <PageWrap>
        <EmptyState>Accession not found.</EmptyState>
      </PageWrap>
    );
  }

  const observations = obsPage?.data ?? [];
  const batch = (batchPage?.data ?? []).find((b) => b.id === accession.mediumBatchId);
  const deepClone = accession.cloneGeneration >= SENESCENCE_WATCH_GENERATION;

  return (
    <PageWrap>
      <PageHeader>
        <div>
          <BackLink onClick={() => navigate(`/genetics/lines/${accession.lineId}`)}>
            ← {line?.commonName ?? 'Line'}
          </BackLink>
          <PageTitle>
            <CodeChip style={{ fontSize: 22, padding: '4px 10px' }}>
              {accession.accessionCode}
            </CodeChip>
            <HelpButton topic="genetics.accession" />
          </PageTitle>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <GenerationBadge
              $clone={accession.cloneGeneration}
              $filial={accession.filialGeneration}
            >
              {accession.generationLabel}
            </GenerationBadge>
            <StatusBadge $status={accession.status}>
              {STATUS_LABELS[accession.status]}
            </StatusBadge>
            <Tag>{VESSEL_LABELS[accession.form]}</Tag>
            <Tag>
              {accession.quantity} {accession.unit}
            </Tag>
          </div>
        </div>

        <Actions>
          <Button $variant="ghost" onClick={() => setShowObserve(true)}>
            Observe
          </Button>
          <Button
            $variant="ghost"
            onClick={() => setShowSplit(true)}
            disabled={accession.quantity < 2}
            title={
              accession.quantity < 2
                ? 'Nothing to split — this record holds a single vessel'
                : undefined
            }
          >
            Split
          </Button>
          <Button onClick={() => setShowPropagate(true)}>Propagate from this</Button>
        </Actions>
      </PageHeader>

      {deepClone && (
        <Banner $tone="warning">
          <strong>G{accession.cloneGeneration}</strong> — this material is deep in a clone
          chain. Vigour typically declines past G{SENESCENCE_WATCH_GENERATION}; consider
          re-isolating rather than transferring again.
        </Banner>
      )}

      {ancestry && ancestry.steps.length > 0 && (
        <Section>
          <SectionTitle>Where it came from</SectionTitle>
          <Breadcrumb>
            {ancestry.steps.map((step, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <Arrow>→</Arrow>}
                <Crumb
                  type="button"
                  $unknown={step.isUnknown}
                  $current={step.accessionId === accession.id}
                  onClick={() =>
                    !step.isUnknown &&
                    step.accessionId &&
                    navigate(`/genetics/accessions/${step.accessionId}`)
                  }
                  title={
                    step.method
                      ? `${METHOD_LABELS[step.method]}${
                          step.mediumBatchCode ? ` on ${step.mediumBatchCode}` : ''
                        }`
                      : undefined
                  }
                >
                  {step.isUnknown ? 'unrecorded origin' : step.accessionCode}
                  {step.generationLabel && <CrumbMeta>{step.generationLabel}</CrumbMeta>}
                </Crumb>
              </span>
            ))}
          </Breadcrumb>
          {ancestry.hasBranching && (
            <Muted style={{ display: 'block', marginTop: 8 }}>
              A cross sits in this ancestry — the breadcrumb follows the primary parent. The
              full graph below shows both sides.
            </Muted>
          )}
          {ancestry.reachedUnknownOrigin && (
            <Muted style={{ display: 'block', marginTop: 8 }}>
              The trail ends in ancestry that was never recorded.
            </Muted>
          )}
        </Section>
      )}

      <Section>
        <Columns>
          <Card>
            <SectionTitle>Material</SectionTitle>
            <DefList>
              <Dt>Line</Dt>
              <Dd>
                {line ? `${line.commonName} (${line.code})` : '—'}
              </Dd>
              <Dt>Clone gen (G)</Dt>
              <Dd>{accession.cloneGeneration}</Dd>
              <Dt>Filial gen (F)</Dt>
              <Dd>{accession.filialGeneration}</Dd>
              <Dt>Form</Dt>
              <Dd>{VESSEL_LABELS[accession.form]}</Dd>
              <Dt>Quantity</Dt>
              <Dd>
                {accession.quantity} {accession.unit}
              </Dd>
              <Dt>Location</Dt>
              <Dd>
                {[
                  accession.location?.facility,
                  accession.location?.room,
                  accession.location?.unit,
                  accession.location?.position,
                ]
                  .filter(Boolean)
                  .join(' / ') || '—'}
              </Dd>
              <Dt>Acquired</Dt>
              <Dd>
                {accession.acquiredAt
                  ? new Date(accession.acquiredAt).toLocaleDateString()
                  : '—'}
              </Dd>
              {accession.provenance && (
                <>
                  <Dt>Origin</Dt>
                  <Dd>
                    {PROVENANCE_LABELS[accession.provenance.type]}
                    {accession.provenance.sourceNote
                      ? ` — ${accession.provenance.sourceNote}`
                      : ''}
                  </Dd>
                </>
              )}
              {accession.parents.length > 0 && (
                <>
                  <Dt>Parents</Dt>
                  <Dd>
                    {accession.parents
                      .map((p) =>
                        p.accessionId
                          ? ROLE_LABELS[p.role]
                          : `${ROLE_LABELS[p.role]} (unidentified)`
                      )
                      .join(', ')}
                  </Dd>
                </>
              )}
              {accession.notes && (
                <>
                  <Dt>Notes</Dt>
                  <Dd>{accession.notes}</Dd>
                </>
              )}
            </DefList>

            <div style={{ marginTop: 16 }}>
              <Field>
                <Label>Status</Label>
                <Select
                  value={accession.status}
                  onChange={(e) =>
                    updateAccession.mutate({ status: e.target.value as AccessionStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle>Grown on</SectionTitle>
            {batch ? (
              <DefList>
                <Dt>Batch</Dt>
                <Dd>
                  <CodeChip>{batch.batchCode}</CodeChip>
                </Dd>
                <Dt>Recipe</Dt>
                <Dd>
                  {batch.recipeName} (v{batch.recipeVersion})
                </Dd>
                <Dt>Prepared</Dt>
                <Dd>{new Date(batch.preparedAt).toLocaleDateString()}</Dd>
                <Dt>Sterilised</Dt>
                <Dd>
                  {batch.sterilization.method.replace(/_/g, ' ')}
                  {batch.sterilization.temperatureC
                    ? ` · ${batch.sterilization.temperatureC}°C`
                    : ''}
                  {batch.sterilization.minutes ? ` · ${batch.sterilization.minutes} min` : ''}
                </Dd>
                <Dt>Ingredients</Dt>
                <Dd>
                  {batch.ingredientsSnapshot.length
                    ? batch.ingredientsSnapshot
                        .map((i) =>
                          [i.name, i.amount ? `${i.amount}${i.unit ?? ''}` : null]
                            .filter(Boolean)
                            .join(' ')
                        )
                        .join(', ')
                    : '—'}
                </Dd>
                <Dt>Additives</Dt>
                <Dd>
                  {batch.additivesSnapshot.length ? (
                    batch.additivesSnapshot.map((a) => (
                      <Tag key={a.name} style={{ marginRight: 6 }}>
                        {a.name}
                        {a.amount ? ` ${a.amount}${a.unit ?? ''}` : ''}
                      </Tag>
                    ))
                  ) : (
                    <Muted>none</Muted>
                  )}
                </Dd>
              </DefList>
            ) : (
              <Muted>No medium batch recorded for this accession.</Muted>
            )}
          </Card>
        </Columns>
      </Section>

      <Section>
        <SectionTitle>
          Observations <Muted>({observations.length})</Muted>
        </SectionTitle>
        {observations.length === 0 ? (
          <EmptyState>
            Nothing recorded yet. Use <strong>Observe</strong> to log growth, morphology or
            contamination.
          </EmptyState>
        ) : (
          <Timeline>
            {observations.map((obs) => (
              <ObsCard key={obs.id} $novel={obs.isNovelTrait && !obs.promotedToLineId}>
                <ObsHead>
                  <strong>{OBSERVATION_LABELS[obs.type]}</strong>
                  <Muted>{new Date(obs.observedAt).toLocaleString()}</Muted>
                  {obs.isNovelTrait && <Tag>novel trait</Tag>}
                  {obs.promotedToLineId && (
                    <BackLink
                      style={{ margin: 0 }}
                      onClick={() => navigate(`/genetics/lines/${obs.promotedToLineId}`)}
                    >
                      promoted → open line
                    </BackLink>
                  )}
                  {obs.isNovelTrait && !obs.promotedToLineId && (
                    <Button
                      $variant="ghost"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => setPromoting(obs)}
                    >
                      Promote to new line
                    </Button>
                  )}
                </ObsHead>
                {obs.traitName && <strong style={{ fontSize: 13 }}>{obs.traitName}</strong>}
                {obs.text && <span style={{ fontSize: 13.5 }}>{obs.text}</span>}
                <MetricRow>
                  {obs.metrics.growthRateMmPerDay != null && (
                    <span>{obs.metrics.growthRateMmPerDay} mm/day</span>
                  )}
                  {obs.metrics.colonizationPercent != null && (
                    <span>{obs.metrics.colonizationPercent}% colonised</span>
                  )}
                  {obs.metrics.vigorScore != null && <span>vigour {obs.metrics.vigorScore}/10</span>}
                </MetricRow>
              </ObsCard>
            ))}
          </Timeline>
        )}
      </Section>

      <Section>
        <SectionTitle>Lineage around this accession</SectionTitle>
        {graph ? (
          <LineageTree
            graph={graph}
            highlightId={accession.id}
            onSelectNode={(id) => navigate(`/genetics/accessions/${id}`)}
          />
        ) : (
          <EmptyState>Loading lineage…</EmptyState>
        )}
      </Section>

      {showObserve && (
        <ObservationModal accession={accession} onClose={() => setShowObserve(false)} />
      )}
      {showSplit && (
        <SplitAccessionModal
          accession={accession}
          onClose={() => setShowSplit(false)}
          onDone={(id) => navigate(`/genetics/accessions/${id}`)}
        />
      )}
      {showPropagate && (
        <PropagateModal
          sourceAccession={accession}
          onClose={() => setShowPropagate(false)}
          onDone={(ids) => ids[0] && navigate(`/genetics/accessions/${ids[0]}`)}
        />
      )}
      {promoting && (
        <PromoteTraitModal
          observation={promoting}
          accessionCode={accession.accessionCode}
          parentLineCode={line?.code}
          onClose={() => setPromoting(null)}
          onDone={(result) => navigate(`/genetics/lines/${result.line.id}`)}
        />
      )}
    </PageWrap>
  );
}
