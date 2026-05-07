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
import { apiClient } from '../../services/api';
import { getPlantDataEnhancedById } from '../../services/plantDataEnhancedApi';
import type {
  CropListRow,
  CalculateResponse,
  SavedList,
} from '../../types/tools';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlantDataOption {
  plantDataId: string;
  plantName: string;
  hasFertigationSchedule: boolean;
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
  lists: SavedList[];
  onClose: () => void;
  onRename: (listId: string, newName: string) => void;
  onDelete: (listId: string) => void;
  onLoad: (list: SavedList) => void;
  isWorking: boolean;
}

function ManageSavedListsModal({ lists, onClose, onRename, onDelete, onLoad, isWorking }: ManageSavedListsModalProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  return (
    <Modal title="Manage saved lists" onClose={onClose} footer={
      <OutlineBtn type="button" onClick={onClose}>Close</OutlineBtn>
    }>
      {lists.length === 0 ? (
        <EmptyText>No saved lists yet.</EmptyText>
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

// ─── Panel B: Crop List ───────────────────────────────────────────────────────

interface CropListPanelProps {
  rows: CropListRow[];
  onAddRow: (plant: PlantDataOption) => void;
  onRemoveRow: (plantDataId: string) => void;
  onUpdatePoints: (plantDataId: string, points: number) => void;
  onCalculate: () => void;
  isCalculating: boolean;
  // Saved lists
  savedLists: SavedList[];
  activeListId: string | null;
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
  onCalculate,
  isCalculating,
  savedLists,
  activeListId,
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

  const activeList = savedLists.find((l) => l.listId === activeListId);

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
            {savedLists.length === 0 ? 'Saved lists' : `Saved lists (${savedLists.length})`}
          </LinkBtn>

          <VisuallyHidden>
            <input
              type="file"
              accept=".xlsx"
              ref={fileInputRef}
              onChange={handleFileChange}
              aria-label="Import Excel file"
            />
          </VisuallyHidden>
          <OutlineBtn
            type="button"
            onClick={onDownloadTemplate}
            disabled={isDownloadingTemplate}
            style={{ fontSize: '13px', padding: '7px 14px' }}
            title="Download a blank .xlsx template"
          >
            {isDownloadingTemplate ? 'Preparing…' : 'Download sample'}
          </OutlineBtn>
          <OutlineBtn
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            style={{ fontSize: '13px', padding: '7px 14px' }}
          >
            {isImporting ? 'Importing…' : 'Import Excel'}
          </OutlineBtn>
          <OutlineBtn
            type="button"
            onClick={onExport}
            disabled={exportDisabled || isExporting}
            style={{ fontSize: '13px', padding: '7px 14px' }}
            title={exportDisabled ? 'Run Calculate first' : undefined}
          >
            {isExporting ? 'Exporting…' : 'Export Excel'}
          </OutlineBtn>
        </PanelHeaderRight>
      </PanelHeader>

      <PanelBody>
        <PlantTypeahead onSelect={onAddRow} usedIds={usedIds} />

        {rows.length === 0 ? (
          <EmptyText style={{ padding: '32px 0' }}>
            Add a crop to start calculating.
          </EmptyText>
        ) : (
          <CropTable>
            <thead>
              <tr>
                <Th>Crop</Th>
                <Th style={{ width: '120px' }}>Points</Th>
                <Th style={{ width: '48px' }}></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
              ))}
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

function OutputPanel({ result }: OutputPanelProps) {
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
        <PanelTitle>Calculation Results</PanelTitle>
      </PanelHeader>
      <PanelBody>
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

        {/* Grand Total */}
        <GrandTotalRow>
          <GrandTotalLabel>Grand Total</GrandTotalLabel>
          <GrandTotalValue>
            {hasNoPrices ? (
              <span title="Set prices in the Price Book to see total cost">
                —{' '}
                <NoPriceNote>Set prices to see cost</NoPriceNote>
              </span>
            ) : (
              `AED ${fmtUpTo2(grandTotal!)}`
            )}
          </GrandTotalValue>
        </GrandTotalRow>
      </PanelBody>
    </Panel>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function FertilizerCostCalculator() {
  const [rows, setRows] = useState<CropListRow[]>([]);
  const [result, setResult] = useState<CalculateResponse | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [manageListsOpen, setManageListsOpen] = useState(false);
  const [priceBookOpen, setPriceBookOpen] = useState(false);

  const calculateMutation = useCalculate();
  const exportMutation = useExportXlsx();
  const importMutation = useImportXlsx();
  const downloadTemplateMutation = useDownloadImportTemplate();
  const { data: savedListsData } = useSavedLists();
  const createListMutation = useCreateSavedList();
  const updateListMutation = useUpdateSavedList();
  const deleteListMutation = useDeleteSavedList();

  const savedLists = savedListsData ?? [];

  const handleAddRow = (plant: PlantDataOption) => {
    setRows((prev) => [...prev, { ...plant, points: 1 }]);
  };

  const handleRemoveRow = (plantDataId: string) => {
    setRows((prev) => prev.filter((r) => r.plantDataId !== plantDataId));
  };

  const handleUpdatePoints = (plantDataId: string, points: number) => {
    setRows((prev) =>
      prev.map((r) => (r.plantDataId === plantDataId ? { ...r, points } : r))
    );
  };

  const handleCalculate = () => {
    if (rows.length === 0) return;
    calculateMutation.mutate(
      { items: rows.map((r) => ({ plantDataId: r.plantDataId, points: r.points })) },
      { onSuccess: (data) => setResult(data) }
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
    // Hydrate names asynchronously
    hydratePlantNames(merged);
  };

  const hydratePlantNames = async (current: CropListRow[]) => {
    const missing = current.filter((r) => r.plantName === r.plantDataId);
    if (missing.length === 0) return;
    // Reason: parallel lookup. Each call goes through plantDataEnhancedApi which
    // correctly unwraps the SuccessResponse envelope.
    const results = await Promise.all(
      missing.map((row) =>
        getPlantDataEnhancedById(row.plantDataId)
          .then((p) => ({ plantDataId: row.plantDataId, plantName: p.plantName }))
          .catch(() => null)
      )
    );
    setRows((prev) =>
      prev.map((r) => {
        const hit = results.find((x) => x && x.plantDataId === r.plantDataId);
        return hit ? { ...r, plantName: hit.plantName } : r;
      })
    );
  };

  const handleNewList = () => {
    setRows([]);
    setActiveListId(null);
    setResult(null);
  };

  const handleSaveList = (name: string) => {
    const items = rows.map((r) => ({ plantDataId: r.plantDataId, points: r.points }));
    if (activeListId) {
      updateListMutation.mutate({ listId: activeListId, data: { name, items } });
    } else {
      createListMutation.mutate({ name, items }, {
        onSuccess: (newList) => setActiveListId(newList.listId),
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
        if (activeListId === listId) setActiveListId(null);
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
        onCalculate={handleCalculate}
        isCalculating={calculateMutation.isPending}
        savedLists={savedLists}
        activeListId={activeListId}
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

      <OutputPanel result={result} />

      {manageListsOpen && (
        <ManageSavedListsModal
          lists={savedLists}
          onClose={() => setManageListsOpen(false)}
          onRename={(listId, name) =>
            updateListMutation.mutate({ listId, data: { name } })
          }
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

const GrandTotalRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 16px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const GrandTotalLabel = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const GrandTotalValue = styled.span`
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary[500]};
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
  padding: 20px 24px;
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
  padding: 24px;
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
