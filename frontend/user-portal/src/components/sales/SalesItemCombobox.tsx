/**
 * SalesItemCombobox — T-201.2
 *
 * A typeahead combobox that searches sale items via the useSaleItemFinanceExtList hook
 * (data source: GET /v1/finance/item-finance-ext?isSellable=true).
 *
 * Designed for use inside sales doc line-item tables.  When the user picks an item,
 * onChange is called with the full SalesItemSelection — the parent stamps itemId (UUID),
 * itemCode, itemName, and salesTaxCode onto the line via setValue.
 *
 * Mirrors the CustomerCombobox structural pattern:
 *  - Selected state = read-only chip with a clear button (X).
 *  - Unselected state = search input with typeahead dropdown.
 *  - Keyboard: ↓/↑ navigate, Enter selects, Escape closes.
 *  - Click-outside closes without selecting.
 *  - ARIA: role="combobox" + role="listbox".
 *
 * Data layer differences vs CustomerCombobox:
 *  - All items are fetched once (they are master data, small set) and filtered
 *    client-side — no per-keystroke HTTP calls needed.
 *  - Minimum query length is 1 character (items list is small, ~1–100 entries).
 *
 * From-X mode: pass disabled=true when the item is locked to a source document.
 * The chip still renders so the user sees what was pre-filled, but cannot clear.
 *
 * Styled-components: all transient props use the $ prefix (project rule, UI-Standards.md).
 */

import {
  useState,
  useEffect,
  useRef,
  useId,
  useLayoutEffect,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { useSaleItemFinanceExtList } from '../../hooks/queries/useSaleItemFinanceExt';
import { useAuthStore } from '../../stores/auth.store';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SalesItemSelection {
  /** UUID — the canonical identifier stored in the sales doc. */
  itemId: string;
  /** Human-readable code, e.g. "TOM-SEED". */
  itemCode: string;
  /** Display name, e.g. "Tomato - Seeds". */
  itemName: string;
  /** Tax code string from the finance ext, e.g. "S".  Null if not configured. */
  salesTaxCode: string | null;
  /** Revenue GL account ID (informational — backend re-snapshots at create). */
  revenueAccountId: string | null;
  /** COGS GL account ID (informational). */
  cogsAccountId: string | null;
}

export interface SalesItemComboboxProps {
  /** Currently selected itemId (UUID), or empty string for unselected. */
  valueItemId: string;
  /**
   * Display label shown in the chip when an item is selected.
   * Pass the current itemCode (or a combined "CODE — Name" string).
   * If empty, we derive it from valueItemId against the loaded list.
   */
  valueItemCode?: string;
  /** Called when the user picks an item from the dropdown OR clears. */
  onChange: (item: SalesItemSelection | null) => void;
  /** Optional placeholder text. */
  placeholder?: string;
  /**
   * Disabled state — passes through to the input and hides the clear button.
   * Use in from-X modes where the item is locked to the source document.
   */
  disabled?: boolean;
  /** Error state visual — renders a red border on the input/chip. */
  hasError?: boolean;
  /** aria-describedby forwarded to the input. */
  describedBy?: string;
  /**
   * T-201.8 — when set to `false`, the dropdown only shows service/fee items
   * (items where isStock=false on the finance extension).
   *
   * Pass `false` on direct-create AR Invoice / AR Credit Note / Return Request forms
   * to prevent users from accidentally selecting physical stock items.
   * Omit (or pass `undefined`) to show all sellable items (default behaviour).
   */
  filterIsStock?: boolean;
}

// ─── Styled components ─────────────────────────────────────────────────────────
// All transient props use the $ prefix per project rules (UI-Standards.md).

const Wrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ComboInput = styled.input<{ $hasError?: boolean }>`
  padding: 7px 8px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 6px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 2px
      ${({ $hasError }) =>
        $hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

/** Read-only chip shown when an item is selected. */
const SelectedChip = styled.div<{ $hasError?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 10px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 6px;
  background: ${({ $disabled, theme }) =>
    $disabled ? theme.colors.surface : theme.colors.primary[50] ?? '#EFF6FF'};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  min-height: 32px;
  opacity: ${({ $disabled }) => ($disabled ? 0.85 : 1)};
`;

const ChipLabel = styled.span`
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ClearButton = styled.button`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background 120ms ease-in-out, color 120ms ease-in-out;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #EF4444;
  }

  &:focus-visible {
    outline: 2px solid #EF4444;
    outline-offset: 2px;
  }
`;

/**
 * DropdownPanel — portaled to document.body via createPortal.
 * Uses fixed positioning so it escapes any overflow:hidden ancestor
 * (e.g. the <td> inside the sales doc lines table).
 * Coordinates are calculated from the trigger input's getBoundingClientRect()
 * in useLayoutEffect and stored in panelStyle state.
 *
 * z-index 9999: floats above the entire page layout.
 */
interface DropdownPanelStyle {
  top: number;
  left: number;
  width: number;
  /** Optional: flip above the input if not enough space below */
  bottom?: number;
}

const Dropdown = styled.ul<{ $style: DropdownPanelStyle }>`
  position: fixed;
  top: ${({ $style }) =>
    $style.bottom !== undefined ? 'auto' : `${$style.top}px`};
  bottom: ${({ $style }) =>
    $style.bottom !== undefined ? `${$style.bottom}px` : 'auto'};
  left: ${({ $style }) => `${$style.left}px`};
  width: ${({ $style }) => `${$style.width}px`};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  max-height: 260px;
  overflow-y: auto;
  z-index: 9999;
  list-style: none;
  margin: 0;
  padding: 4px 0;
`;

const DropdownItem = styled.li<{ $highlighted?: boolean }>`
  padding: 8px 12px;
  cursor: pointer;
  background: ${({ $highlighted, theme }) =>
    $highlighted ? theme.colors.surface : 'transparent'};
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background 80ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const ItemCode = styled.strong`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 600;
`;

const ItemName = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TaxBadge = styled.span`
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 1px 5px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: 6px;
  vertical-align: middle;
`;

const DropdownState = styled.li`
  padding: 12px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`;

const Spinner = styled.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 6px;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

// ─── Component ─────────────────────────────────────────────────────────────────

export function SalesItemCombobox({
  valueItemId,
  valueItemCode,
  onChange,
  placeholder = 'Type to search items…',
  disabled = false,
  hasError = false,
  describedBy,
  filterIsStock,
}: SalesItemComboboxProps) {
  const listboxId = useId();

  // Pull orgId from auth store — same pattern as all other hooks in sales forms.
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  // T-201.8: when filterIsStock=false, request only service items from the API
  // so React Query caches stock-filtered and full lists under separate keys.
  const { data: allItems = [], isLoading: itemsLoading } = useSaleItemFinanceExtList(
    orgId,
    filterIsStock !== undefined ? { isStock: filterIsStock } : undefined,
  );

  // Only expose isSellable=true items.
  // When filterIsStock=false the API already excludes stock items, but we still
  // apply the isSellable guard here as a belt-and-suspenders filter.
  const sellableItems = allItems.filter((it) => it.isSellable);

  // ── Internal state ─────────────────────────────────────────────────────────

  // Text currently shown in the search input.
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Portal panel positioning ───────────────────────────────────────────────
  // Stored as state so a re-render propagates updated coordinates after scroll.

  const [panelStyle, setPanelStyle] = useState<DropdownPanelStyle>({
    top: 0,
    left: 0,
    width: 200,
  });

  const recalcPosition = useCallback(() => {
    const trigger = wrapperRef.current;
    if (!trigger || !open) return;

    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const DROPDOWN_MAX_HEIGHT = 260;
    const GAP = 4;

    const spaceBelow = viewportHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;

    if (spaceBelow >= DROPDOWN_MAX_HEIGHT || spaceBelow >= spaceAbove) {
      // Open below the trigger.
      setPanelStyle({
        top: rect.bottom + GAP,
        left: rect.left,
        width: rect.width,
      });
    } else {
      // Flip above the trigger (not enough room below).
      setPanelStyle({
        top: 0,
        left: rect.left,
        width: rect.width,
        bottom: viewportHeight - rect.top + GAP,
      });
    }
  }, [open]);

  // ── Derived: filtered items ────────────────────────────────────────────────

  const filtered = query.trim().length === 0
    ? sellableItems
    : sellableItems.filter((it) => {
        const q = query.toLowerCase();
        return (
          (it.itemCode ?? '').toLowerCase().includes(q) ||
          (it.itemName ?? '').toLowerCase().includes(q)
        );
      });

  // Limit dropdown to 20 results for UX.
  const displayItems = filtered.slice(0, 20);

  // ── Resolve display label for chip ────────────────────────────────────────

  const selectedItem = valueItemId
    ? sellableItems.find((it) => it.itemId === valueItemId) ?? null
    : null;

  // Prefer explicit valueItemCode prop; fall back to resolved item's code.
  const chipLabel = valueItemCode && valueItemCode.trim()
    ? valueItemCode
    : selectedItem
    ? `${selectedItem.itemCode ?? ''} — ${selectedItem.itemName ?? ''}`
    : '';

  // ── Recalculate panel position when open state changes ────────────────────

  useLayoutEffect(() => {
    recalcPosition();
  }, [open, recalcPosition]);

  // ── Reposition on scroll / resize while open ──────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => recalcPosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, recalcPosition]);

  // ── Click-outside handler ──────────────────────────────────────────────────
  // Must also check if the click target is inside the portaled dropdown panel
  // (which is rendered outside wrapperRef in the DOM).

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      // Check if click is inside the wrapper OR inside the portaled dropdown.
      const target = e.target as Node;
      const insideWrapper = wrapperRef.current?.contains(target) ?? false;
      // The portaled dropdown has listboxId as its element id.
      const portalEl = document.getElementById(listboxId);
      const insidePortal = portalEl?.contains(target) ?? false;

      if (!insideWrapper && !insidePortal) {
        setOpen(false);
        setHighlightedIndex(-1);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [listboxId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleFocus = () => {
    setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < displayItems.length - 1 ? prev + 1 : prev,
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < displayItems.length) {
          selectItem(displayItems[highlightedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
        setQuery('');
        break;

      default:
        break;
    }
  };

  const selectItem = (item: (typeof sellableItems)[number]) => {
    setOpen(false);
    setHighlightedIndex(-1);
    setQuery('');
    onChange({
      itemId: item.itemId,
      itemCode: item.itemCode ?? '',
      itemName: item.itemName ?? '',
      salesTaxCode: item.salesTaxCode ?? null,
      revenueAccountId: item.revenueAccountId ?? null,
      cogsAccountId: item.cogsAccountId ?? null,
    });
  };

  const handleClear = () => {
    setQuery('');
    setOpen(false);
    setHighlightedIndex(-1);
    onChange(null);
  };

  // ── Dropdown content ───────────────────────────────────────────────────────

  const renderDropdownContent = () => {
    if (itemsLoading) {
      return (
        <DropdownState role="status" aria-live="polite">
          <Spinner aria-hidden="true" />
          Loading items…
        </DropdownState>
      );
    }

    if (sellableItems.length === 0) {
      return (
        <DropdownState>
          No sellable items configured. Add items in Finance → Sales Items.
        </DropdownState>
      );
    }

    if (displayItems.length === 0) {
      return (
        <DropdownState>
          No items match "{query}".
        </DropdownState>
      );
    }

    return displayItems.map((item, index) => (
      <DropdownItem
        key={item.itemId}
        role="option"
        aria-selected={index === highlightedIndex}
        id={`${listboxId}-option-${index}`}
        $highlighted={index === highlightedIndex}
        onMouseDown={(e) => {
          // Use mousedown (not click) to fire before input blur.
          e.preventDefault();
          selectItem(item);
        }}
        onMouseEnter={() => setHighlightedIndex(index)}
      >
        <ItemCode>
          {item.itemCode ?? '(no code)'}
          {item.salesTaxCode && (
            <TaxBadge aria-label={`Tax: ${item.salesTaxCode}`}>
              {item.salesTaxCode}
            </TaxBadge>
          )}
        </ItemCode>
        <ItemName>{item.itemName ?? '—'}</ItemName>
      </DropdownItem>
    ));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasSelection = Boolean(valueItemId);

  return (
    <Wrapper ref={wrapperRef}>
      {hasSelection ? (
        // Chip state: show selected item; X to clear (hidden when disabled).
        <SelectedChip
          $hasError={hasError}
          $disabled={disabled}
          aria-label="Selected item"
        >
          <ChipLabel title={chipLabel}>{chipLabel || valueItemId}</ChipLabel>
          {!disabled && (
            <ClearButton
              type="button"
              onClick={handleClear}
              aria-label={`Clear selected item ${chipLabel}`}
              title="Clear selection"
            >
              ×
            </ClearButton>
          )}
        </SelectedChip>
      ) : (
        <>
          <ComboInput
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={
              open && highlightedIndex >= 0
                ? `${listboxId}-option-${highlightedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            aria-label="Search item"
            aria-describedby={describedBy}
            autoComplete="off"
            placeholder={placeholder}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            disabled={disabled}
            $hasError={hasError}
          />

          {open && createPortal(
            <Dropdown
              id={listboxId}
              role="listbox"
              aria-label="Item search results"
              $style={panelStyle}
            >
              {renderDropdownContent()}
            </Dropdown>,
            document.body,
          )}
        </>
      )}
    </Wrapper>
  );
}
