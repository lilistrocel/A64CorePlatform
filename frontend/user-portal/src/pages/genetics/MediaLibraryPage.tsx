/**
 * Genetics Repo — Media & Recipes
 *
 * Versioned formulations, the batches poured from them, and the additive
 * readout: pick an additive and see every piece of material that was ever
 * grown on a medium containing it. That readout is the experiment result —
 * it matches against batch snapshots, so an additive since removed from a
 * recipe still returns the material that was actually exposed to it.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { HelpButton } from '../../components/tutorials/HelpButton';
import { BatchFormModal } from '../../components/genetics/BatchFormModal';
import { RecipeFormModal } from '../../components/genetics/RecipeFormModal';
import {
  Banner,
  Button,
  Card,
  CodeChip,
  EmptyState,
  GenerationBadge,
  Grid,
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
  useAccessionsByAdditive,
  useMediumBatches,
  useMediumRecipes,
} from '../../hooks/genetics/useGenetics';
import type { MediumRecipe } from '../../types/genetics';
import {
  BATCH_STATUS_LABELS,
  MEDIUM_TYPE_LABELS,
  STATUS_LABELS,
  VESSEL_LABELS,
} from '../../types/genetics';

const Section = styled.section`
  margin-top: 28px;
`;

const RecipeCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const CardTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const RecipeName = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Version = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.primary[50]};
  color: ${({ theme }) => theme.colors.primary[800]};
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12.5px;
`;

const AdditiveChip = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.colors.warning : theme.colors.neutral[300])};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.warningBg : theme.colors.background};
  color: ${({ $active, theme }) => ($active ? '#92400e' : theme.colors.textSecondary)};

  &:hover {
    border-color: ${({ theme }) => theme.colors.warning};
  }
`;

const ChipRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const CardActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

export function MediaLibraryPage() {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<MediumRecipe | null>(null);
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [batchForRecipe, setBatchForRecipe] = useState<string | undefined>(undefined);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [additive, setAdditive] = useState<string | undefined>(undefined);

  const { data: recipePage, isLoading } = useMediumRecipes({ perPage: 60 });
  const { data: batchPage } = useMediumBatches({ perPage: 40 });
  const { data: readout, isLoading: readoutLoading } = useAccessionsByAdditive(additive);

  const recipes = recipePage?.data ?? [];
  const batches = batchPage?.data ?? [];

  return (
    <PageWrap>
      <PageHeader>
        <div>
          <PageTitle>🧪 Media &amp; Recipes<HelpButton topic="genetics.media" /></PageTitle>
          <PageSubtitle>
            Versioned formulations and the batches poured from them. Additives are tracked
            separately from the base recipe so you can trace what any experiment was actually
            grown on.
          </PageSubtitle>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button $variant="ghost" onClick={() => navigate('/genetics')}>
            ← Genetics Repo
          </Button>
          <Button
            $variant="ghost"
            onClick={() => {
              setBatchForRecipe(undefined);
              setShowBatchForm(true);
            }}
            disabled={recipes.length === 0}
          >
            + Record batch
          </Button>
          <Button onClick={() => setShowRecipeForm(true)}>+ New recipe</Button>
        </div>
      </PageHeader>

      {additive && (
        <Banner $tone="warning">
          Showing everything grown on a medium containing <strong>{additive}</strong>.{' '}
          <button
            type="button"
            onClick={() => setAdditive(undefined)}
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
            Clear
          </button>
        </Banner>
      )}

      {additive && (
        <Section>
          <SectionTitle>
            Exposed material{' '}
            <Muted>({readoutLoading ? '…' : readout?.meta.total ?? 0})</Muted>
          </SectionTitle>
          {readoutLoading && <EmptyState>Loading…</EmptyState>}
          {!readoutLoading && (readout?.accessions.length ?? 0) === 0 && (
            <EmptyState>Nothing has been grown on a medium containing this additive.</EmptyState>
          )}
          {!readoutLoading && (readout?.accessions.length ?? 0) > 0 && (
            <Card style={{ padding: 0 }}>
              <TableScroll>
                <Table>
                  <thead>
                    <tr>
                      <Th>Accession</Th>
                      <Th>Gen</Th>
                      <Th>Form</Th>
                      <Th>Qty</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {readout?.accessions.map((a) => (
                      <Tr
                        key={a.id}
                        $clickable
                        onClick={() => navigate(`/genetics/accessions/${a.id}`)}
                      >
                        <Td>
                          <CodeChip>{a.accessionCode}</CodeChip>
                        </Td>
                        <Td>
                          <GenerationBadge $clone={a.cloneGeneration}>
                            {a.generationLabel}
                          </GenerationBadge>
                        </Td>
                        <Td>{VESSEL_LABELS[a.form]}</Td>
                        <Td>
                          {a.quantity} {a.unit}
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
      )}

      <Section>
        <SectionTitle>Recipes</SectionTitle>
        {isLoading && <EmptyState>Loading…</EmptyState>}
        {!isLoading && recipes.length === 0 && (
          <EmptyState>
            No recipes yet.
            <br />
            Add one — then every batch you pour carries a snapshot of it, so history stays
            truthful even after the formulation changes.
          </EmptyState>
        )}
        {recipes.length > 0 && (
          <Grid $min="330px">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id}>
                <CardTop>
                  <div>
                    <RecipeName>{recipe.name}</RecipeName>
                    <Muted>
                      <CodeChip>{recipe.code}</CodeChip> · {MEDIUM_TYPE_LABELS[recipe.type]}
                    </Muted>
                  </div>
                  <Version>v{recipe.version}</Version>
                </CardTop>

                {recipe.ingredients.length > 0 && (
                  <Muted>
                    {recipe.ingredients
                      .map((i) =>
                        [i.name, i.amount ? `${i.amount}${i.unit ?? ''}` : null]
                          .filter(Boolean)
                          .join(' ')
                      )
                      .join(' · ')}
                  </Muted>
                )}

                {recipe.additives.length > 0 && (
                  <ChipRow>
                    {recipe.additives.map((a) => (
                      <AdditiveChip
                        key={a.name}
                        type="button"
                        $active={additive === a.name}
                        onClick={() => setAdditive(a.name)}
                        title="Show everything grown on a medium containing this"
                      >
                        {a.name}
                        {a.amount ? ` ${a.amount}${a.unit ?? ''}` : ''}
                      </AdditiveChip>
                    ))}
                  </ChipRow>
                )}

                <Muted>
                  {recipe.sterilization.method.replace(/_/g, ' ')}
                  {recipe.sterilization.temperatureC
                    ? ` · ${recipe.sterilization.temperatureC}°C`
                    : ''}
                  {recipe.sterilization.minutes ? ` · ${recipe.sterilization.minutes} min` : ''}
                  {recipe.targetPh ? ` · pH ${recipe.targetPh}` : ''}
                </Muted>

                <CardActions>
                  <Button
                    $variant="ghost"
                    style={{ padding: '5px 12px', fontSize: 13 }}
                    onClick={() => setEditing(recipe)}
                  >
                    Edit
                  </Button>
                  <Button
                    $variant="ghost"
                    style={{ padding: '5px 12px', fontSize: 13 }}
                    onClick={() => {
                      setBatchForRecipe(recipe.id);
                      setShowBatchForm(true);
                    }}
                  >
                    Pour a batch
                  </Button>
                </CardActions>
              </RecipeCard>
            ))}
          </Grid>
        )}
      </Section>

      <Section>
        <Toolbar style={{ marginBottom: 12 }}>
          <SectionTitle style={{ margin: 0 }}>
            Prepared batches <Muted>({batches.length})</Muted>
          </SectionTitle>
        </Toolbar>
        {batches.length === 0 ? (
          <EmptyState>No batches recorded yet.</EmptyState>
        ) : (
          <Card style={{ padding: 0 }}>
            <TableScroll>
              <Table>
                <thead>
                  <tr>
                    <Th>Batch</Th>
                    <Th>Recipe</Th>
                    <Th>Prepared</Th>
                    <Th>Vessels</Th>
                    <Th>Additives</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <Td>
                        <CodeChip>{b.batchCode}</CodeChip>
                      </Td>
                      <Td>
                        {b.recipeName} <Muted>v{b.recipeVersion}</Muted>
                      </Td>
                      <Td>
                        <Muted>{new Date(b.preparedAt).toLocaleDateString()}</Muted>
                      </Td>
                      <Td>
                        {b.vesselCount}
                        {b.vesselType ? ` ${b.vesselType}` : ''}
                      </Td>
                      <Td>
                        {b.additivesSnapshot.length ? (
                          b.additivesSnapshot.map((a) => (
                            <Tag key={a.name} style={{ marginRight: 5 }}>
                              {a.name}
                            </Tag>
                          ))
                        ) : (
                          <Muted>—</Muted>
                        )}
                      </Td>
                      <Td>
                        <Muted>{BATCH_STATUS_LABELS[b.status]}</Muted>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          </Card>
        )}
      </Section>

      {(showRecipeForm || editing) && (
        <RecipeFormModal
          recipe={editing ?? undefined}
          onClose={() => {
            setShowRecipeForm(false);
            setEditing(null);
          }}
        />
      )}
      {showBatchForm && (
        <BatchFormModal
          defaultRecipeId={batchForRecipe}
          onClose={() => setShowBatchForm(false)}
        />
      )}
    </PageWrap>
  );
}
