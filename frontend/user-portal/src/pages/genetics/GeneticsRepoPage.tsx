/**
 * Genetics Repo — Home
 *
 * Lines across every department, with live-material rollups. The repo is shared
 * across vegetable, mushroom and animal divisions, so the kind filter is the
 * primary way to narrow rather than the division you happen to be in.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { MapPin, Plus } from 'lucide-react';
import { PageHeader as SharedPageHeader, glassPanel } from '@a64core/shared';
import { HelpButton } from '../../components/tutorials/HelpButton';
import { EditAccessionModal } from '../../components/genetics/EditAccessionModal';
import { LineFormModal } from '../../components/genetics/LineFormModal';
import { KIND_ICON_COMPONENTS } from '../../components/genetics/kindIcons';
import {
  Banner,
  Button,
  Card,
  CodeChip,
  EmptyState,
  Grid,
  Input,
  KindBadge,
  PageWrap,
  SectionTitle,
  Select,
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
  useGeneticLines,
  useGeneticsDashboard,
} from '../../hooks/genetics/useGenetics';
import type { Accession, GeneticLine, OrganismKind } from '../../types/genetics';
import { KIND_LABELS, SENESCENCE_WATCH_GENERATION, VESSEL_LABELS } from '../../types/genetics';

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 2px;
`;

const StatRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
`;

// Senescence-watch / novel-trait-pending are data cues, not the Harvesting
// phase — bright.terra rather than gold (spec §3).
const Stat = styled.div<{ $tone?: 'warn' }>`
  ${glassPanel}
  padding: 14px 16px;
  ${({ $tone, theme }) =>
    $tone === 'warn' &&
    `
    border-color: ${theme.colors.bright.terra}66;
    background: linear-gradient(155deg, ${theme.colors.bright.terra}22 0%, ${theme.colors.glass.base} 60%);
  `}
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.1;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 3px;
`;

const LineCard = styled(Card)`
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const CardTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const LineName = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const LineCode = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

const Sci = styled.div`
  font-size: 12.5px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Metrics = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Metric = styled.div`
  display: flex;
  flex-direction: column;
`;

const MetricValue = styled.span<{ $warn?: boolean; $hue?: 'terra' | 'coral' }>`
  font-size: 15px;
  font-weight: 700;
  color: ${({ $warn, $hue, theme }) =>
    $warn ? theme.colors.bright[$hue ?? 'terra'] : theme.colors.textPrimary};
`;

const MetricLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TagRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const StartHere = styled.div`
  text-align: left;
  max-width: 640px;
  margin: 0 auto;
`;

const StartTitle = styled.h3`
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StartLead = styled.p`
  margin: 0 0 16px 0;
  font-size: 13.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const StartList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const StartStep = styled.li`
  display: flex;
  gap: 12px;
  align-items: flex-start;
`;

const StepNum = styled.span`
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.bright.lapis};
  color: ${({ theme }) => theme.colors.onDark};
`;

const StepBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StepName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StepWhy = styled.span`
  font-size: 12.5px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const StartActions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 20px;
`;

const SearchInput = styled(Input)`
  max-width: 280px;
`;

const FilterSelect = styled(Select)`
  max-width: 180px;
`;

// ---- Unassigned material — read-only signposting, no bulk assignment -------
// (see EditAccessionModal, which already owns the write path via LocationPicker)

const UnassignedSection = styled.section`
  margin-bottom: 24px;
`;

const UnassignedHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
`;

const UnassignedIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.bright.terra};
`;

const UnassignedHint = styled.span`
  font-size: 12.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12.5px;
`;

export function GeneticsRepoPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingAccession, setEditingAccession] = useState<Accession | null>(null);

  // Set when arriving from a Strain / Plant library card's reverse link, so the
  // repo opens already narrowed to the lineages under that growing profile.
  const linkedStrainId = searchParams.get('linkedStrainId') ?? undefined;
  const linkedPlantDataId = searchParams.get('linkedPlantDataId') ?? undefined;
  const profileFiltered = !!(linkedStrainId || linkedPlantDataId);

  const clearProfileFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('linkedStrainId');
    next.delete('linkedPlantDataId');
    setSearchParams(next, { replace: true });
  };

  const { data: dashboard } = useGeneticsDashboard();
  const { data: linePage, isLoading } = useGeneticLines({
    perPage: 60,
    search: search || undefined,
    kind: kind || undefined,
    linkedStrainId,
    linkedPlantDataId,
  });

  const lines = linePage?.data ?? [];
  const lineById = new Map(lines.map((l) => [l.id, l]));

  // Live material with no `location.roomId` — invisible in every room view
  // (Room Monitor, Facility Manager) because those pages key off roomId to
  // annotate rooms. There is no reliable signal for where this material
  // physically sits, so this is read-only signposting to the existing
  // room-assignment control (EditAccessionModal's LocationPicker), not a
  // migration or a bulk-assignment tool.
  const { data: accessionPage } = useAccessions({ activeOnly: true, perPage: 100 });
  const unassignedAccessions = (accessionPage?.data ?? []).filter(
    (a) => !a.location?.roomId
  );

  const openLine = (line: GeneticLine) => navigate(`/genetics/lines/${line.id}`);

  return (
    <PageWrap>
      <HeaderRow>
        <SharedPageHeader
          breadcrumb="Library"
          title="Genetics Repo"
          emphasizeLastWord
          description="Strains, varieties and bloodlines across every department — with full traceability from the dish in your hand back to where it came from."
        />
        <HeaderActions>
          <HelpButton topic="genetics.repo" />
          <Button $variant="ghost" onClick={() => navigate('/genetics/media')}>
            Media &amp; recipes
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={15} strokeWidth={2} /> New line
          </Button>
        </HeaderActions>
      </HeaderRow>

      {dashboard && (
        <StatRow>
          <Stat>
            <StatValue>{dashboard.totalLines}</StatValue>
            <StatLabel>
              Genetic lines · {dashboard.linesByKind.plant} plant ·{' '}
              {dashboard.linesByKind.fungus} fungus · {dashboard.linesByKind.animal} animal
            </StatLabel>
          </Stat>
          <Stat>
            <StatValue>{dashboard.activeAccessions}</StatValue>
            <StatLabel>Active accessions</StatLabel>
          </Stat>
          <Stat>
            <StatValue>{dashboard.totalVessels}</StatValue>
            <StatLabel>Vessels held</StatLabel>
          </Stat>
          <Stat>
            <StatValue>{dashboard.propagationsLast30Days}</StatValue>
            <StatLabel>Propagations (30d)</StatLabel>
          </Stat>
          {dashboard.senescenceWatchCount > 0 && (
            <Stat $tone="warn">
              <StatValue>{dashboard.senescenceWatchCount}</StatValue>
              <StatLabel>
                At G{SENESCENCE_WATCH_GENERATION}+ — consider re-isolating
              </StatLabel>
            </Stat>
          )}
          {dashboard.novelTraitsPending > 0 && (
            <Stat $tone="warn">
              <StatValue>{dashboard.novelTraitsPending}</StatValue>
              <StatLabel>Novel traits awaiting promotion</StatLabel>
            </Stat>
          )}
        </StatRow>
      )}

      {profileFiltered && (
        <Banner>
          Showing only lines linked to that growing profile.{' '}
          <button
            type="button"
            onClick={clearProfileFilter}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: 0,
              font: 'inherit',
            }}
          >
            Show all lines
          </button>
        </Banner>
      )}

      {unassignedAccessions.length > 0 && (
        <UnassignedSection>
          <UnassignedHeader>
            <UnassignedIcon>
              <MapPin size={16} strokeWidth={2} />
            </UnassignedIcon>
            <SectionTitle style={{ margin: 0 }}>
              Unassigned material <Muted>({unassignedAccessions.length})</Muted>
            </SectionTitle>
            <UnassignedHint>
              — live accessions with no room on file. Assign a room to make them visible on
              the Room Monitor and Facility Manager.
            </UnassignedHint>
          </UnassignedHeader>
          <Card style={{ padding: 0 }}>
            <TableScroll>
              <Table>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Line</Th>
                    <Th>Form</Th>
                    <Th>Qty</Th>
                    <Th>Facility</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {unassignedAccessions.map((a) => {
                    const line = lineById.get(a.lineId);
                    return (
                      <Tr key={a.id}>
                        <Td>
                          <CodeChip>{a.accessionCode}</CodeChip>
                        </Td>
                        <Td>{line ? `${line.commonName} (${line.code})` : <Muted>—</Muted>}</Td>
                        <Td>{VESSEL_LABELS[a.form]}</Td>
                        <Td>
                          {a.quantity} {a.unit}
                        </Td>
                        <Td>{a.location.facility ?? <Muted>—</Muted>}</Td>
                        <Td>
                          <Button
                            type="button"
                            $variant="ghost"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => setEditingAccession(a)}
                          >
                            Assign room
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableScroll>
          </Card>
        </UnassignedSection>
      )}

      <Toolbar>
        <SearchInput
          placeholder="Search name, code or scientific name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterSelect value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {(Object.keys(KIND_LABELS) as OrganismKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>

      {isLoading && <EmptyState>Loading…</EmptyState>}

      {!isLoading && lines.length === 0 && (
        <EmptyState>
          {search || kind ? (
            <>No lines match that filter.</>
          ) : (
            <StartHere>
              <StartTitle>Nothing in the repo yet</StartTitle>
              <StartLead>
                The order matters — each step records what the next one needs.
              </StartLead>
              <StartList>
                <StartStep>
                  <StepNum>1</StepNum>
                  <StepBody>
                    <StepName>Media &amp; recipes</StepName>
                    <StepWhy>
                      Pour a batch <em>first</em>. Material registered before a batch
                      exists has nothing to record as what it grew on, and that cannot
                      be filled in afterwards.
                    </StepWhy>
                  </StepBody>
                </StartStep>
                <StartStep>
                  <StepNum>2</StepNum>
                  <StepBody>
                    <StepName>New line</StepName>
                    <StepWhy>
                      The named identity — “Blue Oyster”. Link its growing profile here
                      to pull temperature and humidity targets across.
                    </StepWhy>
                  </StepBody>
                </StartStep>
                <StartStep>
                  <StepNum>3</StepNum>
                  <StepBody>
                    <StepName>Register material</StepName>
                    <StepWhy>
                      Your founding G0 dishes, placed in a room and on a medium batch.
                    </StepWhy>
                  </StepBody>
                </StartStep>
                <StartStep>
                  <StepNum>4</StepNum>
                  <StepBody>
                    <StepName>Propagate</StepName>
                    <StepWhy>
                      <strong>Clone</strong> for a new generation (G+1), or{' '}
                      <strong>Expansion</strong> to scale up for production (G
                      unchanged). Same button — the method decides which.
                    </StepWhy>
                  </StepBody>
                </StartStep>
              </StartList>
              <StartActions>
                <Button $variant="ghost" onClick={() => navigate('/genetics/media')}>
                  Start with media &amp; recipes
                </Button>
                <Button onClick={() => setShowCreate(true)}>
                  <Plus size={15} strokeWidth={2} /> New line
                </Button>
              </StartActions>
            </StartHere>
          )}
        </EmptyState>
      )}

      {!isLoading && lines.length > 0 && (
        <Grid $min="320px">
          {lines.map((line) => {
            const stats = line.stats;
            const deepClone = (stats?.maxCloneGeneration ?? 0) >= SENESCENCE_WATCH_GENERATION;
            return (
              <LineCard key={line.id} onClick={() => openLine(line)}>
                <CardTop>
                  <div>
                    <LineName>{line.commonName}</LineName>
                    <LineCode>{line.code}</LineCode>
                    {line.scientificName && <Sci>{line.scientificName}</Sci>}
                  </div>
                  <KindBadge $kind={line.kind}>
                    {(() => {
                      const KindIcon = KIND_ICON_COMPONENTS[line.kind];
                      return <KindIcon size={12} strokeWidth={1.8} />;
                    })()}
                    {KIND_LABELS[line.kind]}
                  </KindBadge>
                </CardTop>

                {line.tags.length > 0 && (
                  <TagRow>
                    {line.tags.slice(0, 4).map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </TagRow>
                )}

                <Metrics>
                  <Metric>
                    <MetricValue>{stats?.activeAccessions ?? 0}</MetricValue>
                    <MetricLabel>active</MetricLabel>
                  </Metric>
                  <Metric>
                    <MetricValue $warn={deepClone}>
                      {stats?.maxFilialGeneration
                        ? `F${stats.maxFilialGeneration}-G${stats.maxCloneGeneration}`
                        : `G${stats?.maxCloneGeneration ?? 0}`}
                    </MetricValue>
                    <MetricLabel>deepest</MetricLabel>
                  </Metric>
                  {(stats?.contaminatedAccessions ?? 0) > 0 && (
                    <Metric>
                      <MetricValue $warn $hue="coral">{stats?.contaminatedAccessions}</MetricValue>
                      <MetricLabel>contaminated</MetricLabel>
                    </Metric>
                  )}
                  {(stats?.childLineCount ?? 0) > 0 && (
                    <Metric>
                      <MetricValue>{stats?.childLineCount}</MetricValue>
                      <MetricLabel>derived lines</MetricLabel>
                    </Metric>
                  )}
                </Metrics>
              </LineCard>
            );
          })}
        </Grid>
      )}

      {dashboard && dashboard.totalLines === 0 && !isLoading && (
        <Banner style={{ marginTop: 20 }}>
          Tip: a line is the identity (“Blue Oyster”), an accession is the physical material
          (“the four plates in incubator 2”). Clones and crosses are recorded as propagations
          between them, which is what builds the lineage tree.
        </Banner>
      )}

      {showCreate && (
        <LineFormModal
          onClose={() => setShowCreate(false)}
          onDone={(line) => navigate(`/genetics/lines/${line.id}`)}
        />
      )}

      {editingAccession && (
        <EditAccessionModal
          accession={editingAccession}
          onClose={() => setEditingAccession(null)}
        />
      )}
    </PageWrap>
  );
}

