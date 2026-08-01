/**
 * Genetics Repo — Line Detail
 *
 * The lineage tree is the hero: every accession on this line, laid out by
 * generation, with the propagation edges that connect them. The accession
 * table below is the working list.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { AmendPropagationModal } from '../../components/genetics/AmendPropagationModal';
import { GrowingProfilePanel } from '../../components/genetics/GrowingProfilePanel';
import { KIND_ICON_COMPONENTS } from '../../components/genetics/kindIcons';
import { LineYieldPanel } from '../../components/genetics/LineYieldPanel';
import { LineageTree } from '../../components/genetics/LineageTree';
import { LineFormModal } from '../../components/genetics/LineFormModal';
import { canDeleteLines, canEditGenetics } from '../../components/genetics/permissions';
import { PrintLabelsModal } from '../../components/genetics/PrintLabelsModal';
import { PropagateModal } from '../../components/genetics/PropagateModal';
import { RegisterAccessionModal } from '../../components/genetics/RegisterAccessionModal';
import { RemoveLineModal } from '../../components/genetics/RemoveLineModal';
import {
  Banner,
  Button,
  Card,
  CodeChip,
  EmptyState,
  GenerationBadge,
  KindBadge,
  PageHeader,
  PageSubtitle,
  PageTitle,
  PageWrap,
  SectionTitle,
  StatusBadge,
  Table,
  TableScroll,
  Tag,
  Td,
  Th,
  Toolbar,
  Tr,
} from '../../components/genetics/styled';
import {
  useAccessions,
  useGeneticLine,
  useLineageGraph,
  useMediumBatches,
  usePropagations,
} from '../../hooks/genetics/useGenetics';
import { useAuthStore } from '../../stores/auth.store';
import type { Accession, PropagationEvent } from '../../types/genetics';
import {
  DERIVATION_LABELS,
  KIND_LABELS,
  METHOD_LABELS,
  PROVENANCE_LABELS,
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
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  margin-bottom: 8px;

  &:hover {
    text-decoration: underline;
  }
`;

const Meta = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 8px;
`;

const Section = styled.section`
  margin-top: 28px;
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Sci = styled.span`
  font-style: italic;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

const EventList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const EventRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 12.5px;
`;

export function LineDetailPage() {
  const { lineId } = useParams<{ lineId: string }>();
  const navigate = useNavigate();

  const { user } = useAuthStore();

  const [showEdit, setShowEdit] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showPropagate, setShowPropagate] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [amendingEvent, setAmendingEvent] = useState<PropagationEvent | null>(null);
  const [justPropagated, setJustPropagated] = useState<Accession[] | null>(null);

  const { data: line, isLoading } = useGeneticLine(lineId);
  const { data: accessionPage } = useAccessions({ lineId, perPage: 100 });
  const { data: graph } = useLineageGraph({ lineId });
  const { data: eventPage } = usePropagations({ lineId, perPage: 10 });
  const { data: batchPage } = useMediumBatches({ perPage: 100 });

  const accessions = accessionPage?.data ?? [];
  const events = eventPage?.data ?? [];
  const batchCodes = new Map((batchPage?.data ?? []).map((b) => [b.id, b.batchCode]));

  if (isLoading) {
    return (
      <PageWrap>
        <EmptyState>Loading…</EmptyState>
      </PageWrap>
    );
  }

  if (!line) {
    return (
      <PageWrap>
        <EmptyState>Line not found.</EmptyState>
      </PageWrap>
    );
  }

  const stats = line.stats;
  const deepClone = (stats?.maxCloneGeneration ?? 0) >= SENESCENCE_WATCH_GENERATION;

  return (
    <PageWrap>
      <PageHeader>
        <div>
          <BackLink onClick={() => navigate('/genetics')}>← Genetics Repo</BackLink>
          <PageTitle>
            {line.commonName} <CodeChip>{line.code}</CodeChip>
          </PageTitle>
          {line.scientificName && <Sci>{line.scientificName}</Sci>}
          {line.description && <PageSubtitle>{line.description}</PageSubtitle>}
          <Meta>
            <KindBadge $kind={line.kind}>
              {(() => {
                const KindIcon = KIND_ICON_COMPONENTS[line.kind];
                return <KindIcon size={12} strokeWidth={1.8} />;
              })()}
              {KIND_LABELS[line.kind]}
            </KindBadge>
            {line.derivation !== 'original' && (
              <Tag>{DERIVATION_LABELS[line.derivation]}</Tag>
            )}
            <Tag>Origin: {PROVENANCE_LABELS[line.provenance.type]}</Tag>
            {line.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </Meta>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button $variant="ghost" onClick={() => setShowEdit(true)}>
            Edit
          </Button>
          <Button $variant="ghost" onClick={() => setShowRegister(true)}>
            Register material
          </Button>
          <Button onClick={() => setShowPropagate(true)} disabled={accessions.length === 0}>
            Propagate
          </Button>
          {canDeleteLines(user?.role) && (
            <Button $variant="danger" onClick={() => setShowRemove(true)}>
              Remove line
            </Button>
          )}
        </div>
      </PageHeader>

      {!line.isActive && (
        <Banner $tone="warning">
          This line is <strong>deactivated</strong> — kept for its history, hidden from
          active-only views. Nothing was deleted.
        </Banner>
      )}

      {line.provenance.sourceNote && (
        <Banner>
          <strong>Provenance:</strong> {line.provenance.sourceNote}
        </Banner>
      )}

      {deepClone && (
        <Banner $tone="warning">
          This line has reached <strong>G{stats?.maxCloneGeneration}</strong>. Serially
          transferred cultures tend to lose vigour past G{SENESCENCE_WATCH_GENERATION} — worth
          re-isolating from a spore print or a stored early generation.
        </Banner>
      )}

      {line.parentLineId && (
        <Banner>
          Derived from another line —{' '}
          <BackLink onClick={() => navigate(`/genetics/lines/${line.parentLineId}`)}>
            open parent line →
          </BackLink>
        </Banner>
      )}

      <Section>
        <Columns>
          <GrowingProfilePanel line={line} />
          <LineYieldPanel lineId={line.id} lineCode={line.code} />
        </Columns>
      </Section>

      <Section>
        <SectionTitle>Lineage</SectionTitle>
        {graph ? (
          <LineageTree
            graph={graph}
            onSelectNode={(id) => navigate(`/genetics/accessions/${id}`)}
          />
        ) : (
          <EmptyState>Loading lineage…</EmptyState>
        )}
      </Section>

      <Section>
        <Toolbar style={{ marginBottom: 12, justifyContent: 'space-between' }}>
          <SectionTitle style={{ margin: 0 }}>
            Accessions <Muted>({accessions.length})</Muted>
          </SectionTitle>
        </Toolbar>

        {accessions.length === 0 ? (
          <EmptyState>
            No material registered on this line yet.
            <br />
            Use <strong>Register material</strong> to add your founding G0.
          </EmptyState>
        ) : (
          <Card style={{ padding: 0 }}>
            <TableScroll>
              <Table>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Gen</Th>
                    <Th>Form</Th>
                    <Th>Qty</Th>
                    <Th>Medium</Th>
                    <Th>Location</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {accessions.map((a) => (
                    <Tr
                      key={a.id}
                      $clickable
                      onClick={() => navigate(`/genetics/accessions/${a.id}`)}
                    >
                      <Td>
                        <CodeChip>{a.accessionCode}</CodeChip>
                      </Td>
                      <Td>
                        <GenerationBadge $clone={a.cloneGeneration} $filial={a.filialGeneration}>
                          {a.generationLabel}
                        </GenerationBadge>
                      </Td>
                      <Td>{VESSEL_LABELS[a.form]}</Td>
                      <Td>
                        {a.quantity} {a.unit}
                      </Td>
                      <Td>
                        {a.mediumBatchId && batchCodes.get(a.mediumBatchId) ? (
                          <CodeChip>{batchCodes.get(a.mediumBatchId)}</CodeChip>
                        ) : (
                          <Muted>—</Muted>
                        )}
                      </Td>
                      <Td>
                        <Muted>
                          {[a.location?.unit, a.location?.position].filter(Boolean).join(' / ') ||
                            '—'}
                        </Muted>
                      </Td>
                      <Td>
                        <StatusBadge $status={a.status}>{STATUS_LABELS[a.status]}</StatusBadge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          </Card>
        )}
      </Section>

      {events.length > 0 && (
        <Section>
          <SectionTitle>Recent propagations</SectionTitle>
          <EventList>
            {events.map((e) => (
              <EventRow key={e.id}>
                <strong>{METHOD_LABELS[e.method]}</strong>
                <Muted>
                  {new Date(e.performedAt).toLocaleDateString()} · {e.vesselCount} vessel(s)
                  {e.operatorName ? ` · ${e.operatorName}` : ''}
                </Muted>
                {canEditGenetics(user?.role) && (
                  <Button
                    type="button"
                    $variant="ghost"
                    style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 12 }}
                    onClick={() => setAmendingEvent(e)}
                    aria-label="Correct performed-on date"
                  >
                    Correct date
                  </Button>
                )}
              </EventRow>
            ))}
          </EventList>
        </Section>
      )}

      {showEdit && <LineFormModal line={line} onClose={() => setShowEdit(false)} />}
      {showRegister && (
        <RegisterAccessionModal
          lineId={line.id}
          lineCode={line.code}
          onClose={() => setShowRegister(false)}
        />
      )}
      {showPropagate && (
        <PropagateModal
          lineId={line.id}
          sourceAccession={accessions.find((a) => a.status === 'active') ?? accessions[0]}
          onClose={() => setShowPropagate(false)}
          onDone={(created) => setJustPropagated(created.length > 0 ? created : null)}
        />
      )}
      {showRemove && (
        <RemoveLineModal
          line={line}
          onClose={() => setShowRemove(false)}
          onPurged={() => navigate('/genetics')}
        />
      )}
      {amendingEvent && (
        <AmendPropagationModal event={amendingEvent} onClose={() => setAmendingEvent(null)} />
      )}
      {justPropagated?.length === 1 && (
        <PrintLabelsModal
          accession={justPropagated[0]}
          onClose={() => setJustPropagated(null)}
        />
      )}
      {justPropagated && justPropagated.length > 1 && (
        <Banner $tone="info" style={{ marginTop: 16 }}>
          Created: {justPropagated.map((a) => a.accessionCode).join(', ')}. Open each from the
          accessions table above to print its labels.{' '}
          <BackLink onClick={() => setJustPropagated(null)}>Dismiss</BackLink>
        </Banner>
      )}
    </PageWrap>
  );
}
