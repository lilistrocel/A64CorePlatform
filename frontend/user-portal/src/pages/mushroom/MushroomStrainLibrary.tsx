/**
 * MushroomStrainLibrary
 *
 * Strain library page with:
 * - Grid of strain cards
 * - Search/filter by difficulty
 * - Create/edit strain modal
 */

import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { useMushroomStrains, useCreateStrain, useUpdateStrain } from '../../hooks/mushroom/useMushroomStrains';
import { StrainCard } from '../../components/mushroom/StrainCard';
import type {
  MushroomStrain,
  MushroomDifficulty,
  CreateStrainPayload,
} from '../../types/mushroom';
import { DIFFICULTY_LABELS } from '../../types/mushroom';

// ============================================================================
// FORM STATE
// ============================================================================

interface StrainFormState {
  commonName: string;
  scientificName: string;
  species: string;
  difficulty: MushroomDifficulty;
  expectedYieldKgPerKgSubstrate: string;
  maxFlushes: string;
  colonizationTempMin: string;
  colonizationTempMax: string;
  fruitingTempMin: string;
  fruitingTempMax: string;
  colonizationHumidityMin: string;
  fruitingHumidityMin: string;
  co2TolerancePpm: string;
  colonizationDaysMin: string;
  colonizationDaysMax: string;
  fruitingDaysMin: string;
  fruitingDaysMax: string;
  description: string;
  notes: string;
}

const defaultForm: StrainFormState = {
  commonName: '',
  scientificName: '',
  species: '',
  difficulty: 'intermediate',
  expectedYieldKgPerKgSubstrate: '',
  maxFlushes: '',
  colonizationTempMin: '',
  colonizationTempMax: '',
  fruitingTempMin: '',
  fruitingTempMax: '',
  colonizationHumidityMin: '',
  fruitingHumidityMin: '',
  co2TolerancePpm: '',
  colonizationDaysMin: '',
  colonizationDaysMax: '',
  fruitingDaysMin: '',
  fruitingDaysMax: '',
  description: '',
  notes: '',
};

function strainToForm(strain: MushroomStrain): StrainFormState {
  return {
    commonName: strain.commonName,
    scientificName: strain.scientificName ?? '',
    species: strain.species,
    difficulty: strain.difficulty,
    expectedYieldKgPerKgSubstrate: strain.expectedYieldKgPerKgSubstrate != null
      ? String(strain.expectedYieldKgPerKgSubstrate)
      : '',
    maxFlushes: strain.maxFlushes != null ? String(strain.maxFlushes) : '',
    colonizationTempMin: strain.colonizationTempMin != null ? String(strain.colonizationTempMin) : '',
    colonizationTempMax: strain.colonizationTempMax != null ? String(strain.colonizationTempMax) : '',
    fruitingTempMin: strain.fruitingTempMin != null ? String(strain.fruitingTempMin) : '',
    fruitingTempMax: strain.fruitingTempMax != null ? String(strain.fruitingTempMax) : '',
    colonizationHumidityMin: strain.colonizationHumidityMin != null ? String(strain.colonizationHumidityMin) : '',
    fruitingHumidityMin: strain.fruitingHumidityMin != null ? String(strain.fruitingHumidityMin) : '',
    co2TolerancePpm: strain.co2TolerancePpm != null ? String(strain.co2TolerancePpm) : '',
    colonizationDaysMin: strain.colonizationDaysMin != null ? String(strain.colonizationDaysMin) : '',
    colonizationDaysMax: strain.colonizationDaysMax != null ? String(strain.colonizationDaysMax) : '',
    fruitingDaysMin: strain.fruitingDaysMin != null ? String(strain.fruitingDaysMin) : '',
    fruitingDaysMax: strain.fruitingDaysMax != null ? String(strain.fruitingDaysMax) : '',
    description: strain.description ?? '',
    notes: strain.notes ?? '',
  };
}

function formToPayload(form: StrainFormState): CreateStrainPayload {
  const num = (val: string) => {
    const n = parseFloat(val);
    return isNaN(n) ? undefined : n;
  };
  const int = (val: string) => {
    const n = parseInt(val, 10);
    return isNaN(n) ? undefined : n;
  };

  return {
    commonName: form.commonName.trim(),
    scientificName: form.scientificName.trim() || undefined,
    species: form.species.trim(),
    difficulty: form.difficulty,
    expectedYieldKgPerKgSubstrate: num(form.expectedYieldKgPerKgSubstrate),
    maxFlushes: int(form.maxFlushes),
    colonizationTempMin: num(form.colonizationTempMin),
    colonizationTempMax: num(form.colonizationTempMax),
    fruitingTempMin: num(form.fruitingTempMin),
    fruitingTempMax: num(form.fruitingTempMax),
    colonizationHumidityMin: num(form.colonizationHumidityMin),
    fruitingHumidityMin: num(form.fruitingHumidityMin),
    co2TolerancePpm: int(form.co2TolerancePpm),
    colonizationDaysMin: int(form.colonizationDaysMin),
    colonizationDaysMax: int(form.colonizationDaysMax),
    fruitingDaysMin: int(form.fruitingDaysMin),
    fruitingDaysMax: int(form.fruitingDaysMax),
    description: form.description.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function MushroomStrainLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<MushroomDifficulty | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editingStrain, setEditingStrain] = useState<MushroomStrain | null>(null);
  const [form, setForm] = useState<StrainFormState>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: strains = [], isLoading } = useMushroomStrains();
  const createStrain = useCreateStrain();
  const updateStrain = useUpdateStrain(editingStrain?.id ?? '');

  const filteredStrains = useMemo(() => {
    let result = strains;
    if (difficultyFilter) {
      result = result.filter((s) => s.difficulty === difficultyFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.commonName.toLowerCase().includes(q) ||
          s.species.toLowerCase().includes(q) ||
          (s.scientificName?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [strains, difficultyFilter, searchQuery]);

  const openCreate = () => {
    setEditingStrain(null);
    setForm(defaultForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (strain: MushroomStrain) => {
    setEditingStrain(strain);
    setForm(strainToForm(strain));
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!form.commonName.trim()) {
      setFormError('Common name is required.');
      return;
    }
    if (!form.species.trim()) {
      setFormError('Species is required.');
      return;
    }

    const payload = formToPayload(form);

    try {
      if (editingStrain) {
        await updateStrain.mutateAsync(payload);
      } else {
        await createStrain.mutateAsync(payload);
      }
      setShowModal(false);
    } catch {
      // Error handled by global interceptor
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingStrain(null);
    setForm(defaultForm);
    setFormError(null);
  };

  const setField = (field: keyof StrainFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isBusy = createStrain.isPending || updateStrain.isPending;

  return (
    <Container>
      {/* Header */}
      <PageHeader>
        <TitleSection>
          <PageTitle>Strain Library</PageTitle>
          <PageSubtitle>
            Manage your mushroom strain catalogue with growing parameters
          </PageSubtitle>
        </TitleSection>
        <AddStrainBtn onClick={openCreate}>+ New Strain</AddStrainBtn>
      </PageHeader>

      {/* Filters */}
      <FiltersRow>
        <SearchInput
          type="search"
          placeholder="Search strains..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search strains by name or species"
        />

        <FilterGroup>
          <FilterLabel htmlFor="difficulty-filter">Difficulty</FilterLabel>
          <FilterSelect
            id="difficulty-filter"
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as MushroomDifficulty | '')}
          >
            <option value="">All Levels</option>
            {(Object.entries(DIFFICULTY_LABELS) as [MushroomDifficulty, string][]).map(
              ([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              )
            )}
          </FilterSelect>
        </FilterGroup>

        <ResultsCount>
          {filteredStrains.length} strain{filteredStrains.length !== 1 ? 's' : ''}
        </ResultsCount>
      </FiltersRow>

      {/* Loading */}
      {isLoading && (
        <LoadingContainer>
          <Spinner />
          <LoadingText>Loading strains...</LoadingText>
        </LoadingContainer>
      )}

      {/* Empty state */}
      {!isLoading && strains.length === 0 && (
        <EmptyState>
          <EmptyIcon>🍄</EmptyIcon>
          <EmptyTitle>No Strains in Library</EmptyTitle>
          <EmptyText>
            Add your first mushroom strain to start tracking grow parameters.
          </EmptyText>
          <AddStrainBtn onClick={openCreate}>+ Add First Strain</AddStrainBtn>
        </EmptyState>
      )}

      {/* No results */}
      {!isLoading && strains.length > 0 && filteredStrains.length === 0 && (
        <EmptyState>
          <EmptyIcon>🔍</EmptyIcon>
          <EmptyTitle>No Strains Found</EmptyTitle>
          <EmptyText>No strains match your current filters.</EmptyText>
        </EmptyState>
      )}

      {/* Strain Cards Grid */}
      {!isLoading && filteredStrains.length > 0 && (
        <StrainsGrid>
          {filteredStrains.map((strain) => (
            <StrainCard
              key={strain.id}
              strain={strain}
              onClick={openEdit}
            />
          ))}
        </StrainsGrid>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Backdrop role="dialog" aria-modal="true" aria-labelledby="strain-modal-title">
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle id="strain-modal-title">
                {editingStrain ? `Edit: ${editingStrain.commonName}` : 'New Strain'}
              </ModalTitle>
              <CloseModalBtn onClick={handleClose} aria-label="Close strain form">
                &#10005;
              </CloseModalBtn>
            </ModalHeader>

            <Form onSubmit={handleSubmit} noValidate>
              {/* Basic Info */}
              <FormSection>
                <FormSectionTitle>Basic Information</FormSectionTitle>
                <TwoColForm>
                  <FormGroup>
                    <Label htmlFor="s-common">Common Name <Required>*</Required></Label>
                    <Input
                      id="s-common"
                      type="text"
                      value={form.commonName}
                      onChange={(e) => setField('commonName', e.target.value)}
                      placeholder="e.g. Oyster Mushroom"
                      required
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label htmlFor="s-sci">Scientific Name</Label>
                    <Input
                      id="s-sci"
                      type="text"
                      value={form.scientificName}
                      onChange={(e) => setField('scientificName', e.target.value)}
                      placeholder="e.g. Pleurotus ostreatus"
                    />
                  </FormGroup>
                </TwoColForm>

                <TwoColForm>
                  <FormGroup>
                    <Label htmlFor="s-species">Species <Required>*</Required></Label>
                    <Input
                      id="s-species"
                      type="text"
                      value={form.species}
                      onChange={(e) => setField('species', e.target.value)}
                      placeholder="e.g. Pleurotus"
                      required
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label htmlFor="s-difficulty">Difficulty</Label>
                    <SelectField
                      id="s-difficulty"
                      value={form.difficulty}
                      onChange={(e) => setField('difficulty', e.target.value)}
                    >
                      {(Object.entries(DIFFICULTY_LABELS) as [MushroomDifficulty, string][]).map(
                        ([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        )
                      )}
                    </SelectField>
                  </FormGroup>
                </TwoColForm>

                <TwoColForm>
                  <FormGroup>
                    <Label htmlFor="s-yield">
                      Expected Yield (kg/kg substrate)
                    </Label>
                    <Input
                      id="s-yield"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.expectedYieldKgPerKgSubstrate}
                      onChange={(e) =>
                        setField('expectedYieldKgPerKgSubstrate', e.target.value)
                      }
                      placeholder="e.g. 0.75"
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label htmlFor="s-maxflush">Max Flushes</Label>
                    <Input
                      id="s-maxflush"
                      type="number"
                      min={1}
                      value={form.maxFlushes}
                      onChange={(e) => setField('maxFlushes', e.target.value)}
                      placeholder="e.g. 4"
                    />
                  </FormGroup>
                </TwoColForm>
              </FormSection>

              {/* Growing Conditions */}
              <FormSection>
                <FormSectionTitle>Growing Conditions</FormSectionTitle>

                <TwoColForm>
                  <FormGroup>
                    <Label>Colonization Temp (°C)</Label>
                    <TwoInputRow>
                      <Input
                        type="number"
                        value={form.colonizationTempMin}
                        onChange={(e) => setField('colonizationTempMin', e.target.value)}
                        placeholder="Min"
                      />
                      <RangeSep>–</RangeSep>
                      <Input
                        type="number"
                        value={form.colonizationTempMax}
                        onChange={(e) => setField('colonizationTempMax', e.target.value)}
                        placeholder="Max"
                      />
                    </TwoInputRow>
                  </FormGroup>
                  <FormGroup>
                    <Label>Fruiting Temp (°C)</Label>
                    <TwoInputRow>
                      <Input
                        type="number"
                        value={form.fruitingTempMin}
                        onChange={(e) => setField('fruitingTempMin', e.target.value)}
                        placeholder="Min"
                      />
                      <RangeSep>–</RangeSep>
                      <Input
                        type="number"
                        value={form.fruitingTempMax}
                        onChange={(e) => setField('fruitingTempMax', e.target.value)}
                        placeholder="Max"
                      />
                    </TwoInputRow>
                  </FormGroup>
                </TwoColForm>

                <TwoColForm>
                  <FormGroup>
                    <Label>Colonization Days</Label>
                    <TwoInputRow>
                      <Input
                        type="number"
                        value={form.colonizationDaysMin}
                        onChange={(e) => setField('colonizationDaysMin', e.target.value)}
                        placeholder="Min"
                      />
                      <RangeSep>–</RangeSep>
                      <Input
                        type="number"
                        value={form.colonizationDaysMax}
                        onChange={(e) => setField('colonizationDaysMax', e.target.value)}
                        placeholder="Max"
                      />
                    </TwoInputRow>
                  </FormGroup>
                  <FormGroup>
                    <Label>Fruiting Days</Label>
                    <TwoInputRow>
                      <Input
                        type="number"
                        value={form.fruitingDaysMin}
                        onChange={(e) => setField('fruitingDaysMin', e.target.value)}
                        placeholder="Min"
                      />
                      <RangeSep>–</RangeSep>
                      <Input
                        type="number"
                        value={form.fruitingDaysMax}
                        onChange={(e) => setField('fruitingDaysMax', e.target.value)}
                        placeholder="Max"
                      />
                    </TwoInputRow>
                  </FormGroup>
                </TwoColForm>

                <TwoColForm>
                  <FormGroup>
                    <Label htmlFor="s-humcol">
                      Min Colonization Humidity (%)
                    </Label>
                    <Input
                      id="s-humcol"
                      type="number"
                      min={0}
                      max={100}
                      value={form.colonizationHumidityMin}
                      onChange={(e) => setField('colonizationHumidityMin', e.target.value)}
                      placeholder="e.g. 85"
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label htmlFor="s-humfru">
                      Min Fruiting Humidity (%)
                    </Label>
                    <Input
                      id="s-humfru"
                      type="number"
                      min={0}
                      max={100}
                      value={form.fruitingHumidityMin}
                      onChange={(e) => setField('fruitingHumidityMin', e.target.value)}
                      placeholder="e.g. 90"
                    />
                  </FormGroup>
                </TwoColForm>

                <FormGroup>
                  <Label htmlFor="s-co2">CO2 Tolerance (ppm)</Label>
                  <Input
                    id="s-co2"
                    type="number"
                    min={0}
                    value={form.co2TolerancePpm}
                    onChange={(e) => setField('co2TolerancePpm', e.target.value)}
                    placeholder="e.g. 1000"
                    style={{ maxWidth: '200px' }}
                  />
                </FormGroup>
              </FormSection>

              {/* Notes */}
              <FormSection>
                <FormSectionTitle>Notes</FormSectionTitle>
                <FormGroup>
                  <Label htmlFor="s-desc">Description</Label>
                  <TextArea
                    id="s-desc"
                    rows={2}
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    placeholder="Strain description..."
                  />
                </FormGroup>
                <FormGroup>
                  <Label htmlFor="s-notes">Growing Notes</Label>
                  <TextArea
                    id="s-notes"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    placeholder="Tips, tricks, observations..."
                  />
                </FormGroup>
              </FormSection>

              {formError && <FormError role="alert">{formError}</FormError>}

              <FormActions>
                <CancelBtn type="button" onClick={handleClose}>
                  Cancel
                </CancelBtn>
                <SubmitBtn type="submit" disabled={isBusy}>
                  {isBusy
                    ? editingStrain
                      ? 'Saving...'
                      : 'Creating...'
                    : editingStrain
                    ? 'Save Changes'
                    : 'Create Strain'}
                </SubmitBtn>
              </FormActions>
            </Form>
          </ModalBox>
        </Backdrop>
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 24px;
  max-width: 100%;
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.surface};
`;

const PageHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 16px;
  flex-wrap: wrap;
`;

const TitleSection = styled.div``;

const PageTitle = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const PageSubtitle = styled.p`
  font-size: 14px;
  color: #757575;
  margin: 0;
`;

const AddStrainBtn = styled.button`
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  background: #8B5CF6;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms;
  white-space: nowrap;

  &:hover {
    background: #7C3AED;
  }
  &:focus-visible {
    outline: 2px solid #8B5CF6;
    outline-offset: 2px;
  }
`;

const FiltersRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 14px;
  margin-bottom: 20px;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  padding: 9px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  outline: none;
  min-width: 240px;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }

  &::placeholder {
    color: #bdbdbd;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const FilterLabel = styled.label`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const FilterSelect = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  cursor: pointer;
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const ResultsCount = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textDisabled};
  align-self: flex-end;
  padding-bottom: 10px;
`;

const StrainsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 12px;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: #8B5CF6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
  max-width: 480px;
  margin: 48px auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`;

const EmptyIcon = styled.div`
  font-size: 56px;
  opacity: 0.6;
`;

const EmptyTitle = styled.h3`
  font-size: 22px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const EmptyText = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

// Modal styles
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1100;
  padding: 20px;
  overflow-y: auto;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 640px;
  padding: 24px;
  margin: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const ModalTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseModalBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FormSectionTitle = styled.h3`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
  padding-bottom: 6px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const TwoColForm = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;

  @media (max-width: 500px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Required = styled.span`
  color: #ef5350;
  margin-left: 2px;
`;

const Input = styled.input`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  outline: none;
  transition: border-color 150ms;
  width: 100%;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const TwoInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const RangeSep = styled.span`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textDisabled};
  flex-shrink: 0;
`;

const SelectField = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  cursor: pointer;
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const TextArea = styled.textarea`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 150ms;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const FormError = styled.div`
  font-size: 13px;
  color: #ef5350;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
`;

const FormActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 4px;
`;

const CancelBtn = styled.button`
  padding: 10px 20px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
  }
`;

const SubmitBtn = styled.button`
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #8B5CF6;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms;

  &:hover:not(:disabled) {
    background: #7C3AED;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid #8B5CF6;
    outline-offset: 2px;
  }
`;
