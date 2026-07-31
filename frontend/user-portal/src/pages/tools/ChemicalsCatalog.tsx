/**
 * ChemicalsCatalog Page
 *
 * Full CRUD management for the fertilizer chemicals master list.
 * Supports add, edit, archive (with 409 dependent-list modal), search, and
 * toggling archived visibility.
 *
 * Path: /tools/chemicals
 */

import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { AxiosError } from 'axios';
import { Plus, X } from 'lucide-react';
import { PageHeader as SharedPageHeader, glassPanel, phaseBadge } from '@a64core/shared';
import {
  useChemicals,
  useCreateChemical,
  useUpdateChemical,
  useArchiveChemical,
  useDiscoverChemicals,
} from '../../hooks/queries/useTools';
import { useAuthStore } from '../../stores/auth.store';
import type {
  FertilizerChemical,
  CreateChemicalRequest,
  ChemicalDependentsError,
} from '../../types/tools';

// ─── Modal: Add / Edit Chemical ──────────────────────────────────────────────

interface ChemicalFormModalProps {
  initial?: FertilizerChemical;
  onClose: () => void;
  onSave: (data: CreateChemicalRequest) => void;
  isSaving: boolean;
}

function ChemicalFormModal({ initial, onClose, onSave, isSaving }: ChemicalFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [aliasInput, setAliasInput] = useState('');
  const [aliases, setAliases] = useState<string[]>(initial?.aliases ?? []);
  const [category, setCategory] = useState(initial?.category ?? '');
  const [defaultUnit, setDefaultUnit] = useState<'kg' | 'L'>(initial?.defaultUnit ?? 'kg');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');

  const addAlias = () => {
    const trimmed = aliasInput.trim();
    if (!trimmed || aliases.includes(trimmed)) return;
    setAliases((prev) => [...prev, trimmed]);
    setAliasInput('');
  };

  const removeAlias = (alias: string) => {
    setAliases((prev) => prev.filter((a) => a !== alias));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!category.trim()) { setError('Category is required.'); return; }
    setError('');
    onSave({ name: name.trim(), aliases, category: category.trim(), defaultUnit, notes: notes.trim() || undefined });
  };

  return (
    <Backdrop>
      <ModalBox role="dialog" aria-modal="true" aria-label={initial ? 'Edit chemical' : 'Add chemical'}>
        <ModalHeader>
          <ModalTitle>{initial ? 'Edit Chemical' : 'Add Chemical'}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close modal" type="button"><X size={16} strokeWidth={1.8} /></CloseButton>
        </ModalHeader>

        <form onSubmit={handleSubmit}>
          <ModalBody>
            <Field>
              <Label htmlFor="chem-name">Name *</Label>
              <Input
                id="chem-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Calcium Nitrate"
                autoFocus
              />
            </Field>

            <Field>
              <Label>Aliases</Label>
              <AliasRow>
                <Input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); }}}
                  placeholder="Type an alias and press Enter"
                />
                <SmallBtn type="button" onClick={addAlias}>Add</SmallBtn>
              </AliasRow>
              <ChipList>
                {aliases.map((a) => (
                  <Chip key={a}>
                    {a}
                    <ChipRemove type="button" onClick={() => removeAlias(a)} aria-label={`Remove alias ${a}`}><X size={10} strokeWidth={2} /></ChipRemove>
                  </Chip>
                ))}
              </ChipList>
            </Field>

            <Field>
              <Label htmlFor="chem-category">Category *</Label>
              <Input
                id="chem-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Nitrogen, Phosphorus, Micronutrient"
              />
            </Field>

            <Field>
              <Label htmlFor="chem-unit">Default Unit *</Label>
              <Select id="chem-unit" value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value as 'kg' | 'L')}>
                <option value="kg">kg</option>
                <option value="L">L (litre)</option>
              </Select>
            </Field>

            <Field>
              <Label htmlFor="chem-notes">Notes</Label>
              <TextArea
                id="chem-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional internal notes"
              />
            </Field>

            {error && <ErrorText>{error}</ErrorText>}
          </ModalBody>

          <ModalFooter>
            <OutlineBtn type="button" onClick={onClose}>Cancel</OutlineBtn>
            <PrimaryBtn type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : (initial ? 'Save changes' : 'Add chemical')}
            </PrimaryBtn>
          </ModalFooter>
        </form>
      </ModalBox>
    </Backdrop>
  );
}

// ─── Modal: Archive Confirmation (409 flow) ────────────────────────────────

interface ArchiveModalProps {
  chemical: FertilizerChemical;
  dependents: ChemicalDependentsError['dependents'];
  onClose: () => void;
  onArchiveAnyway: () => void;
  isArchiving: boolean;
}

function ArchiveModal({ chemical, dependents, onClose, onArchiveAnyway, isArchiving }: ArchiveModalProps) {
  return (
    <Backdrop>
      <ModalBox role="dialog" aria-modal="true" aria-label="Archive chemical">
        <ModalHeader>
          <ModalTitle>Archive "{chemical.name}"?</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close" type="button"><X size={16} strokeWidth={1.8} /></CloseButton>
        </ModalHeader>
        <ModalBody>
          <WarningBanner>
            This chemical is used by {dependents.length} plant{dependents.length !== 1 ? 's' : ''} in the Plant Library.
            Archiving will hide it from the catalog but will not remove it from existing schedules.
          </WarningBanner>
          <DependentList>
            {dependents.map((d) => (
              <DependentItem key={d.plantDataId}>• {d.plantName}</DependentItem>
            ))}
          </DependentList>
        </ModalBody>
        <ModalFooter>
          <OutlineBtn type="button" onClick={onClose}>Cancel</OutlineBtn>
          <DangerBtn type="button" onClick={onArchiveAnyway} disabled={isArchiving}>
            {isArchiving ? 'Archiving…' : 'Archive anyway'}
          </DangerBtn>
        </ModalFooter>
      </ModalBox>
    </Backdrop>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ChemicalsCatalog() {
  const { user: currentUser } = useAuthStore();
  const canDiscover = ['admin', 'agronomist', 'super_admin', 'moderator'].includes(currentUser?.role ?? '');

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FertilizerChemical | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FertilizerChemical | null>(null);
  const [archiveDependents, setArchiveDependents] = useState<ChemicalDependentsError['dependents']>([]);

  // Queries & mutations
  const { data, isLoading } = useChemicals(showArchived);
  const createMutation = useCreateChemical();
  const updateMutation = useUpdateChemical();
  const archiveMutation = useArchiveChemical();
  const discoverMutation = useDiscoverChemicals();

  const chemicals = data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return chemicals;
    const q = search.toLowerCase();
    return chemicals.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [chemicals, search]);

  const handleAddSave = (formData: CreateChemicalRequest) => {
    createMutation.mutate(formData, { onSuccess: () => setAddOpen(false) });
  };

  const handleEditSave = (formData: CreateChemicalRequest) => {
    if (!editTarget) return;
    updateMutation.mutate(
      { chemicalId: editTarget.chemicalId, data: formData },
      { onSuccess: () => setEditTarget(null) }
    );
  };

  const handleArchiveClick = (chemical: FertilizerChemical) => {
    archiveMutation.mutate(
      { chemicalId: chemical.chemicalId, force: false },
      {
        onSuccess: () => {
          // nothing extra — toast shown by hook
        },
        onError: (err) => {
          const axiosError = err as AxiosError<ChemicalDependentsError>;
          if (axiosError.response?.status === 409 && axiosError.response.data?.dependents) {
            setArchiveTarget(chemical);
            setArchiveDependents(axiosError.response.data.dependents);
          }
          // Other errors handled by global interceptor
        },
      }
    );
  };

  const handleArchiveAnyway = () => {
    if (!archiveTarget) return;
    archiveMutation.mutate(
      { chemicalId: archiveTarget.chemicalId, force: true },
      {
        onSuccess: () => {
          setArchiveTarget(null);
          setArchiveDependents([]);
        },
      }
    );
  };

  const handleRestoreClick = (chemical: FertilizerChemical) => {
    // PATCH with archivedAt: null unarchives the chemical on the backend.
    updateMutation.mutate({ chemicalId: chemical.chemicalId, data: { archivedAt: null } });
  };

  return (
    <PageContainer>
      <SharedPageHeader
        breadcrumb="Tools · Library"
        title="Chemicals Catalog"
        description="Manage the fertilizer chemicals master list used across plant schedules."
        stats={[{ value: chemicals.length, label: 'Chemicals' }]}
      />

      <HeaderActions>
        <PrimaryBtn type="button" onClick={() => setAddOpen(true)}>
          <Plus size={15} strokeWidth={2} /> Add Chemical
        </PrimaryBtn>
        {canDiscover && (
          <OutlineBtn
            type="button"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
          >
            {discoverMutation.isPending ? 'Discovering…' : 'Discover from Plant Library'}
          </OutlineBtn>
        )}
        <ToggleLabel>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>Show archived</span>
        </ToggleLabel>
      </HeaderActions>

      <FilterRow>
        <SearchInput
          type="search"
          placeholder="Search by name or alias…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search chemicals"
        />
      </FilterRow>

      {isLoading ? (
        <LoadingState>Loading chemicals…</LoadingState>
      ) : filtered.length === 0 ? (
        <EmptyState>
          {search
            ? `No chemicals match "${search}".`
            : 'No chemicals in catalog. Click "Add Chemical" or "Discover from Plant Library" to get started.'}
        </EmptyState>
      ) : (
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Aliases</Th>
                <Th>Category</Th>
                <Th>Unit</Th>
                <Th>Notes</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((chem) => (
                <tr key={chem.chemicalId}>
                  <Td>{chem.name}</Td>
                  <Td>
                    <ChipList>
                      {chem.aliases.map((a) => (
                        <InlineChip key={a}>{a}</InlineChip>
                      ))}
                    </ChipList>
                  </Td>
                  <Td>{chem.category}</Td>
                  <Td>{chem.defaultUnit}</Td>
                  <Td>{chem.notes ?? '—'}</Td>
                  <Td>
                    {chem.archivedAt ? (
                      <ArchivedBadge>Archived</ArchivedBadge>
                    ) : (
                      <ActiveBadge>Active</ActiveBadge>
                    )}
                  </Td>
                  <Td>
                    <ActionRow>
                      <LinkBtn type="button" onClick={() => setEditTarget(chem)}>Edit</LinkBtn>
                      {chem.archivedAt ? (
                        <LinkBtn
                          type="button"
                          onClick={() => handleRestoreClick(chem)}
                          disabled={updateMutation.isPending}
                        >
                          Restore
                        </LinkBtn>
                      ) : (
                        <DangerLinkBtn
                          type="button"
                          onClick={() => handleArchiveClick(chem)}
                        >
                          Archive
                        </DangerLinkBtn>
                      )}
                    </ActionRow>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>
      )}

      {/* Add modal */}
      {addOpen && (
        <ChemicalFormModal
          onClose={() => setAddOpen(false)}
          onSave={handleAddSave}
          isSaving={createMutation.isPending}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <ChemicalFormModal
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEditSave}
          isSaving={updateMutation.isPending}
        />
      )}

      {/* Archive 409 modal */}
      {archiveTarget && (
        <ArchiveModal
          chemical={archiveTarget}
          dependents={archiveDependents}
          onClose={() => { setArchiveTarget(null); setArchiveDependents([]); }}
          onArchiveAnyway={handleArchiveAnyway}
          isArchiving={archiveMutation.isPending}
        />
      )}
    </PageContainer>
  );
}

// ─── Styled Components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
`;

const FilterRow = styled.div`
  margin-bottom: 16px;
`;

const SearchInput = styled.input`
  padding: 10px 16px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  font-size: 14px;
  min-width: 280px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 150ms ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;

  @media (max-width: 768px) {
    /* Card-style layout on mobile */
    border: none;
    overflow: visible;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  @media (max-width: 768px) {
    display: block;

    thead {
      display: none;
    }

    tbody {
      display: block;
    }

    tr {
      display: block;
      background: ${({ theme }) => theme.colors.glass.base};
      border: 1px solid ${({ theme }) => theme.colors.glass.border};
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }

    td {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border: none;
      font-size: 14px;

      &::before {
        content: attr(data-label);
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: ${({ theme }) => theme.colors.textSecondary};
        min-width: 80px;
      }
    }
  }
`;

// Tables — spec §4: no solid chrome, Space Mono uppercase celeste headers,
// `line` row dividers.
const Th = styled.th`
  padding: 12px 16px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.celeste};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-align: left;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;

  tr:last-child & {
    border-bottom: none;
  }
`;

const ActionRow = styled.div`
  display: flex;
  gap: 12px;
`;

const ChipList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const InlineChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 12px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

// Active/archived — approved ("fruiting") vs. archived ("decommissioned"),
// spec §5.2 extrapolation.
const ActiveBadge = styled.span`
  ${phaseBadge('fruiting')}
`;

const ArchivedBadge = styled.span`
  ${phaseBadge('decommissioned')}
`;

const LoadingState = styled.div`
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyState = styled.div`
  padding: 64px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  user-select: none;

  input[type='checkbox'] {
    accent-color: ${({ theme }) => theme.colors.secondary[500]};
  }
`;

// ─── Buttons ──────────────────────────────────────────────────────────────────

// The primary-CTA gold treatment (spec §4 Buttons) — the one gold budget
// item for the page-level "Add Chemical" action.
const PrimaryBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  background: ${({ theme }) => `linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]})`};
  color: ${({ theme }) => theme.colors.onAccent};
  transition: transform 150ms ease, box-shadow 150ms ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const OutlineBtn = styled.button`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
  transition: all 150ms ease;

  &:hover:not(:disabled) {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// Destructive action — coral-b tinted glass, never solid red (spec §4).
const DangerBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  transition: background 150ms ease;

  &:hover:not(:disabled) { background: rgba(240, 138, 112, 0.26); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// Secondary emphasis (spec §3: "Secondary emphasis is celeste, never gold").
const LinkBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  text-decoration: underline;
  transition: color 150ms ease;

  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const DangerLinkBtn = styled(LinkBtn)`
  color: ${({ theme }) => theme.colors.bright.coral};
  &:hover { color: ${({ theme }) => theme.colors.bright.coral}; opacity: 0.8; }
`;

const SmallBtn = styled.button`
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 150ms ease;
  white-space: nowrap;

  &:hover { background: rgba(180, 200, 220, 0.07); }
`;

// ─── Modal Styled Components ──────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  /* Cosmos scrim, spec §4 "Modals/drawers" (rgba(10,14,36,.6)). */
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const ModalBox = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: all 150ms ease;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalBody = styled.div`
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ModalFooter = styled.div`
  padding: 16px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  transition: border-color 150ms ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`;

const Select = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const TextArea = styled.textarea`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  resize: vertical;
  transition: border-color 150ms ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const AliasRow = styled.div`
  display: flex;
  gap: 8px;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  background: rgba(107, 138, 224, 0.16);
  color: ${({ theme }) => theme.colors.bright.lapis};
`;

const ChipRemove = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  opacity: 0.7;

  &:hover { opacity: 1; }
`;

const ErrorText = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
  margin: 0;
`;

const WarningBanner = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DependentList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DependentItem = styled.li`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;
