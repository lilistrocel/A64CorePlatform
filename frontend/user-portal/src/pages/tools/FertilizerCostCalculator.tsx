/**
 * FertilizerCostCalculator Page
 *
 * Three panels:
 *   A. Price Book  — view/edit chemical prices (add/discover lives in Chemicals Catalog page)
 *   B. Crop List   — build the crop×points list, import/export, saved lists
 *   C. Output      — calculation results after hitting Calculate
 *
 * Path: /tools/fertilizer-calculator
 */

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import {
  usePrices,
  useUpdatePrice,
  useDeletePriceOverride,
  useCalculate,
  useExportXlsx,
  useImportXlsx,
  useDownloadImportTemplate,
  useSavedLists,
  useCreateSavedList,
  useUpdateSavedList,
  useDeleteSavedList,
} from '../../hooks/queries/useTools';
import { showSuccessToast, showWarningToast } from '../../stores/toast.store';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient } from '../../services/api';
import { getPlantDataEnhancedById } from '../../services/plantDataEnhancedApi';
import type {
  CropListRow,
  CropInputMode,
  CalculateResponse,
  SavedList,
} from '../../types/tools';
import type { YieldWasteInfo } from '../../types/farm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlantDataOption {
  plantDataId: string;
  plantName: string;
  hasFertigationSchedule: boolean;
  /** Yield data from plant_data_enhanced, embedded at pick time for Yield Mode conversion. */
  yieldInfo?: YieldWasteInfo;
}

// ─── Shared styled atoms used across panels ───────────────────────────────────

const PrimaryBtn = styled.button`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #fff;
  transition: background 150ms ease;
  white-space: nowrap;

  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primary[700]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const OutlineBtn = styled.button`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 150ms ease;
  white-space: nowrap;

  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.neutral[100]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const LinkBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.primary[500]};
  cursor: pointer;
  text-decoration: underline;
  &:hover { color: ${({ theme }) => theme.colors.primary[700]}; }
`;

const DangerLinkBtn = styled(LinkBtn)`
  color: ${({ theme }) => theme.colors.error};
  &:hover { color: #b91c1c; }
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[500]}22;
  }

  &::placeholder { color: ${({ theme }) => theme.colors.textDisabled}; }
  &:disabled { opacity: 0.5; }
`;

const Select = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  cursor: pointer;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// ─── Generic Modal Shell ──────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

function Modal({ title, onClose, children, footer, maxWidth = '520px' }: ModalProps) {
  return (
    <Backdrop>
      <ModalBox style={{ maxWidth }} role="dialog" aria-modal="true" aria-label={title}>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <CloseButton onClick={onClose} type="button" aria-label="Close modal">✕</CloseButton>
        </ModalHeader>
        <ModalBody>{children}</ModalBody>
        {footer && <ModalFooter>{footer}</ModalFooter>}
      </ModalBox>
    </Backdrop>
  );
}

// ─── Save List Modal ──────────────────────────────────────────────────────────

interface SaveListModalProps {
  initial?: string;
  onClose: () => void;
  onSave: (name: string) => void;
  isSaving: boolean;
}

function SaveListModal({ initial = '', onClose, onSave, isSaving }: SaveListModalProps) {
  const [name, setName] = useState(initial);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) return;
    onSave(trimmed);
  };

  return (
    <Modal
      title={initial ? 'Rename list' : 'Save crop list'}
      onClose={onClose}
      footer={
        <>
          <OutlineBtn type="button" onClick={onClose}>Cancel</OutlineBtn>
          <PrimaryBtn type="submit" form="save-list-form" disabled={isSaving || !name.trim()}>
            {isSaving ? 'Saving…' : 'Save'}
          </PrimaryBtn>
        </>
      }
    >
      <form id="save-list-form" onSubmit={handleSubmit}>
        <Field>
          <Label htmlFor="sl-name">List name</Label>
          <Input
            id="sl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer rotation 2026"
            maxLength={100}
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Manage Saved Lists Modal ─────────────────────────────────────────────────

interface ManageSavedListsModalProps {
  onClose: () => void;
  onRename: (listId: string, newName: string) => void;
  onDelete: (listId: string) => void;
  onLoad: (list: SavedList) => void;
  isWorking: boolean;
}

const SAVED_LISTS_PAGE_SIZE = 20;

function ManageSavedListsModal({ onClose, onRename, onDelete, onLoad, isWorking }: ManageSavedListsModalProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search input to avoid query-per-keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to first page whenever search term changes
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { data, isLoading } = useSavedLists({
    page,
    size: SAVED_LISTS_PAGE_SIZE,
    search: debouncedSearch || undefined,
  });
  const lists = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / SAVED_LISTS_PAGE_SIZE));

  return (
    <Modal title="Saved lists" onClose={onClose} footer={
      <OutlineBtn type="button" onClick={onClose}>Close</OutlineBtn>
    }>
      <SearchInput
        type="search"
        placeholder="Search lists by name…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        style={{ margin: '0 0 12px 0', display: 'block', width: '100%' }}
      />

      {isLoading && lists.length === 0 ? (
        <EmptyText>Loading…</EmptyText>
      ) : lists.length === 0 ? (
        <EmptyText>
          {debouncedSearch ? `No lists match "${debouncedSearch}".` : 'No saved lists yet.'}
        </EmptyText>
      ) : (
        <ListTable>
          {lists.map((l) => (
            <ListRow key={l.listId}>
              {renamingId === l.listId ? (
                <InlineRename>
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    maxLength={100}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { onRename(l.listId, renameValue); setRenamingId(null); }
                      if (e.key === 'Escape') { setRenamingId(null); }
                    }}
                  />
                  <LinkBtn onClick={() => { onRename(l.listId, renameValue); setRenamingId(null); }}>Save</LinkBtn>
                  <LinkBtn onClick={() => setRenamingId(null)}>Cancel</LinkBtn>
                </InlineRename>
              ) : (
                <>
                  <ListName>{l.name}</ListName>
                  <ListActions>
                    <LinkBtn onClick={() => { onLoad(l); onClose(); }}>Load</LinkBtn>
                    <LinkBtn onClick={() => { setRenamingId(l.listId); setRenameValue(l.name); }}>Rename</LinkBtn>
                    <DangerLinkBtn onClick={() => onDelete(l.listId)} disabled={isWorking}>Delete</DangerLinkBtn>
                  </ListActions>
                </>
              )}
            </ListRow>
          ))}
        </ListTable>
      )}

      {total > SAVED_LISTS_PAGE_SIZE && (
        <PaginationBar>
          <LinkBtn
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Prev
          </LinkBtn>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Page {page} of {totalPages} · {total.toLocaleString('en-US')} list{total !== 1 ? 's' : ''}
          </span>
          <LinkBtn
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next →
          </LinkBtn>
        </PaginationBar>
      )}
    </Modal>
  );
}

// ─── Panel A: Price Book (modal body) ────────────────────────────────────────
// Renders the price-editing content. Mounted inside a Modal shell by PricebookModal.
// Single responsibility: view and edit chemical prices only.
// Adding/discovering chemicals lives exclusively in the Chemicals Catalog page (/tools/chemicals).

function PricebookContent() {
  const [search, setSearch] = useState('');
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});

  const { data: pricesData, isLoading } = usePrices();
  const updatePriceMutation = useUpdatePrice();
  const deletePriceMutation = useDeletePriceOverride();

  const entries = pricesData ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.chemical.name.toLowerCase().includes(q) ||
        e.chemical.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [entries, search]);

  const handlePriceBlur = (chemicalId: string, raw: string) => {
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0) return;
    // Round to max 6 decimals
    const rounded = parseFloat(val.toFixed(6));
    updatePriceMutation.mutate({ chemicalId, data: { price: rounded } }, {
      onSuccess: () => {
        setEditingPrices((p) => { const n = { ...p }; delete n[chemicalId]; return n; });
      },
    });
  };

  return (
    <>
      {/* Only show search when there are chemicals to filter */}
      {entries.length > 0 && (
        <SearchInput
          type="search"
          placeholder="Search by name or alias…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: '16px', maxWidth: '320px' }}
        />
      )}

      {isLoading ? (
        <LoadingText>Loading prices…</LoadingText>
      ) : entries.length === 0 ? (
        <PricebookEmptyState>
          <EmptyText>No chemicals catalogued yet.</EmptyText>
          <EmptySubText>
            Go to the Chemicals Catalog to add some or run Discover from Plant Library.
          </EmptySubText>
          <RouterLink to="/tools/chemicals" $asButton>
            Go to Chemicals Catalog
          </RouterLink>
        </PricebookEmptyState>
      ) : filtered.length === 0 ? (
        <EmptyText>{`No results for "${search}".`}</EmptyText>
      ) : (
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>Chemical</Th>
                <Th>Aliases</Th>
                <Th>Category</Th>
                <Th>Unit</Th>
                <Th>Price (AED)</Th>
                <Th>Source</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const id = entry.chemical.chemicalId;
                const editing = editingPrices[id];
                const displayVal = editing !== undefined
                  ? editing
                  : entry.price !== undefined ? String(entry.price) : '';

                return (
                  <tr key={id}>
                    <Td>{entry.chemical.name}</Td>
                    <Td>
                      <ChipList>
                        {entry.chemical.aliases.map((a) => <InlineChip key={a}>{a}</InlineChip>)}
                      </ChipList>
                    </Td>
                    <Td>{entry.chemical.category}</Td>
                    <Td>{entry.chemical.defaultUnit}</Td>
                    <Td>
                      <PriceInput
                        type="number"
                        min="0"
                        step="any"
                        value={displayVal}
                        placeholder="—"
                        onChange={(e) => setEditingPrices((p) => ({ ...p, [id]: e.target.value }))}
                        onBlur={(e) => {
                          if (editing !== undefined) handlePriceBlur(id, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        }}
                        aria-label={`Price for ${entry.chemical.name}`}
                      />
                    </Td>
                    <Td><SourceBadge $source={entry.source}>{entry.source}</SourceBadge></Td>
                    <Td>
                      {entry.source === 'override' && (
                        <DangerLinkBtn
                          type="button"
                          onClick={() => deletePriceMutation.mutate(id)}
                          disabled={deletePriceMutation.isPending}
                        >
                          Reset
                        </DangerLinkBtn>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrapper>
      )}

      <PricebookModalFooterLink>
        <RouterLink to="/tools/chemicals">Manage Catalog →</RouterLink>
      </PricebookModalFooterLink>
    </>
  );
}

// ─── Price Book Modal ─────────────────────────────────────────────────────────

interface PricebookModalProps {
  onClose: () => void;
}

function PricebookModal({ onClose }: PricebookModalProps) {
  return (
    <Modal title="Price Book" onClose={onClose} maxWidth="960px">
      <PricebookContent />
    </Modal>
  );
}

// ─── Plant Typeahead ──────────────────────────────────────────────────────────

interface PlantTypeaheadProps {
  onSelect: (plant: PlantDataOption) => void;
  usedIds: Set<string>;
}

function PlantTypeahead({ onSelect, usedIds }: PlantTypeaheadProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PlantDataOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setOptions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await apiClient.get<any>('/v1/farm/plant-data-enhanced', {
        params: { search: q, perPage: 20, page: 1 },
      });
      const items: PlantDataOption[] = (res.data.data ?? []).map((p: any) => ({
        plantDataId: p.plantDataId ?? p._id,
        plantName: p.plantName,
        hasFertigationSchedule: !!(p.fertigationSchedule && (Array.isArray(p.fertigationSchedule) ? p.fertigationSchedule.length > 0 : true)),
        // Embed yieldInfo at pick time so Yield Mode conversion works without extra fetches
        yieldInfo: p.yieldInfo ?? undefined,
      }));
      setOptions(items);
      setOpen(true);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleSelect = (opt: PlantDataOption) => {
    if (!opt.hasFertigationSchedule) return;
    if (usedIds.has(opt.plantDataId)) return;
    onSelect(opt);
    setQuery('');
    setOptions([]);
    setOpen(false);
  };

  return (
    <TypeaheadWrapper ref={ref}>
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query && setOpen(true)}
        placeholder="Search plant name…"
        aria-label="Search and add crop"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {loading && <TypeaheadHint>Searching…</TypeaheadHint>}
      {open && options.length > 0 && (
        <TypeaheadDropdown role="listbox">
          {options.map((opt) => {
            const disabled = !opt.hasFertigationSchedule || usedIds.has(opt.plantDataId);
            return (
              <TypeaheadOption
                key={opt.plantDataId}
                role="option"
                aria-selected={false}
                $disabled={disabled}
                onClick={() => handleSelect(opt)}
                title={
                  !opt.hasFertigationSchedule
                    ? 'No fertigation schedule — add one in Plant Library'
                    : usedIds.has(opt.plantDataId)
                    ? 'Already in list'
                    : undefined
                }
              >
                <span>{opt.plantName}</span>
                {!opt.hasFertigationSchedule && (
                  <NoScheduleBadge>No schedule</NoScheduleBadge>
                )}
              </TypeaheadOption>
            );
          })}
        </TypeaheadDropdown>
      )}
    </TypeaheadWrapper>
  );
}

// ─── Yield conversion helpers ─────────────────────────────────────────────────

/**
 * Compute yieldPerDripper (net, accounting for waste) for a plant.
 *
 * Formula: yieldPerPlant × seedsPerPlantingPoint × (1 - expectedWastePercentage / 100)
 *
 * All plants currently have expectedWastePercentage = 0, so net == gross in practice.
 * The formula is written correctly so future waste data flows through automatically.
 */
function computeYieldPerDripper(yieldInfo: YieldWasteInfo): number {
  const waste = yieldInfo.expectedWastePercentage ?? 0;
  const seeds = yieldInfo.seedsPerPlantingPoint ?? 1;
  return yieldInfo.yieldPerPlant * seeds * (1 - waste / 100);
}

/**
 * Convert dripper count to equivalent target yield (one decimal place).
 * Returns null if yieldInfo is missing or yieldPerDripper is zero/negative.
 */
function drippersToYield(points: number, yieldInfo: YieldWasteInfo | undefined): number | null {
  if (!yieldInfo) return null;
  const ypd = computeYieldPerDripper(yieldInfo);
  if (ypd <= 0) return null;
  return Math.round(points * ypd * 10) / 10;
}

/**
 * Convert target yield to dripper count (always rounded up, minimum 1).
 * Returns null if yieldInfo is missing or yieldPerDripper is zero/negative.
 */
function yieldToDrippers(targetYield: number, yieldInfo: YieldWasteInfo | undefined): number | null {
  if (!yieldInfo) return null;
  const ypd = computeYieldPerDripper(yieldInfo);
  if (ypd <= 0) return null;
  return Math.max(1, Math.ceil(targetYield / ypd));
}

/**
 * Format a yield value for display: comma-separated thousands, up to 2 decimals.
 */
function fmtYield(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Reason: numeric controlled inputs lose mid-edit precision (typing "." after
// "1500" parses to 1500 and the dot disappears) and don't render thousands
// separators. Buffer the raw string locally; format with commas at the integer
// part while preserving the typed decimal.
interface YieldInputProps {
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
}

function formatYieldRaw(s: string): string {
  // Strip everything except digits and a single decimal point
  const cleaned = s.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const intPart = parts[0] ?? '';
  const decimalPart = parts.length > 1 ? parts.slice(1).join('').replace(/\./g, '') : null;
  // Drop leading zeros on the integer part unless followed by "."
  const intNoLeadZeros = intPart.replace(/^0+(?=\d)/, '');
  // Format integer with commas
  const intWithCommas = intNoLeadZeros === ''
    ? ''
    : parseInt(intNoLeadZeros, 10).toLocaleString('en-US');
  return decimalPart !== null ? `${intWithCommas}.${decimalPart}` : intWithCommas;
}

function YieldInput({ value, onChange, ariaLabel }: YieldInputProps) {
  const [raw, setRaw] = useState<string>(
    value === 0 ? '' : value.toLocaleString('en-US', { maximumFractionDigits: 6 })
  );

  // Sync from external changes (e.g., mode-switch converting points → yield)
  useEffect(() => {
    const parsedFromRaw = parseFloat(raw.replace(/,/g, ''));
    const numericFromRaw = isNaN(parsedFromRaw) ? 0 : parsedFromRaw;
    if (numericFromRaw !== value) {
      setRaw(value === 0 ? '' : value.toLocaleString('en-US', { maximumFractionDigits: 6 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <PointsInput
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const formatted = formatYieldRaw(e.target.value);
        setRaw(formatted);
        const numeric = parseFloat(formatted.replace(/,/g, ''));
        if (!isNaN(numeric) && numeric >= 0 && numeric <= 100_000_000) {
          onChange(numeric);
        } else if (formatted === '' || formatted === '.') {
          onChange(0);
        }
      }}
      onBlur={() => {
        const numeric = parseFloat(raw.replace(/,/g, ''));
        if (isNaN(numeric) || numeric < 0) {
          setRaw('');
          onChange(0);
        }
      }}
      aria-label={ariaLabel}
      style={{ width: '120px' }}
    />
  );
}

// ─── Panel B: Crop List ───────────────────────────────────────────────────────

interface CropListPanelProps {
  rows: CropListRow[];
  onAddRow: (plant: PlantDataOption) => void;
  onRemoveRow: (plantDataId: string) => void;
  onUpdatePoints: (plantDataId: string, points: number) => void;
  onUpdateTargetYield: (plantDataId: string, targetYield: number) => void;
  onCalculate: () => void;
  isCalculating: boolean;
  // Mode toggle
  mode: CropInputMode;
  onModeChange: (mode: CropInputMode) => void;
  // Saved lists
  totalSavedLists: number;
  activeListId: string | null;
  activeListName: string | null;
  onSaveList: (name: string) => void;
  onManageLists: () => void;
  onNewList: () => void;
  isSavingList: boolean;
  // Import / Export
  onImportFile: (file: File) => void;
  isImporting: boolean;
  onDownloadTemplate: () => void;
  isDownloadingTemplate: boolean;
  exportDisabled: boolean;
  onExport: () => void;
  isExporting: boolean;
}

function CropListPanel({
  rows,
  onAddRow,
  onRemoveRow,
  onUpdatePoints,
  onUpdateTargetYield,
  onCalculate,
  isCalculating,
  mode,
  onModeChange,
  totalSavedLists,
  activeListId,
  activeListName,
  onSaveList,
  onManageLists,
  onNewList,
  isSavingList,
  onImportFile,
  isImporting,
  onDownloadTemplate,
  isDownloadingTemplate,
  exportDisabled,
  onExport,
  isExporting,
}: CropListPanelProps) {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usedIds = useMemo(() => new Set(rows.map((r) => r.plantDataId)), [rows]);

  // Reason: keep activeList shape for downstream code; pull from props (paginated lists)
  const activeList = activeListId && activeListName
    ? { listId: activeListId, name: activeListName }
    : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx')) {
      showWarningToast('Please select an .xlsx file.');
      return;
    }
    onImportFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Crop List</PanelTitle>

        {/* Mode toggle — between title and action buttons */}
        <ModeToggle role="group" aria-label="Input mode">
          <ModeToggleBtn
            type="button"
            $active={mode === 'dripper'}
            onClick={() => onModeChange('dripper')}
            aria-pressed={mode === 'dripper'}
          >
            Dripper Mode
          </ModeToggleBtn>
          <ModeToggleBtn
            type="button"
            $active={mode === 'yield'}
            onClick={() => onModeChange('yield')}
            aria-pressed={mode === 'yield'}
          >
            Yield Mode
          </ModeToggleBtn>
        </ModeToggle>

        <PanelHeaderRight>
          <OutlineBtn
            type="button"
            onClick={onNewList}
            disabled={rows.length === 0 && activeListId === null}
            style={{ fontSize: '13px', padding: '7px 14px' }}
            title="Clear the current list and start fresh"
          >
            New list
          </OutlineBtn>

          <OutlineBtn
            type="button"
            onClick={() => setSaveModalOpen(true)}
            disabled={rows.length === 0 || isSavingList}
            style={{ fontSize: '13px', padding: '7px 14px' }}
          >
            {activeList ? `Update "${activeList.name}"` : 'Save list'}
          </OutlineBtn>

          <LinkBtn type="button" onClick={onManageLists} style={{ fontSize: '13px' }}>
            {totalSavedLists === 0 ? 'Saved lists' : `Saved lists (${totalSavedLists.toLocaleString('en-US')})`}
          </LinkBtn>

          <VisuallyHidden>
            <input
              type="file"
              accept=".xlsx"
              ref={fileInputRef}
              onChange={handleFileChange}
              aria-label="Import sheet file"
            />
          </VisuallyHidden>
          <OutlineBtn
            type="button"
            onClick={onDownloadTemplate}
            disabled={isDownloadingTemplate}
            style={{ fontSize: '13px', padding: '7px 14px' }}
            title="Download a blank .xlsx template"
          >
            {isDownloadingTemplate ? 'Preparing…' : 'Import Template'}
          </OutlineBtn>
          <OutlineBtn
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            style={{ fontSize: '13px', padding: '7px 14px' }}
          >
            {isImporting ? 'Importing…' : 'Import Sheet'}
          </OutlineBtn>
          <OutlineBtn
            type="button"
            onClick={onExport}
            disabled={exportDisabled || isExporting}
            style={{ fontSize: '13px', padding: '7px 14px' }}
            title={exportDisabled ? 'Run Calculate first' : undefined}
          >
            {isExporting ? 'Exporting…' : 'Export Sheet'}
          </OutlineBtn>
        </PanelHeaderRight>
      </PanelHeader>

      <PanelBody>
        <PlantTypeahead onSelect={onAddRow} usedIds={usedIds} />

        {rows.length === 0 ? (
          <EmptyText style={{ padding: '32px 0' }}>
            Add a crop to start calculating.
          </EmptyText>
        ) : mode === 'dripper' ? (
          /* ── Dripper Mode table ── */
          <CropTable>
            <thead>
              <tr>
                <Th>Crop</Th>
                <Th style={{ width: '140px' }}>Points / Drippers</Th>
                <Th style={{ width: '180px' }}>Est. Yield</Th>
                <Th style={{ width: '48px' }}></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // Compute estimated yield for read-only column
                const estYield = drippersToYield(row.points, row.yieldInfo);
                const yieldUnit = row.yieldInfo?.yieldUnit ?? '';
                return (
                  <tr key={row.plantDataId}>
                    <Td>{row.plantName}</Td>
                    <Td>
                      <PointsInput
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9,]*"
                        value={row.points === 0 ? '' : row.points.toLocaleString('en-US')}
                        onChange={(e) => {
                          // Reason: keep keystrokes responsive — strip non-digits but
                          // allow temporary empty/zero state so backspace and cursor
                          // movement work normally. Validation happens on blur.
                          const cleaned = e.target.value.replace(/[^0-9]/g, '');
                          if (cleaned === '') {
                            onUpdatePoints(row.plantDataId, 0);
                            return;
                          }
                          const val = parseInt(cleaned, 10);
                          if (!isNaN(val) && val <= 10_000_000) {
                            onUpdatePoints(row.plantDataId, val);
                          }
                        }}
                        onBlur={() => {
                          // Reason: snap empty/zero back to 1 once the user finishes editing
                          if (row.points < 1) onUpdatePoints(row.plantDataId, 1);
                        }}
                        aria-label={`Points for ${row.plantName}`}
                      />
                    </Td>
                    <Td>
                      <ConversionHint>
                        {estYield !== null
                          ? `~${fmtYield(estYield)}${yieldUnit ? ` ${yieldUnit}` : ''}`
                          : '—'}
                      </ConversionHint>
                    </Td>
                    <Td>
                      <IconBtn
                        type="button"
                        onClick={() => onRemoveRow(row.plantDataId)}
                        aria-label={`Remove ${row.plantName}`}
                        title="Remove"
                      >
                        🗑️
                      </IconBtn>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </CropTable>
        ) : (
          /* ── Yield Mode table ── */
          <CropTable>
            <thead>
              <tr>
                <Th>Crop</Th>
                <Th style={{ width: '200px' }}>Target Yield</Th>
                <Th style={{ width: '160px' }}>Drippers (auto)</Th>
                <Th style={{ width: '48px' }}></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hasYieldData = !!(
                  row.yieldInfo &&
                  computeYieldPerDripper(row.yieldInfo) > 0
                );
                const yieldUnit = row.yieldInfo?.yieldUnit ?? '';
                // Compute the dripper count from the current targetYield
                const computedDrippers = hasYieldData && row.yieldInfo
                  ? yieldToDrippers(row.targetYield ?? 0, row.yieldInfo)
                  : null;
                // Display value in the yield input: empty string when zero so
                return (
                  <tr key={row.plantDataId}>
                    <Td>{row.plantName}</Td>
                    <Td>
                      {hasYieldData ? (
                        <YieldInputWrapper>
                          <YieldInput
                            value={row.targetYield ?? 0}
                            onChange={(v) => onUpdateTargetYield(row.plantDataId, v)}
                            ariaLabel={`Target yield for ${row.plantName}`}
                          />
                          {yieldUnit && (
                            <YieldUnitLabel>{yieldUnit}</YieldUnitLabel>
                          )}
                        </YieldInputWrapper>
                      ) : (
                        <ConversionHint
                          title="Plant has no yield data"
                          style={{ cursor: 'help' }}
                        >
                          — no yield data
                        </ConversionHint>
                      )}
                    </Td>
                    <Td>
                      <ConversionHint>
                        {computedDrippers !== null
                          ? `${computedDrippers.toLocaleString('en-US')} drippers`
                          : '—'}
                      </ConversionHint>
                    </Td>
                    <Td>
                      <IconBtn
                        type="button"
                        onClick={() => onRemoveRow(row.plantDataId)}
                        aria-label={`Remove ${row.plantName}`}
                        title="Remove"
                      >
                        🗑️
                      </IconBtn>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </CropTable>
        )}

        <CalculateRow>
          <PrimaryBtn
            type="button"
            onClick={onCalculate}
            disabled={rows.length === 0 || isCalculating}
          >
            {isCalculating ? 'Calculating…' : `Calculate (${rows.length} crop${rows.length !== 1 ? 's' : ''})`}
          </PrimaryBtn>
        </CalculateRow>
      </PanelBody>

      {saveModalOpen && (
        <SaveListModal
          initial={activeList?.name ?? ''}
          onClose={() => setSaveModalOpen(false)}
          onSave={(name) => { onSaveList(name); setSaveModalOpen(false); }}
          isSaving={isSavingList}
        />
      )}
    </Panel>
  );
}

// ─── Panel C: Output ──────────────────────────────────────────────────────────

interface OutputPanelProps {
  result: CalculateResponse | null;
  /** True when the crop×points inputs changed after this result was calculated. */
  isStale?: boolean;
  /**
   * Maps plantDataId → yieldInfo so the result panel can compute per-crop
   * estimated yield and a grand-total yield from the calculation rows.
   * Sourced from `rows` at calculate time (backend response doesn't carry it).
   */
  yieldInfoByPlant: Record<string, YieldWasteInfo | undefined>;
}

/**
 * Round UP to at most 2 decimals, add thousand separators, drop trailing zeros.
 * Examples: 12345.678 → "12,345.68", 12.300 → "12.3", 12.000 → "12", 0.001 → "0.01".
 */
function fmtUpTo2(n: number | null | undefined): string {
  if (n == null) return '—';
  const ceiled = Math.ceil(n * 100) / 100;
  return ceiled.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

interface PerInputAgg {
  key: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number | null;
  totalCost: number | null;
  costKnown: boolean;
}

function aggregatePerInput(result: CalculateResponse): PerInputAgg[] {
  const map = new Map<string, PerInputAgg>();
  for (const crop of result.perCrop) {
    for (const ing of crop.ingredients) {
      const key = ing.chemicalId ?? `unmatched::${ing.name}::${ing.unit}`;
      const existing = map.get(key);
      if (existing) {
        existing.qty += ing.qty;
        if (ing.totalCost == null) existing.costKnown = false;
        else if (existing.totalCost != null) existing.totalCost += ing.totalCost;
        if (ing.unitPrice != null) existing.unitPrice = ing.unitPrice;
      } else {
        map.set(key, {
          key,
          name: ing.name,
          unit: ing.unit,
          qty: ing.qty,
          unitPrice: ing.unitPrice ?? null,
          totalCost: ing.totalCost ?? null,
          costKnown: ing.totalCost != null,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
}

function OutputPanel({ result, isStale, yieldInfoByPlant }: OutputPanelProps) {
  const [activeTab, setActiveTab] = useState<'perCrop' | 'perInput'>('perCrop');
  const [openCrops, setOpenCrops] = useState<Set<string>>(new Set());

  if (!result) return null;

  const toggleCrop = (plantDataId: string) => {
    setOpenCrops((prev) => {
      const next = new Set(prev);
      if (next.has(plantDataId)) next.delete(plantDataId);
      else next.add(plantDataId);
      return next;
    });
  };

  const grandTotal = result.grandTotalCost;
  const hasNoPrices = grandTotal === undefined || grandTotal === null;
  const perInputRows = activeTab === 'perInput' ? aggregatePerInput(result) : [];

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Calculation Results{isStale && <StaleTag>Outdated</StaleTag>}</PanelTitle>
      </PanelHeader>
      {isStale && (
        <StaleBanner>
          ⚠ Inputs changed since this was calculated — press <strong>Calculate</strong> to update the results below.
        </StaleBanner>
      )}
      <PanelBody style={isStale ? { opacity: 0.45 } : undefined}>
        {/* Warnings */}
        {result.warnings.length > 0 && (
          <WarningsBanner>
            {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </WarningsBanner>
        )}

        {/* Newly discovered chemicals */}
        {result.discoveredChemicals.length > 0 && (
          <InfoBanner>
            We auto-added {result.discoveredChemicals.length} new{' '}
            chemical{result.discoveredChemicals.length !== 1 ? 's' : ''} to the catalog
            ({result.discoveredChemicals.map((c) => c.name).join(', ')}).{' '}
            Set their prices via the Price Book button.
          </InfoBanner>
        )}

        {/* View tabs */}
        <ResultTabs role="tablist">
          <ResultTab
            type="button"
            role="tab"
            aria-selected={activeTab === 'perCrop'}
            $active={activeTab === 'perCrop'}
            onClick={() => setActiveTab('perCrop')}
          >
            Per Crop
          </ResultTab>
          <ResultTab
            type="button"
            role="tab"
            aria-selected={activeTab === 'perInput'}
            $active={activeTab === 'perInput'}
            onClick={() => setActiveTab('perInput')}
          >
            Per Input
          </ResultTab>
        </ResultTabs>

        {activeTab === 'perInput' && (
          <IngredientTable>
            <thead>
              <tr>
                <IngTh>Chemical</IngTh>
                <IngTh>Total Qty</IngTh>
                <IngTh>Unit Price (AED)</IngTh>
                <IngTh>Total Cost (AED)</IngTh>
              </tr>
            </thead>
            <tbody>
              {perInputRows.length === 0 ? (
                <tr>
                  <IngTd colSpan={4} style={{ textAlign: 'center', color: '#888' }}>
                    No ingredients to aggregate.
                  </IngTd>
                </tr>
              ) : (
                perInputRows.map((row) => (
                  <tr key={row.key}>
                    <IngTd>{row.name}</IngTd>
                    <IngTd>{fmtUpTo2(row.qty)} {row.unit}</IngTd>
                    <IngTd>
                      {row.unitPrice != null ? `${fmtUpTo2(row.unitPrice)} AED/${row.unit}` : '—'}
                    </IngTd>
                    <IngTd>
                      {row.costKnown && row.totalCost != null
                        ? fmtUpTo2(row.totalCost)
                        : '—'}
                    </IngTd>
                  </tr>
                ))
              )}
            </tbody>
          </IngredientTable>
        )}

        {/* Per-crop results */}
        {activeTab === 'perCrop' && result.perCrop.map((crop) => {
          const isOpen = openCrops.has(crop.plantDataId);
          const yi = yieldInfoByPlant[crop.plantDataId];
          const estYield = drippersToYield(crop.points, yi);
          const yieldUnit = yi?.yieldUnit ?? '';
          return (
            <CropResultBlock key={crop.plantDataId}>
              <CropResultHeader
                type="button"
                onClick={() => toggleCrop(crop.plantDataId)}
                aria-expanded={isOpen}
              >
                <CropResultInfo>
                  <strong>{crop.plantName}</strong>
                  <CropMeta>
                    <span>{crop.points.toLocaleString('en-US')} point{crop.points !== 1 ? 's' : ''}</span>
                    <span>
                      {estYield !== null ? `~${fmtYield(estYield)} ${yieldUnit}` : '—'}
                    </span>
                    <span>{crop.cycleDays} days</span>
                    <CropSubtotal>
                      {crop.subtotalCost != null
                        ? `AED ${fmtUpTo2(crop.subtotalCost)}`
                        : '—'}
                    </CropSubtotal>
                  </CropMeta>
                </CropResultInfo>
                <CropCaret>{isOpen ? '▾' : '▸'}</CropCaret>
              </CropResultHeader>

              {isOpen && (
                <IngredientTable>
                  <thead>
                    <tr>
                      <IngTh>Chemical</IngTh>
                      <IngTh>Qty</IngTh>
                      <IngTh>Unit Price (AED)</IngTh>
                      <IngTh>Cost (AED)</IngTh>
                    </tr>
                  </thead>
                  <tbody>
                    {crop.ingredients.map((ing) => (
                      <tr key={ing.chemicalId}>
                        <IngTd>{ing.name}</IngTd>
                        <IngTd>{fmtUpTo2(ing.qty)} {ing.unit}</IngTd>
                        <IngTd>
                          {ing.unitPrice != null ? `${fmtUpTo2(ing.unitPrice)} AED/${ing.unit}` : '—'}
                        </IngTd>
                        <IngTd>{ing.totalCost != null ? fmtUpTo2(ing.totalCost) : '—'}</IngTd>
                      </tr>
                    ))}
                    <tr>
                      <IngTd colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Subtotal</IngTd>
                      <IngTd style={{ fontWeight: 600 }}>
                        {crop.subtotalCost != null ? `AED ${fmtUpTo2(crop.subtotalCost)}` : '—'}
                      </IngTd>
                    </tr>
                  </tbody>
                </IngredientTable>
              )}
            </CropResultBlock>
          );
        })}

        {/* Grand Totals — two side-by-side boxes */}
        {(() => {
          // Reason: sum estimated yield across crops, grouped by yieldUnit.
          // Today every plant is kg so this collapses to a single line, but
          // the grouping keeps the display sane if a non-kg plant ever appears.
          const yieldByUnit: Record<string, number> = {};
          for (const crop of result.perCrop) {
            const yi = yieldInfoByPlant[crop.plantDataId];
            const est = drippersToYield(crop.points, yi);
            if (est === null || !yi) continue;
            yieldByUnit[yi.yieldUnit] = (yieldByUnit[yi.yieldUnit] ?? 0) + est;
          }
          const yieldParts = Object.entries(yieldByUnit)
            .map(([unit, total]) => `~${fmtYield(total)} ${unit}`)
            .join(' + ');
          return (
            <GrandTotalsGrid>
              <GrandTotalBox $variant="yield">
                <GrandTotalBoxLabel>Total Yield</GrandTotalBoxLabel>
                <GrandTotalBoxValue $variant="yield">
                  {yieldParts || '—'}
                </GrandTotalBoxValue>
              </GrandTotalBox>
              <GrandTotalBox $variant="cost">
                <GrandTotalBoxLabel>Total Fertigation Cost</GrandTotalBoxLabel>
                <GrandTotalBoxValue $variant="cost">
                  {hasNoPrices ? (
                    <span title="Set prices in the Price Book to see total cost">
                      —
                    </span>
                  ) : (
                    `AED ${fmtUpTo2(grandTotal!)}`
                  )}
                </GrandTotalBoxValue>
                {hasNoPrices && (
                  <NoPriceNote>Set prices to see cost</NoPriceNote>
                )}
              </GrandTotalBox>
            </GrandTotalsGrid>
          );
        })()}
      </PanelBody>
    </Panel>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// Reason: per-user keys so multiple users on the same browser don't share state
const draftKey = (userId: string) => `fertCalc.draft.${userId}`;
const modeKey = (userId: string) => `fertCalc.mode.${userId}`;

export function FertilizerCostCalculator() {
  const { user } = useAuthStore();
  const [rows, setRows] = useState<CropListRow[]>([]);
  const [result, setResult] = useState<CalculateResponse | null>(null);
  // Signature of the crop×points list at the moment `result` was calculated.
  // Used to flag the Output panel as stale when the inputs change afterward.
  const [calculatedSignature, setCalculatedSignature] = useState<string | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activeListName, setActiveListName] = useState<string | null>(null);
  const [manageListsOpen, setManageListsOpen] = useState(false);
  const [priceBookOpen, setPriceBookOpen] = useState(false);
  // Reason: tracks which user.userId we have *finished* loading the draft for.
  // The save effect must not run until this matches the current user, otherwise
  // stale empty state from initial render would clobber the just-loaded draft
  // in the same commit cycle (same-render effect ordering race).
  const [draftLoadedForUser, setDraftLoadedForUser] = useState<string | null>(null);

  // Mode preference — loaded immediately from localStorage (no async needed)
  const [mode, setMode] = useState<CropInputMode>(() => {
    if (!user?.userId) return 'dripper';
    try {
      const stored = localStorage.getItem(modeKey(user.userId));
      return stored === 'yield' ? 'yield' : 'dripper';
    } catch {
      return 'dripper';
    }
  });

  // Restore draft on mount (per-user). Re-runs if user.userId transitions.
  useEffect(() => {
    if (!user?.userId) {
      setDraftLoadedForUser(null);
      return;
    }
    // Reload mode preference in case user changed since initial render
    try {
      const stored = localStorage.getItem(modeKey(user.userId));
      setMode(stored === 'yield' ? 'yield' : 'dripper');
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(draftKey(user.userId));
      if (raw) {
        const draft = JSON.parse(raw);
        if (Array.isArray(draft.rows)) setRows(draft.rows);
        if (typeof draft.activeListId === 'string' || draft.activeListId === null) {
          setActiveListId(draft.activeListId);
        }
        if (typeof draft.activeListName === 'string' || draft.activeListName === null) {
          setActiveListName(draft.activeListName);
        }
      } else {
        // Reason: no draft for this user — explicitly clear any leftover state
        // (e.g., from a prior session of a different user on the same browser)
        setRows([]);
        setActiveListId(null);
        setActiveListName(null);
      }
    } catch {
      // Reason: corrupt draft — discard, no-op
    }
    setDraftLoadedForUser(user.userId);
  }, [user?.userId]);

  // Persist draft on rows / activeListId change.
  // Gate: only run AFTER load has completed for the current user.userId, otherwise
  // the same-commit ordering race could clobber the just-loaded draft with empty state.
  useEffect(() => {
    if (!user?.userId || draftLoadedForUser !== user.userId) return;
    const key = draftKey(user.userId);
    if (rows.length === 0 && activeListId === null) {
      localStorage.removeItem(key);
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify({ rows, activeListId, activeListName }));
    } catch {
      // Reason: localStorage quota or disabled — silently ignore
    }
  }, [rows, activeListId, activeListName, draftLoadedForUser, user?.userId]);

  // Prices feed the backend calculation too, so edits to them also stale the result.
  // usePrices shares the React Query cache with the Price Book panel (no extra fetch),
  // and price edits invalidate that query — so pricesData changes when a price is edited.
  const { data: pricesData } = usePrices();

  const calculateMutation = useCalculate();
  const exportMutation = useExportXlsx();
  const importMutation = useImportXlsx();
  const downloadTemplateMutation = useDownloadImportTemplate();
  // Reason: page-level only needs the total count for the badge — fetch a tiny first page.
  const { data: savedListsData } = useSavedLists({ page: 1, size: 1 });
  const createListMutation = useCreateSavedList();
  const updateListMutation = useUpdateSavedList();
  const deleteListMutation = useDeleteSavedList();

  const totalSavedLists = savedListsData?.total ?? 0;

  // Persist mode preference per user and convert all rows in place.
  const handleModeChange = (nextMode: CropInputMode) => {
    if (!user?.userId) return;
    try {
      localStorage.setItem(modeKey(user.userId), nextMode);
    } catch {
      // ignore
    }
    setRows((prev) =>
      prev.map((row) => {
        if (nextMode === 'yield') {
          // Dripper → Yield: pre-populate targetYield from current points
          const equiv = drippersToYield(row.points, row.yieldInfo);
          return { ...row, targetYield: equiv ?? undefined };
        } else {
          // Yield → Dripper: convert current targetYield back to points
          if (row.targetYield !== undefined && row.yieldInfo) {
            const drippers = yieldToDrippers(row.targetYield, row.yieldInfo);
            return { ...row, points: drippers ?? row.points, targetYield: undefined };
          }
          return { ...row, targetYield: undefined };
        }
      })
    );
    setMode(nextMode);
  };

  const handleAddRow = (plant: PlantDataOption) => {
    // Embed yieldInfo at pick time — used by Yield Mode for conversion without extra fetches.
    setRows((prev) => [
      ...prev,
      {
        plantDataId: plant.plantDataId,
        plantName: plant.plantName,
        hasFertigationSchedule: plant.hasFertigationSchedule,
        yieldInfo: plant.yieldInfo,
        points: 1,
        targetYield: undefined,
      },
    ]);
  };

  const handleRemoveRow = (plantDataId: string) => {
    setRows((prev) => prev.filter((r) => r.plantDataId !== plantDataId));
  };

  const handleUpdatePoints = (plantDataId: string, points: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.plantDataId !== plantDataId) return r;
        // Keep targetYield in sync so switching back to Yield Mode reflects the edit
        const newTarget = drippersToYield(points, r.yieldInfo) ?? r.targetYield;
        return { ...r, points, targetYield: newTarget };
      })
    );
  };

  const handleUpdateTargetYield = (plantDataId: string, targetYield: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.plantDataId !== plantDataId) return r;
        // Recompute points immediately so Calculate/Export/Save always read correct value
        const drippers = yieldToDrippers(targetYield, r.yieldInfo);
        return {
          ...r,
          targetYield,
          points: drippers !== null ? drippers : r.points,
        };
      })
    );
  };

  // Signature of the exact inputs the backend calculates from (crop id + points).
  // When this diverges from `calculatedSignature`, the shown result is stale.
  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        rows: rows.map((r) => ({ plantDataId: r.plantDataId, points: r.points })),
        prices: (pricesData ?? [])
          .map((p) => [p.chemical.chemicalId, p.price ?? null] as const)
          .sort((a, b) => a[0].localeCompare(b[0])),
      }),
    [rows, pricesData]
  );
  const resultStale =
    result !== null && calculatedSignature !== null && currentSignature !== calculatedSignature;

  const handleCalculate = () => {
    if (rows.length === 0) return;
    calculateMutation.mutate(
      { items: rows.map((r) => ({ plantDataId: r.plantDataId, points: r.points })) },
      {
        onSuccess: (data) => {
          setResult(data);
          setCalculatedSignature(currentSignature);
        },
      }
    );
  };

  const handleLoadList = (list: SavedList) => {
    // Replace crop rows — but we only have plantDataId+points; re-hydrate names via a quick fetch
    // For simplicity, mark as a list load and store the IDs; the typeahead will fill labels.
    // We merge the plant names from existing rows or use a placeholder.
    const merged: CropListRow[] = list.items.map((item) => {
      const existing = rows.find((r) => r.plantDataId === item.plantDataId);
      return {
        plantDataId: item.plantDataId,
        plantName: existing?.plantName ?? item.plantDataId, // fallback to ID until hydrated
        hasFertigationSchedule: true,
        points: item.points,
      };
    });
    setRows(merged);
    setActiveListId(list.listId);
    setActiveListName(list.name);
    // Hydrate names asynchronously
    hydratePlantNames(merged);
  };

  const hydratePlantNames = async (current: CropListRow[]) => {
    // Reason: hydrate rows that only have plantDataId as their name (just loaded from a
    // saved list). Also pull yieldInfo from the same response so Yield Mode works without
    // any extra fetches — one call per row, all in parallel.
    const missing = current.filter((r) => r.plantName === r.plantDataId || !r.yieldInfo);
    if (missing.length === 0) return;
    const results = await Promise.all(
      missing.map((row) =>
        getPlantDataEnhancedById(row.plantDataId)
          .then((p) => ({
            plantDataId: row.plantDataId,
            plantName: p.plantName,
            yieldInfo: p.yieldInfo,
          }))
          .catch(() => null)
      )
    );
    setRows((prev) =>
      prev.map((r) => {
        const hit = results.find((x) => x && x.plantDataId === r.plantDataId);
        if (!hit) return r;
        return {
          ...r,
          plantName: hit.plantName,
          yieldInfo: hit.yieldInfo ?? r.yieldInfo,
        };
      })
    );
  };

  const handleNewList = () => {
    setRows([]);
    setActiveListId(null);
    setActiveListName(null);
    setResult(null);
    setCalculatedSignature(null);
  };

  const handleSaveList = (name: string) => {
    const items = rows.map((r) => ({ plantDataId: r.plantDataId, points: r.points }));
    if (activeListId) {
      updateListMutation.mutate({ listId: activeListId, data: { name, items } }, {
        onSuccess: (updated) => setActiveListName(updated.name),
      });
    } else {
      createListMutation.mutate({ name, items }, {
        onSuccess: (newList) => {
          setActiveListId(newList.listId);
          setActiveListName(newList.name);
        },
      });
    }
  };

  const handleImportFile = (file: File) => {
    importMutation.mutate(file, {
      onSuccess: (data) => {
        // Sum duplicates with existing rows
        const merged = [...rows];
        for (const item of data.items) {
          const existing = merged.find((r) => r.plantDataId === item.plantDataId);
          if (existing) {
            existing.points = Math.min(existing.points + item.points, 10_000_000);
          } else {
            merged.push({
              plantDataId: item.plantDataId,
              plantName: item.plantName,
              hasFertigationSchedule: true,
              points: item.points,
            });
          }
        }
        setRows([...merged]);

        // Show skipped rows
        if (data.skipped.length === data.items.length + data.skipped.length && data.items.length === 0) {
          showWarningToast(`Import failed: all ${data.skipped.length} rows were skipped.`);
        } else if (data.skipped.length > 0) {
          showWarningToast(
            `${data.skipped.length} row${data.skipped.length !== 1 ? 's' : ''} skipped: ` +
              data.skipped.slice(0, 3).map((s) => s.name).join(', ') +
              (data.skipped.length > 3 ? '…' : '')
          );
        }
        if (data.warnings.length > 0) {
          data.warnings.forEach((w) => showWarningToast(w));
        }
        if (data.items.length > 0) {
          showSuccessToast(`Imported ${data.items.length} crop${data.items.length !== 1 ? 's' : ''}.`);
        }
      },
    });
  };

  const handleExport = () => {
    if (!result) return;
    exportMutation.mutate(
      { items: rows.map((r) => ({ plantDataId: r.plantDataId, points: r.points })) }
    );
  };

  const handleDeleteList = (listId: string) => {
    deleteListMutation.mutate(listId, {
      onSuccess: () => {
        if (activeListId === listId) {
          setActiveListId(null);
          setActiveListName(null);
        }
      },
    });
  };

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Fertilizer Cost Calculator</PageTitle>
        <OutlineBtn
          type="button"
          onClick={() => setPriceBookOpen(true)}
          aria-label="Open Price Book"
        >
          Price Book
        </OutlineBtn>
      </PageHeader>

      <CropListPanel
        rows={rows}
        onAddRow={handleAddRow}
        onRemoveRow={handleRemoveRow}
        onUpdatePoints={handleUpdatePoints}
        onUpdateTargetYield={handleUpdateTargetYield}
        onCalculate={handleCalculate}
        isCalculating={calculateMutation.isPending}
        mode={mode}
        onModeChange={handleModeChange}
        totalSavedLists={totalSavedLists}
        activeListId={activeListId}
        activeListName={activeListName}
        onSaveList={handleSaveList}
        onManageLists={() => setManageListsOpen(true)}
        onNewList={handleNewList}
        isSavingList={createListMutation.isPending || updateListMutation.isPending}
        onImportFile={handleImportFile}
        isImporting={importMutation.isPending}
        onDownloadTemplate={() => downloadTemplateMutation.mutate()}
        isDownloadingTemplate={downloadTemplateMutation.isPending}
        exportDisabled={result === null}
        onExport={handleExport}
        isExporting={exportMutation.isPending}
      />

      <OutputPanel
        result={result}
        isStale={resultStale}
        yieldInfoByPlant={Object.fromEntries(
          rows.map((r) => [r.plantDataId, r.yieldInfo])
        )}
      />

      {manageListsOpen && (
        <ManageSavedListsModal
          onClose={() => setManageListsOpen(false)}
          onRename={(listId, name) => {
            updateListMutation.mutate({ listId, data: { name } }, {
              onSuccess: () => {
                if (activeListId === listId) setActiveListName(name);
              },
            });
          }}
          onDelete={handleDeleteList}
          onLoad={handleLoadList}
          isWorking={deleteListMutation.isPending || updateListMutation.isPending}
        />
      )}

      {priceBookOpen && (
        <PricebookModal onClose={() => setPriceBookOpen(false)} />
      )}
    </PageContainer>
  );
}

// ─── Styled Components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
`;

const PageTitle = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

// ── Panel shell ────────────────────────────────────────────────────────────

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  /* Reason: must allow overflow:visible so the typeahead dropdown can extend
     past the panel border. TableWrapper handles its own scroll boundary. */
  overflow: visible;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  gap: 12px;
  flex-wrap: wrap;
`;

const PanelTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const PanelHeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const PanelBody = styled.div`
  padding: 24px;
`;

// ── Price table ────────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 8px;

  @media (max-width: 768px) {
    border: none;
    overflow: visible;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  @media (max-width: 768px) {
    display: block;
    thead { display: none; }
    tbody { display: block; }
    tr {
      display: block;
      border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
    }
    td {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border: none;
      font-size: 13px;
    }
  }
`;

const CropTable = styled(Table)`
  margin-top: 16px;
`;

const Th = styled.th`
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.neutral[50]};
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: left;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 10px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;

  tr:last-child & { border-bottom: none; }
`;

const PriceInput = styled.input`
  width: 110px;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  transition: border-color 150ms;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
  &::placeholder { color: ${({ theme }) => theme.colors.textDisabled}; }
`;

const PointsInput = styled.input`
  width: 90px;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

interface SourceBadgeProps {
  $source: 'override' | 'inventory' | 'none';
}

const SourceBadge = styled.span<SourceBadgeProps>`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  ${({ $source, theme }) => {
    if ($source === 'override') return `background: #dbeafe; color: #1e40af;`;
    if ($source === 'inventory') return `background: #d1fae5; color: #065f46;`;
    return `background: ${theme.colors.neutral[200]}; color: ${theme.colors.textSecondary};`;
  }}
`;

const ChipList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const InlineChip = styled.span`
  display: inline-flex;
  padding: 2px 7px;
  border-radius: 9999px;
  font-size: 11px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;


interface RouterLinkProps {
  $asButton?: boolean;
}

const RouterLink = styled(Link)<RouterLinkProps>`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.primary[500]};
  text-decoration: underline;
  white-space: nowrap;
  &:hover { color: ${({ theme }) => theme.colors.primary[700]}; }

  ${({ $asButton, theme }) => $asButton && `
    display: inline-block;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    background: ${theme.colors.primary[500]};
    color: #fff;
    transition: background 150ms ease;
    &:hover { background: ${theme.colors.primary[700]}; color: #fff; }
  `}
`;

const SearchInput = styled.input`
  padding: 9px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[500]}22;
  }

  &::placeholder { color: ${({ theme }) => theme.colors.textDisabled}; }
`;

const LoadingText = styled.div`
  padding: 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyText = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const EmptySubText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin: 4px 0 16px;
`;

const PricebookEmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
`;

// Footer link row shown at the bottom of PricebookContent inside the modal
const PricebookModalFooterLink = styled.div`
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  display: flex;
  justify-content: flex-end;
`;

const CalculateRow = styled.div`
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
`;

const IconBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 16px;
  opacity: 0.7;
  transition: opacity 150ms;
  &:hover { opacity: 1; }
`;

// ── Typeahead ──────────────────────────────────────────────────────────────

const TypeaheadWrapper = styled.div`
  position: relative;
  max-width: 400px;
`;

const TypeaheadHint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const TypeaheadDropdown = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  max-height: 240px;
  overflow-y: auto;
  list-style: none;
  padding: 4px 0;
  margin: 4px 0 0;
`;

interface TypeaheadOptionProps {
  $disabled: boolean;
}

const TypeaheadOption = styled.li<TypeaheadOptionProps>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 14px;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: background 100ms;

  &:hover {
    background: ${({ $disabled, theme }) => ($disabled ? 'transparent' : theme.colors.neutral[100])};
  }
`;

const NoScheduleBadge = styled.span`
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #fef3c7;
  color: #92400e;
  white-space: nowrap;
  margin-left: 8px;
`;

// ── Output panel ───────────────────────────────────────────────────────────

const WarningsBanner = styled.div`
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  font-size: 14px;
  color: #92400e;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StaleBanner = styled.div`
  margin: 0 0 16px;
  padding: 10px 16px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  font-size: 13px;
  color: #92400e;
`;

const StaleTag = styled.span`
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #f59e0b;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
`;

const InfoBanner = styled.div`
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #dbeafe;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  font-size: 14px;
  color: #1e40af;
`;

const ResultTabs = styled.div`
  display: flex;
  gap: 4px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  margin-bottom: 16px;
`;

const ResultTab = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  border-bottom: 2px solid
    ${({ $active, theme }) => ($active ? theme.colors.primary[500] : 'transparent')};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : theme.colors.textSecondary};
  font-size: 14px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  transition: color 150ms, border-color 150ms;

  &:hover {
    color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const CropResultBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
`;

const CropResultHeader = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 150ms;

  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const CropResultInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const CropMeta = styled.div`
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CropSubtotal = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CropCaret = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const IngredientTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const IngTh = styled.th`
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: left;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  background: ${({ theme }) => theme.colors.neutral[50]};
`;

const IngTd = styled.td`
  padding: 8px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};

  tr:last-child & { border-bottom: none; }
`;

const GrandTotalsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const GrandTotalBox = styled.div<{ $variant: 'yield' | 'cost' }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 22px;
  border-radius: 12px;
  background: ${({ $variant, theme }) =>
    $variant === 'yield'
      ? `${theme.colors.success}11`
      : `${theme.colors.primary[500]}11`};
  border: 1px solid
    ${({ $variant, theme }) =>
      $variant === 'yield'
        ? `${theme.colors.success}33`
        : `${theme.colors.primary[500]}33`};
`;

const GrandTotalBoxLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const GrandTotalBoxValue = styled.span<{ $variant: 'yield' | 'cost' }>`
  font-size: 26px;
  font-weight: 700;
  color: ${({ $variant, theme }) =>
    $variant === 'yield' ? theme.colors.success : theme.colors.primary[500]};
  line-height: 1.1;
`;

const NoPriceNote = styled.span`
  font-size: 13px;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// ── Saved lists modal helpers ──────────────────────────────────────────────

const ListTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ListRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  gap: 12px;

  &:last-child { border-bottom: none; }
`;

const ListName = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  flex: 1;
`;

const ListActions = styled.div`
  display: flex;
  gap: 12px;
`;

const InlineRename = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
`;

const PaginationBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 0;
  margin-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  gap: 12px;
`;

// ── Modal shared ───────────────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows.xl};
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
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
  border: none;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 16px;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[200]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalBody = styled.div`
  padding: 14px 24px 20px;
  overflow-y: auto;
  flex: 1;
`;

const ModalFooter = styled.div`
  padding: 16px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
`;

// ── Form helpers ───────────────────────────────────────────────────────────

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
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

const AliasRow = styled.div`
  display: flex;
  gap: 8px;
`;

const SmallBtn = styled.button`
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  background: transparent;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  background: ${({ theme }) => theme.colors.primary[500]}1a;
  color: ${({ theme }) => theme.colors.primary[700]};
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

const TextArea = styled.textarea`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  resize: vertical;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const ErrorText = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
  margin: 0;
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
`;

// ── Mode toggle ────────────────────────────────────────────────────────────

const ModeToggle = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
`;

interface ModeToggleBtnProps {
  $active: boolean;
}

const ModeToggleBtn = styled.button<ModeToggleBtnProps>`
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  border-right: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  font-family: inherit;
  transition: background 150ms, color 150ms;
  white-space: nowrap;

  &:last-child {
    border-right: none;
  }

  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? '#fff' : theme.colors.textSecondary};

  &:hover:not([aria-pressed='true']) {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// ── Yield mode row helpers ─────────────────────────────────────────────────

/**
 * Read-only hint shown next to the editable input in both modes.
 * Renders the auto-computed value (e.g. "~12.5 kg" or "250 drippers").
 */
const ConversionHint = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const YieldInputWrapper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const YieldUnitLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;
