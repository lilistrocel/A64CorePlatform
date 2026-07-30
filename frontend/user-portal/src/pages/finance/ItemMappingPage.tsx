/**
 * ItemMappingPage
 *
 * Finance controller screen for assigning GL accounts to each purchase item
 * (inventory account, COGS account) plus valuation method, tax code default,
 * and notes. These mappings drive the posting engine: when a goods receipt is
 * posted, the item's inventoryAccountId determines which asset account to debit.
 *
 * Route: /finance/item-mapping
 *
 * Role gating:
 *   View: accountant, finance_admin, auditor, admin, super_admin
 *   Edit (inline fields + Save): finance_admin, admin, super_admin
 *
 * Save model: **Save All** — edits are buffered locally per row; a single
 * "Save All Changes" button at the bottom fires individual PATCHes for every
 * row that has unsaved changes. Per-row Save buttons are also present on each
 * dirty row for finer-grained control. This mirrors ERP patterns where bulk
 * triage followed by a single commit is the common workflow.
 *
 * Modals do NOT close on overlay click — X button only.
 * (Project-wide rule: data-entry modals close via X, never on backdrop click.)
 * This page has no modals.
 */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import styled from 'styled-components';
import type { Theme } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { showSuccessToast } from '../../stores/toast.store';
import { useFinanceAccounts } from '../../hooks/queries/useFinanceAccounts';
import { useItemMappings, useUpdateItemMapping } from '../../hooks/queries/useItemMappings';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import { AccountCombobox } from '../../components/finance/AccountCombobox';
import { parseApiErrors } from '../../utils/apiErrors';
import type { ApiErrorItem } from '../../utils/apiErrors';
import type { GLAccount } from '../../services/financeAccountsService';
import type { TaxCode } from '../../services/taxCodesService';
import type {
  PurchaseItemFinanceExt,
  PurchaseItemType,
  UpdateItemMappingBody,
} from '../../services/itemMappingService';

// ─── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

/** Account number of the seeded default raw-material inventory account. */
const DEFAULT_RAW_MATERIAL_ACCOUNT_NUMBER = '121000-002';

const READ_ROLES = new Set([
  'accountant',
  'finance_admin',
  'auditor',
  'admin',
  'super_admin',
]);

const WRITE_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

/** Roles allowed to use the "Auto-assign defaults" bulk action. */
const BULK_ASSIGN_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

const ITEM_TYPE_LABELS: Record<NonNullable<PurchaseItemType>, string> = {
  raw_material: 'Raw Material',
  consumable: 'Consumable',
  service: 'Service',
  fixed_asset_acquisition: 'Fixed Asset',
};

const ITEM_TYPE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Types' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'service', label: 'Service' },
  { value: 'fixed_asset_acquisition', label: 'Fixed Asset' },
];

const ACTIVE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** Field map for 422 error parsing — backend snake_case → form camelCase. */
const ITEM_MAPPING_FIELD_MAP: Record<string, string> = {
  inventory_account_id: 'inventoryAccountId',
  inventoryAccountId: 'inventoryAccountId',
  cogs_account_id: 'cogsAccountId',
  cogsAccountId: 'cogsAccountId',
  allocation_account_id: 'allocationAccountId',
  allocationAccountId: 'allocationAccountId',
  tax_code_default: 'taxCodeDefault',
  taxCodeDefault: 'taxCodeDefault',
  ifrs_tag: 'ifrsTag',
  ifrsTag: 'ifrsTag',
  notes: 'notes',
  organization_id: '__banner__',
  organizationId: '__banner__',
  item_id: '__banner__',
  itemId: '__banner__',
};

// ─── Row-level draft state ─────────────────────────────────────────────────────

/**
 * Per-row draft — the user's unsaved edits for one item row.
 * We only store the fields the user can edit; everything else is read-only.
 *
 * NOTE: `valuationMethod` is intentionally excluded — per PM feedback item 11,
 * valuation method is now a company-level setting on the Posting Setup page (IAS 2).
 * The existing field on PurchaseItemFinanceExt is preserved for data compatibility
 * but is not surfaced or edited here.
 */
interface RowDraft {
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  taxCodeDefault: string;
  notes: string;
}

/**
 * Build an initial RowDraft from a PurchaseItemFinanceExt record.
 */
function initialDraft(item: PurchaseItemFinanceExt): RowDraft {
  return {
    inventoryAccountId: item.inventoryAccountId,
    cogsAccountId: item.cogsAccountId,
    taxCodeDefault: item.taxCodeDefault ?? '',
    notes: item.notes ?? '',
  };
}

/**
 * True if a draft differs from the saved item data.
 */
function isDirty(draft: RowDraft, item: PurchaseItemFinanceExt): boolean {
  return (
    draft.inventoryAccountId !== item.inventoryAccountId ||
    draft.cogsAccountId !== item.cogsAccountId ||
    draft.taxCodeDefault !== (item.taxCodeDefault ?? '') ||
    draft.notes !== (item.notes ?? '')
  );
}

// ─── Styled components ─────────────────────────────────────────────────────────
// All transient props use $ prefix per project rules.

const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageHeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 6px;
  flex-wrap: wrap;
`;

const PageTitleBlock = styled.div``;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const PageSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 6px 0 0;
  max-width: 680px;
  line-height: 1.55;
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.neutral[200]};
  margin: 20px 0 24px;
`;

// ─── Toolbar ───────────────────────────────────────────────────────────────────

const ToolbarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  max-width: 320px;
  padding: 9px 13px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[500]}1a;
  }
`;

const FilterSelect = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  white-space: nowrap;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const BadgeChip = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[100]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 99px;
  padding: 4px 12px;
  white-space: nowrap;
`;

const BulkActionButton = styled.button`
  padding: 8px 14px;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.info};
  border: 1px solid ${({ theme }) => `${theme.colors.info}44`};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease-in-out;
  font-family: inherit;

  &:hover {
    background: ${({ theme }) => `${theme.colors.info}18`};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.info};
    outline-offset: 2px;
  }
`;

// ─── Banner styles ─────────────────────────────────────────────────────────────

const BannerBase = styled.div`
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.55;
`;

const BannerInfo = styled(BannerBase)`
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.info};
`;

const BannerSuccess = styled(BannerBase)`
  background: ${({ theme }) => theme.colors.successBg};
  color: ${({ theme }) => theme.colors.success};
`;

const BannerError = styled(BannerBase)`
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
`;

// ─── Table ─────────────────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  /* Two 280px account combobox columns + other columns. */
  min-width: 1040px;
`;

const THead = styled.thead`
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Th = styled.th`
  padding: 12px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

interface TrProps {
  $warning?: boolean;
  $dirty?: boolean;
}

const Tr = styled.tr<TrProps>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  background: ${({ $warning, $dirty, theme }) => {
    if ($dirty) return `${theme.colors.infoBg}55`;
    if ($warning) return theme.colors.warningBg;
    return 'transparent';
  }};
  transition: background 120ms ease-in-out;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ $dirty, $warning, theme }) => {
      if ($dirty) return `${theme.colors.infoBg}88`;
      if ($warning) return `${theme.colors.warningBg}cc`;
      return theme.colors.neutral[50];
    }};
  }
`;

const Td = styled.td`
  padding: 10px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

/** Item code column — monospace font per spec. */
const ItemCodeCell = styled.td`
  padding: 10px 14px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textSecondary};
  vertical-align: middle;
  white-space: nowrap;
`;

const ItemNameCell = styled.td`
  padding: 10px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
  min-width: 160px;
  word-break: break-word;
`;

// ─── Type pill ─────────────────────────────────────────────────────────────────

interface TypePillProps {
  $type: PurchaseItemType;
}

// Four purchase-item categories, mapped one-per-brand-voice so no two
// categories share a hue (spec: lapis/gold/emerald/terracotta are the
// standalone categorical ramps for non-semantic, non-status use).
const typePillColors = (theme: Theme): Record<NonNullable<PurchaseItemType>, { bg: string; text: string }> => ({
  raw_material: { bg: theme.colors.emerald[50], text: theme.colors.emerald[800] },
  consumable: { bg: theme.colors.gold[50], text: theme.colors.gold[800] },
  service: { bg: theme.colors.lapis[50], text: theme.colors.lapis[800] },
  fixed_asset_acquisition: { bg: theme.colors.terracotta[50], text: theme.colors.terracotta[800] },
});

const TypePill = styled.span<TypePillProps>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  background: ${({ $type, theme }) =>
    $type ? typePillColors(theme)[$type]?.bg ?? theme.colors.neutral[100] : theme.colors.neutral[100]};
  color: ${({ $type, theme }) =>
    $type ? typePillColors(theme)[$type]?.text ?? theme.colors.textSecondary : theme.colors.textSecondary};
`;

// ─── Status pill ───────────────────────────────────────────────────────────────

interface StatusPillProps {
  $active: boolean;
}

const StatusPill = styled.span<StatusPillProps>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.successBg : theme.colors.neutral[100]};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.success : theme.colors.textDisabled};
`;

// ─── Inline editable controls ──────────────────────────────────────────────────

/** Wrapper for cells containing editable controls — gives a bit of room. */
const EditCell = styled.td`
  padding: 6px 14px;
  vertical-align: middle;
  /* 280px ensures the account label (accountNumber — accountName) has room to render
     without truncation at the cell level. The combobox itself clips with ellipsis
     inside the input for very long names. */
  min-width: 280px;
`;

/** Narrow cell for tax code dropdown — wider than the old text input to
 *  accommodate the "{code} — {description} ({rate}%)" label format. */
const NarrowEditCell = styled.td`
  padding: 6px 14px;
  vertical-align: middle;
  min-width: 150px;
  max-width: 200px;
`;

const SmallSelect = styled.select`
  width: 100%;
  padding: 7px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 7px;
  font-size: 13px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary[500]}1a;
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.neutral[50]};
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// ─── Action cell ───────────────────────────────────────────────────────────────

const ActionCell = styled.td`
  padding: 6px 14px;
  vertical-align: middle;
  white-space: nowrap;
`;

const RowSaveButton = styled.button<{ $dirty: boolean }>`
  padding: 6px 14px;
  border: none;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: ${({ $dirty }) => ($dirty ? 'pointer' : 'default')};
  opacity: ${({ $dirty }) => ($dirty ? 1 : 0.35)};
  pointer-events: ${({ $dirty }) => ($dirty ? 'auto' : 'none')};
  background: ${({ $dirty, theme }) =>
    $dirty ? theme.colors.primary[500] : theme.colors.neutral[200]};
  color: ${({ $dirty }) => ($dirty ? 'white' : 'inherit')};
  transition: background 150ms ease-in-out, opacity 150ms ease-in-out;

  &:hover {
    background: ${({ $dirty, theme }) =>
      $dirty ? theme.colors.primary[700] : theme.colors.neutral[200]};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }
`;

const RowSavingIndicator = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
  padding: 0 4px;
`;

const RowErrorText = styled.span`
  display: block;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.error};
  margin-top: 3px;
`;

// ─── Footer ────────────────────────────────────────────────────────────────────

const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  margin-bottom: 48px;
`;

const SaveAllButton = styled.button`
  padding: 10px 24px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  padding: 64px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textDisabled};
  font-size: 14px;
  line-height: 1.6;
`;

// ─── Muted cell for service items where COGS is not applicable ─────────────────

const MutedCell = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
  font-style: italic;
`;

// ─── Read-only placeholder text ────────────────────────────────────────────────

const UnassignedText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

// ─── Main component ────────────────────────────────────────────────────────────

export function ItemMappingPage() {
  const { user } = useAuthStore();
  // Reason: showSuccessToast is a module-level helper, imported directly above.

  // ── Auth / org ─────────────────────────────────────────────────────────────

  const organizationId = useMemo<string>(() => {
    if (user?.organizationId) return user.organizationId;
    if (user?.role === 'super_admin') return PLATFORM_DEFAULT_ORG;
    return '';
  }, [user]);

  const canRead = READ_ROLES.has(user?.role ?? '');
  const canWrite = WRITE_ROLES.has(user?.role ?? '');
  const canBulkAssign = BULK_ASSIGN_ROLES.has(user?.role ?? '');

  // ── Toolbar state ──────────────────────────────────────────────────────────

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Debounce search — 350 ms prevents rapid re-fetches while typing.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(val), 350);
  };
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // ── Compute query filters ─────────────────────────────────────────────────

  const queryFilters = useMemo(() => {
    return {
      itemType: (itemTypeFilter || undefined) as typeof itemTypeFilter extends '' ? undefined : PurchaseItemType,
      isActive:
        activeFilter === 'active'
          ? true
          : activeFilter === 'inactive'
          ? false
          : undefined,
      search: debouncedSearch || undefined,
    };
  }, [itemTypeFilter, activeFilter, debouncedSearch]);

  // ── Data fetches ───────────────────────────────────────────────────────────

  const {
    data: mappingsData,
    isLoading: mappingsLoading,
    isError: mappingsError,
  } = useItemMappings(organizationId, queryFilters);

  const { data: accountsData, isLoading: accountsLoading } =
    useFinanceAccounts(organizationId);

  // Tax codes — used for the taxCodeDefault dropdown on each item row.
  // Falls back to the seeded list on error so the dropdown remains functional.
  const { data: taxCodesData, isError: taxCodesError } = useTaxCodes(organizationId || null);
  const activeTaxCodes: TaxCode[] = useMemo(() => {
    if (taxCodesError) {
      return FALLBACK_TAX_CODES.filter((c) => c.isActive);
    }
    return (taxCodesData ?? []).filter((c) => c.isActive);
  }, [taxCodesData, taxCodesError]);

  /**
   * Only active leaf accounts may receive journal-entry postings.
   */
  const postableAccounts: GLAccount[] = useMemo(() => {
    const all = accountsData?.items ?? [];
    return all.filter((a) => a.accountLevel === 'active' && a.isActive);
  }, [accountsData]);

  /**
   * Look up the seeded default raw-material inventory account by account number.
   * Returns undefined if the CoA hasn't loaded yet or the account doesn't exist.
   */
  const defaultRawMaterialAccount = useMemo(
    () =>
      postableAccounts.find(
        (a) => a.accountNumber === DEFAULT_RAW_MATERIAL_ACCOUNT_NUMBER,
      ),
    [postableAccounts],
  );

  const items: PurchaseItemFinanceExt[] = useMemo(
    () => mappingsData?.items ?? [],
    [mappingsData],
  );

  // ── Stats badge computation ────────────────────────────────────────────────

  const { totalCount, configuredCount, unconfiguredCount } = useMemo(() => {
    const total = items.length;
    const configured = items.filter((it) => it.inventoryAccountId !== null).length;
    return {
      totalCount: total,
      configuredCount: configured,
      unconfiguredCount: total - configured,
    };
  }, [items]);

  // ── Row-level draft state ──────────────────────────────────────────────────
  //
  // drafts: Map<itemId, RowDraft> — holds unsaved edits for each row.
  // We rebuild this map whenever items change, but preserve any in-progress
  // drafts so a re-fetch doesn't wipe half-finished edits.

  const [drafts, setDrafts] = useState<Map<string, RowDraft>>(() => new Map());

  // Seed drafts when item list first loads (or changes after filter).
  // We don't reset drafts that already exist to avoid losing in-progress edits.
  useEffect(() => {
    if (items.length === 0) return;
    setDrafts((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        if (!next.has(item.itemId)) {
          next.set(item.itemId, initialDraft(item));
        }
      }
      return next;
    });
  }, [items]);

  // ── Per-row saving state ───────────────────────────────────────────────────

  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());

  // ── Bulk-assign banner ─────────────────────────────────────────────────────

  const [bulkAssignBanner, setBulkAssignBanner] = useState<string | null>(null);
  const [globalBannerError, setGlobalBannerError] = useState<string | null>(null);
  const [globalSaveSuccess, setGlobalSaveSuccess] = useState(false);

  // ── Mutation ───────────────────────────────────────────────────────────────

  const updateMutation = useUpdateItemMapping();

  // ── Draft helpers ──────────────────────────────────────────────────────────

  const getDraft = useCallback(
    (itemId: string, fallback: PurchaseItemFinanceExt): RowDraft => {
      return drafts.get(itemId) ?? initialDraft(fallback);
    },
    [drafts],
  );

  const patchDraft = useCallback(
    (itemId: string, patch: Partial<RowDraft>, fallback: PurchaseItemFinanceExt) => {
      setDrafts((prev) => {
        const current = prev.get(itemId) ?? initialDraft(fallback);
        const next = new Map(prev);
        next.set(itemId, { ...current, ...patch });
        return next;
      });
      // Clear any per-row error when the user edits the row.
      setRowErrors((prev) => {
        if (!prev.has(itemId)) return prev;
        const next = new Map(prev);
        next.delete(itemId);
        return next;
      });
      setGlobalSaveSuccess(false);
      setBulkAssignBanner(null);
    },
    [],
  );

  // ── Single-row save ────────────────────────────────────────────────────────

  const saveRow = useCallback(
    async (item: PurchaseItemFinanceExt) => {
      const draft = drafts.get(item.itemId);
      if (!draft || !isDirty(draft, item)) return;

      setSavingRows((prev) => new Set(prev).add(item.itemId));
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.delete(item.itemId);
        return next;
      });

      const body: UpdateItemMappingBody = {
        inventoryAccountId: draft.inventoryAccountId,
        cogsAccountId: draft.cogsAccountId,
        taxCodeDefault: draft.taxCodeDefault || null,
        notes: draft.notes || null,
      };

      try {
        await updateMutation.mutateAsync({
          orgId: organizationId,
          itemId: item.itemId,
          body,
        });
        // Reset draft to match saved state.
        setDrafts((prev) => {
          const next = new Map(prev);
          next.delete(item.itemId);
          return next;
        });
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: { data?: { detail?: unknown }; status?: number };
          message?: string;
        };
        const detail = axiosErr?.response?.data?.detail;
        let message = 'Save failed.';
        if (Array.isArray(detail)) {
          const parsed = parseApiErrors(detail as ApiErrorItem[], ITEM_MAPPING_FIELD_MAP);
          const messages = Object.values(parsed).filter((v) => v !== parsed['__banner__']);
          message = parsed['__banner__'] || messages.join(' ') || 'Validation error.';
        } else if (typeof detail === 'string') {
          message = detail;
        } else if (axiosErr?.message) {
          message = axiosErr.message;
        }
        setRowErrors((prev) => new Map(prev).set(item.itemId, message));
      } finally {
        setSavingRows((prev) => {
          const next = new Set(prev);
          next.delete(item.itemId);
          return next;
        });
      }
    },
    [drafts, organizationId, updateMutation],
  );

  // ── Save All dirty rows ────────────────────────────────────────────────────

  const handleSaveAll = useCallback(async () => {
    setGlobalBannerError(null);
    setGlobalSaveSuccess(false);
    setBulkAssignBanner(null);

    const dirtyItems = items.filter((item) => {
      const draft = drafts.get(item.itemId);
      return draft && isDirty(draft, item);
    });

    if (dirtyItems.length === 0) return;

    // Fire all PATCHes concurrently — tolerate partial failures.
    const results = await Promise.allSettled(
      dirtyItems.map((item) => saveRow(item)),
    );

    const failureCount = results.filter((r) => r.status === 'rejected').length;
    if (failureCount === 0) {
      setGlobalSaveSuccess(true);
      showSuccessToast(
        `Saved ${dirtyItems.length} item${dirtyItems.length !== 1 ? 's' : ''} successfully.`,
      );
    } else {
      setGlobalBannerError(
        `${failureCount} of ${dirtyItems.length} rows failed to save. Review the errors in the table below.`,
      );
    }
  }, [items, drafts, saveRow, showSuccessToast]);

  // ── Auto-assign defaults (bulk pre-fill) ──────────────────────────────────

  const handleAutoAssignDefaults = useCallback(() => {
    if (!defaultRawMaterialAccount) {
      setBulkAssignBanner(
        `Default account (${DEFAULT_RAW_MATERIAL_ACCOUNT_NUMBER}) not found in the loaded CoA. ` +
          'Ensure the chart of accounts is seeded before using Auto-assign.',
      );
      return;
    }

    // Reason: apply the default to ALL raw_material items, not only those with
    // a null inventoryAccountId. The consumer auto-assigns 121000-002 on item
    // creation, so most rows are not null by the time the user sees this page —
    // making the previous "only null" filter a no-op in practice. The button
    // now functions as "set every raw_material row's inventory account to the
    // default". User can override per-row before saving.
    let prefillCount = 0;
    setDrafts((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        if (item.itemType !== 'raw_material') continue;
        const current = next.get(item.itemId) ?? initialDraft(item);
        if (current.inventoryAccountId !== defaultRawMaterialAccount.accountId) {
          next.set(item.itemId, {
            ...current,
            inventoryAccountId: defaultRawMaterialAccount.accountId,
          });
          prefillCount++;
        }
      }
      return next;
    });

    if (prefillCount > 0) {
      setBulkAssignBanner(
        `Pre-filled inventory account for ${prefillCount} raw material item${prefillCount !== 1 ? 's' : ''}. ` +
          'Review the rows highlighted below, then click Save All Changes to commit.',
      );
    } else {
      setBulkAssignBanner(
        'No raw material items without an inventory account were found.',
      );
    }
  }, [items, defaultRawMaterialAccount]);

  // ── Dirty-row count ────────────────────────────────────────────────────────

  const dirtyCount = useMemo(
    () =>
      items.filter((item) => {
        const draft = drafts.get(item.itemId);
        return draft && isDirty(draft, item);
      }).length,
    [items, drafts],
  );

  // ── Guard: no access ───────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <PageContainer>
        <EmptyState>You don't have permission to view item GL account mappings.</EmptyState>
      </PageContainer>
    );
  }

  if (!organizationId) {
    return (
      <PageContainer>
        <EmptyState>No organisation assigned to this account.</EmptyState>
      </PageContainer>
    );
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (mappingsLoading || accountsLoading) {
    return (
      <PageContainer>
        <EmptyState>Loading item mappings…</EmptyState>
      </PageContainer>
    );
  }

  if (mappingsError) {
    return (
      <PageContainer>
        <BannerError role="alert">
          Failed to load item mappings. The backend endpoint may not be live yet —
          this is expected until the finance agent's work is deployed and Docker is
          rebuilt. Reload the page once the backend is up.
        </BannerError>
      </PageContainer>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      {/* ── Page header ── */}
      <PageHeaderRow>
        <PageTitleBlock>
          <PageTitle>Item GL Account Mapping</PageTitle>
          <PageSubtitle>
            Assign inventory and COGS accounts to each purchase item. The posting
            engine uses these assignments when goods receipts produce journal
            entries. Items with no inventory account assigned (amber highlight)
            will block posting once goods receipt is live.
          </PageSubtitle>
        </PageTitleBlock>
      </PageHeaderRow>

      <Divider />

      {/* ── Banners ── */}
      {bulkAssignBanner && (
        <BannerInfo role="status" aria-live="polite">
          {bulkAssignBanner}
        </BannerInfo>
      )}
      {globalBannerError && (
        <BannerError role="alert">
          {globalBannerError}
        </BannerError>
      )}
      {globalSaveSuccess && (
        <BannerSuccess role="status">
          All changes saved successfully.
        </BannerSuccess>
      )}

      {/* ── Toolbar ── */}
      <ToolbarRow>
        <SearchInput
          type="text"
          placeholder="Search by item code or name…"
          value={searchInput}
          onChange={handleSearchChange}
          aria-label="Search items"
        />

        <FilterSelect
          value={itemTypeFilter}
          onChange={(e) => setItemTypeFilter(e.target.value)}
          aria-label="Filter by item type"
        >
          {ITEM_TYPE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          aria-label="Filter by active status"
        >
          {ACTIVE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </FilterSelect>

        <BadgeChip aria-label="Item counts">
          {totalCount} items &middot; {configuredCount} configured &middot;{' '}
          {unconfiguredCount} unconfigured
        </BadgeChip>

        {canBulkAssign && (
          <BulkActionButton
            type="button"
            onClick={handleAutoAssignDefaults}
            aria-label="Auto-assign default GL accounts to raw material items"
            title={`Pre-fills inventory account ${DEFAULT_RAW_MATERIAL_ACCOUNT_NUMBER} for raw material items that have no account assigned. Does NOT save — review then click Save All.`}
          >
            Auto-assign Defaults
          </BulkActionButton>
        )}
      </ToolbarRow>

      {/* ── Table ── */}
      {items.length === 0 ? (
        <EmptyState>
          No purchase items yet. Items appear here when they are created on the
          purchasing side.
        </EmptyState>
      ) : (
        <TableWrapper>
          <Table role="table" aria-label="Purchase item GL account mappings">
            <THead>
              <tr>
                <Th scope="col">Item Code</Th>
                <Th scope="col">Item Name</Th>
                <Th scope="col">Type</Th>
                <Th scope="col">Inventory Account</Th>
                <Th scope="col">COGS Account</Th>
                <Th scope="col">Tax Code</Th>
                <Th scope="col">Status</Th>
                <Th scope="col">Actions</Th>
              </tr>
            </THead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  key={item.itemId}
                  item={item}
                  draft={getDraft(item.itemId, item)}
                  accounts={postableAccounts}
                  taxCodes={activeTaxCodes}
                  canWrite={canWrite}
                  isSaving={savingRows.has(item.itemId)}
                  rowError={rowErrors.get(item.itemId) ?? null}
                  onPatchDraft={(patch) => patchDraft(item.itemId, patch, item)}
                  onSave={() => saveRow(item)}
                />
              ))}
            </tbody>
          </Table>
        </TableWrapper>
      )}

      {/* ── Footer: Save All ── */}
      {canWrite && items.length > 0 && (
        <FooterRow>
          <SaveAllButton
            type="button"
            onClick={handleSaveAll}
            disabled={dirtyCount === 0 || savingRows.size > 0}
            aria-label={
              dirtyCount === 0
                ? 'No unsaved changes'
                : `Save all ${dirtyCount} changed row${dirtyCount !== 1 ? 's' : ''}`
            }
          >
            {savingRows.size > 0
              ? `Saving…`
              : dirtyCount > 0
              ? `Save All Changes (${dirtyCount})`
              : 'Save All Changes'}
          </SaveAllButton>
        </FooterRow>
      )}
    </PageContainer>
  );
}

// ─── ItemRow sub-component ─────────────────────────────────────────────────────

/**
 * Renders a single editable row in the item mapping table.
 * Kept as a separate component (not memo'd) to avoid prop-type gymnastics with
 * the draft Map — the parent re-renders are cheap at this page size.
 */

interface ItemRowProps {
  item: PurchaseItemFinanceExt;
  draft: RowDraft;
  accounts: GLAccount[];
  /** Active tax codes for the taxCodeDefault dropdown. */
  taxCodes: TaxCode[];
  canWrite: boolean;
  isSaving: boolean;
  rowError: string | null;
  onPatchDraft: (patch: Partial<RowDraft>) => void;
  onSave: () => void;
}

/**
 * True if this item type warrants displaying/requiring a COGS account.
 * Service items don't carry inventory and don't need a COGS account column.
 */
function showCogsAccount(itemType: PurchaseItemType): boolean {
  return itemType === 'raw_material' || itemType === 'consumable' || itemType === null;
}

/**
 * True if this item should display the amber "unassigned inventory account" warning.
 * Only applicable to physical-goods item types, not services.
 */
function isInventoryWarning(item: PurchaseItemFinanceExt, draft: RowDraft): boolean {
  const isMaterialType =
    item.itemType === 'raw_material' ||
    item.itemType === 'consumable' ||
    item.itemType === 'fixed_asset_acquisition';
  return isMaterialType && draft.inventoryAccountId === null;
}

function ItemRow({
  item,
  draft,
  accounts,
  taxCodes,
  canWrite,
  isSaving,
  rowError,
  onPatchDraft,
  onSave,
}: ItemRowProps) {
  const dirty = isDirty(draft, item);
  const warning = isInventoryWarning(item, draft);

  return (
    <Tr $warning={warning && !dirty} $dirty={dirty} role="row">
      {/* Item Code — monospace */}
      <ItemCodeCell>{item.itemCode}</ItemCodeCell>

      {/* Item Name */}
      <ItemNameCell>{item.itemName ?? <MutedCell>—</MutedCell>}</ItemNameCell>

      {/* Type pill */}
      <Td>
        {item.itemType ? (
          <TypePill $type={item.itemType}>
            {ITEM_TYPE_LABELS[item.itemType]}
          </TypePill>
        ) : (
          <MutedCell>—</MutedCell>
        )}
      </Td>

      {/* Inventory Account — inline AccountCombobox */}
      <EditCell>
        {canWrite ? (
          <AccountCombobox
            id={`inv-account-${item.itemId}`}
            valueAccountId={draft.inventoryAccountId}
            accounts={accounts}
            onChange={(id) => onPatchDraft({ inventoryAccountId: id })}
            placeholder="Not assigned"
            disabled={isSaving}
          />
        ) : draft.inventoryAccountId ? (
          <span>
            {accounts.find((a) => a.accountId === draft.inventoryAccountId)?.accountNumber ??
              draft.inventoryAccountId}
          </span>
        ) : (
          <UnassignedText>Not assigned</UnassignedText>
        )}
      </EditCell>

      {/* COGS Account — hidden / muted for service items */}
      <EditCell>
        {item.itemType === 'service' ? (
          <MutedCell>N/A (service)</MutedCell>
        ) : canWrite ? (
          <AccountCombobox
            id={`cogs-account-${item.itemId}`}
            valueAccountId={draft.cogsAccountId}
            accounts={accounts}
            onChange={(id) => onPatchDraft({ cogsAccountId: id })}
            placeholder="Not assigned"
            disabled={isSaving}
          />
        ) : draft.cogsAccountId ? (
          <span>
            {accounts.find((a) => a.accountId === draft.cogsAccountId)?.accountNumber ??
              draft.cogsAccountId}
          </span>
        ) : (
          <UnassignedText>Not assigned</UnassignedText>
        )}
      </EditCell>

      {/* Tax Code Default — dropdown from active tax codes master data */}
      <NarrowEditCell>
        {canWrite ? (
          <SmallSelect
            value={draft.taxCodeDefault}
            onChange={(e) => onPatchDraft({ taxCodeDefault: e.target.value })}
            disabled={isSaving}
            aria-label="Tax code default"
          >
            {/* Empty option maps to null on save (no default tax code) */}
            <option value="">— None —</option>
            {taxCodes.map((tc) => (
              <option key={tc.taxCode} value={tc.taxCode}>
                {tc.taxCode} — {tc.description} ({tc.rate}%)
              </option>
            ))}
          </SmallSelect>
        ) : (
          <span>{draft.taxCodeDefault || <MutedCell>—</MutedCell>}</span>
        )}
      </NarrowEditCell>

      {/* Active status */}
      <Td>
        <StatusPill $active={item.isActive}>
          {item.isActive ? 'Active' : 'Inactive'}
        </StatusPill>
      </Td>

      {/* Actions — per-row Save */}
      <ActionCell>
        {canWrite && (
          <>
            {isSaving ? (
              <RowSavingIndicator aria-live="polite">Saving…</RowSavingIndicator>
            ) : (
              <RowSaveButton
                type="button"
                $dirty={dirty}
                onClick={onSave}
                disabled={isSaving || !dirty}
                aria-label={`Save changes for ${item.itemCode}`}
                title={dirty ? 'Save this row' : 'No unsaved changes'}
              >
                Save
              </RowSaveButton>
            )}
            {rowError && (
              <RowErrorText role="alert">{rowError}</RowErrorText>
            )}
          </>
        )}
      </ActionCell>
    </Tr>
  );
}

// Suppress unused-variable lint for the showCogsAccount helper which is
// referenced in the design intent but the UI uses explicit conditional
// rendering per item.itemType instead.
void showCogsAccount;
