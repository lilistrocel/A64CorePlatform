/**
 * Genetics Repo - Growing Profile Panel (T-801)
 *
 * Shows the cultivation targets from the library record a line is linked to,
 * so temperature and humidity setpoints sit next to the lineage instead of in
 * a separate module.
 *
 * The split is deliberate and stays: the Strain / Plant library answers "what
 * conditions does this species want", the genetic line answers "which lineage
 * is this and where did it come from". This panel is the join, not a merge.
 */

import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import {
  PROFILE_SOURCE_LABEL,
  profileSourceForKind,
  useLinkedPlantData,
  useLinkedStrain,
} from '../../hooks/genetics/useGrowingProfiles';
import type { GeneticLine } from '../../types/genetics';
import { Card, SectionTitle } from './styled';

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
  white-space: nowrap;
`;

const Dd = styled.dd`
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12.5px;
  line-height: 1.55;
`;

// Secondary emphasis — celeste, never gold (spec §3).
const LinkButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  margin-top: 12px;
  align-self: flex-start;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

const Source = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/** Render a min/max pair as a range, tolerating either bound being absent. */
function range(min?: number | null, max?: number | null, unit = ''): string {
  if (min == null && max == null) return '—';
  if (min != null && max != null) return `${min}–${max}${unit}`;
  return `${min ?? max}${unit}`;
}

interface GrowingProfilePanelProps {
  line: GeneticLine;
}

export function GrowingProfilePanel({ line }: GrowingProfilePanelProps) {
  const navigate = useNavigate();
  const source = profileSourceForKind(line.kind);

  const { data: strain, isLoading: strainLoading } = useLinkedStrain(
    source === 'strain' ? line.linkedStrainId : undefined
  );
  const { data: plant, isLoading: plantLoading } = useLinkedPlantData(
    source === 'plant' ? line.linkedPlantDataId : undefined
  );

  if (!source) return null;

  const linkedId = source === 'strain' ? line.linkedStrainId : line.linkedPlantDataId;

  if (!linkedId) {
    return (
      <Card>
        <SectionTitle>Growing profile</SectionTitle>
        <Muted>
          Not linked to a {PROFILE_SOURCE_LABEL[source]} record. Edit this line to link
          one, and its temperature, humidity and duration targets will show here —
          the library holds the growing conditions, this repo holds the lineage.
        </Muted>
      </Card>
    );
  }

  if (strainLoading || plantLoading) {
    return (
      <Card>
        <SectionTitle>Growing profile</SectionTitle>
        <Muted>Loading…</Muted>
      </Card>
    );
  }

  if (source === 'strain') {
    if (!strain) {
      return (
        <Card>
          <SectionTitle>Growing profile</SectionTitle>
          <Muted>
            Linked strain <code>{linkedId}</code> could not be loaded — it may have been
            removed from the Strain Library.
          </Muted>
        </Card>
      );
    }

    return (
      <Card style={{ display: 'flex', flexDirection: 'column' }}>
        <Head>
          <SectionTitle style={{ margin: 0 }}>Growing profile</SectionTitle>
          <Source>{PROFILE_SOURCE_LABEL.strain}</Source>
        </Head>
        <DefList style={{ marginTop: 12 }}>
          <Dt>Strain</Dt>
          <Dd>{strain.commonName}</Dd>
          <Dt>Difficulty</Dt>
          <Dd>{strain.difficulty ?? '—'}</Dd>
          <Dt>Colonisation</Dt>
          <Dd>
            {range(strain.colonizationTempMin, strain.colonizationTempMax, '°C')}
            {strain.colonizationHumidityMin != null
              ? ` · ${strain.colonizationHumidityMin}%+ RH`
              : ''}
            {strain.colonizationDaysMin != null || strain.colonizationDaysMax != null
              ? ` · ${range(strain.colonizationDaysMin, strain.colonizationDaysMax)} days`
              : ''}
          </Dd>
          <Dt>Fruiting</Dt>
          <Dd>
            {range(strain.fruitingTempMin, strain.fruitingTempMax, '°C')}
            {strain.fruitingHumidityMin != null
              ? ` · ${strain.fruitingHumidityMin}%+ RH`
              : ''}
            {strain.fruitingDaysMin != null || strain.fruitingDaysMax != null
              ? ` · ${range(strain.fruitingDaysMin, strain.fruitingDaysMax)} days`
              : ''}
          </Dd>
          {strain.co2TolerancePpm != null && (
            <>
              <Dt>CO₂ tolerance</Dt>
              <Dd>{strain.co2TolerancePpm} ppm</Dd>
            </>
          )}
          {strain.expectedYieldKgPerKgSubstrate != null && (
            <>
              <Dt>Expected yield</Dt>
              <Dd>{strain.expectedYieldKgPerKgSubstrate} kg/kg substrate</Dd>
            </>
          )}
          {strain.maxFlushes != null && (
            <>
              <Dt>Max flushes</Dt>
              <Dd>{strain.maxFlushes}</Dd>
            </>
          )}
        </DefList>
        <LinkButton type="button" onClick={() => navigate('/mushroom/strains')}>
          Open Strain Library →
        </LinkButton>
      </Card>
    );
  }

  if (!plant) {
    return (
      <Card>
        <SectionTitle>Growing profile</SectionTitle>
        <Muted>
          Linked plant record <code>{linkedId}</code> could not be loaded — it may have
          been removed from the Plant Library.
        </Muted>
      </Card>
    );
  }

  const cycle = plant.growthCycle as any;
  const env = plant.environmentalRequirements as any;

  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      <Head>
        <SectionTitle style={{ margin: 0 }}>Growing profile</SectionTitle>
        <Source>{PROFILE_SOURCE_LABEL.plant}</Source>
      </Head>
      <DefList style={{ marginTop: 12 }}>
        <Dt>Plant</Dt>
        <Dd>{plant.plantName}</Dd>
        {plant.plantType && (
          <>
            <Dt>Type</Dt>
            <Dd>{plant.plantType}</Dd>
          </>
        )}
        {cycle && (
          <>
            <Dt>Growth cycle</Dt>
            <Dd>
              {[cycle.germinationDays, cycle.vegetativeDays, cycle.floweringDays]
                .filter((v) => v != null)
                .reduce((a: number, b: number) => a + b, 0) || '—'}{' '}
              days total
            </Dd>
          </>
        )}
        {env && (
          <>
            <Dt>Temperature</Dt>
            <Dd>{range(env.tempMin, env.tempMax, '°C')}</Dd>
            <Dt>Humidity</Dt>
            <Dd>{range(env.humidityMin, env.humidityMax, '%')}</Dd>
          </>
        )}
      </DefList>
      <LinkButton type="button" onClick={() => navigate('/farm/plants')}>
        Open Plant Library →
      </LinkButton>
    </Card>
  );
}
