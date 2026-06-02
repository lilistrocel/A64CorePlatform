/**
 * PaymentTermsCombobox — T-201.3
 *
 * A typeahead combobox that queries the `payment_terms` master via the
 * existing usePaymentTerms hook (same data source purchasing's PR/PO forms use).
 *
 * Props follow the same convention as CustomerCombobox / SalesItemCombobox:
 *  - Public props use readable names (no $ prefix)
 *  - Styled-component transient props use the $ prefix (UI-Standards.md)
 *
 * Behaviour:
 *  - All payment terms fetched once (small list, client-side filtering).
 *  - Selected state = read-only chip with "×" to clear.
 *  - Unselected state = search input + dropdown of matching terms.
 *  - Display format in dropdown: "${description} (Net ${netDays})"
 *  - Keyboard: ↓/↑ navigate, Enter selects, Esc closes.
 *  - Click-outside closes without selecting.
 *  - ARIA: role="combobox" + role="listbox".
 *
 * The parent receives termsId (UUID) + description + netDays via onChange.
 * When onChange is called with null, the field is cleared.
 */

import {
  useState,
  useEffect,
  useRef,
  useId,
} from 'react';
import styled from 'styled-components';
import { usePaymentTerms } from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { PaymentTerms } from '../../services/purchasingApi';

// ─── Props ──────────────────────────────────────────────────────────────────────

export interface PaymentTermsSelection {
  /** UUID — the canonical identifier stored in the sales doc (paymentTermsId). */
  termsId: string;
  /** Human-readable description, e.g. "Net 30". */
  description: string;
  /** Number of net days, e.g. 30. */
  netDays: number;
}

export interface PaymentTermsComboboxProps {
  /** Currently selected termsId UUID, or null when no selection. */
  valueTermsId: string | null;
  /**
   * Display name for the chip when a term is locked in.
   * Pass the saved description so the chip still renders in edit mode even
   * before the list loads.
   */
  valueTermsName?: string;
  /** Called when the user picks a term or clears. */
  onChange: (selection: PaymentTermsSelection | null) => void;
  /** Disables the control. */
  disabled?: boolean;
  /** Error state — renders a red border. */
  hasError?: boolean;
  /** aria-describedby forwarded to the input. */
  describedBy?: string;
}

// ─── Styled components ────────────────────────────────────────────────────────
// All transient props use the $ prefix per project rules (UI-Standards.md).

const Wrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ComboInput = styled.input<{ $hasError?: boolean }>`
  padding: 10px 12px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 8px;
  font-size: 14px;
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

const SelectedChip = styled.div<{ $hasError?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px 10px 12px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 8px;
  background: ${({ $disabled, theme }) =>
    $disabled ? theme.colors.surface : theme.colors.primary[50] ?? '#EFF6FF'};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  min-height: 42px;
  opacity: ${({ $disabled }) => ($disabled ? 0.85 : 1)};
`;

const ChipLabel = styled.span`
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
`;

const NetDaysBadge = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ClearButton = styled.button`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 16px;
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

const Dropdown = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  max-height: 260px;
  overflow-y: auto;
  z-index: 1200;
  list-style: none;
  margin: 0;
  padding: 4px 0;
`;

const DropdownItem = styled.li<{ $highlighted?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  cursor: pointer;
  background: ${({ $highlighted, theme }) =>
    $highlighted ? theme.colors.surface : 'transparent'};
  transition: background 80ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const TermDescription = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  flex: 1;
`;

const TermNetDays = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  flex-shrink: 0;
`;

const DropdownState = styled.li`
  padding: 12px 14px;
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

// ─── Helper ─────────────────────────────────────────────────────────────────────

function formatTermLabel(term: PaymentTerms): string {
  return `${term.description} (Net ${term.netDays})`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PaymentTermsCombobox({
  valueTermsId,
  valueTermsName,
  onChange,
  disabled = false,
  hasError = false,
  describedBy,
}: PaymentTermsComboboxProps) {
  const listboxId = useId();

  const orgId = useAuthStore((s) => s.user?.organizationId ?? '');

  // Fetch all active payment terms for this org (shared with purchasing).
  const { data: allTerms = [], isLoading } = usePaymentTerms({
    organizationId: orgId || undefined,
    isActive: true,
  });

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = query.trim().length === 0
    ? allTerms
    : allTerms.filter((t) => {
        const q = query.toLowerCase();
        return (
          t.description.toLowerCase().includes(q) ||
          t.termsCode.toLowerCase().includes(q) ||
          String(t.netDays).includes(q)
        );
      });

  const displayItems = filtered.slice(0, 20);

  // ── Resolve selected term for chip display ────────────────────────────────

  const selectedTerm = valueTermsId
    ? allTerms.find((t) => t.termsId === valueTermsId) ?? null
    : null;

  const chipLabel = selectedTerm
    ? formatTermLabel(selectedTerm)
    : valueTermsName ?? '';

  const chipNetDays = selectedTerm?.netDays;

  // ── Click-outside ─────────────────────────────────────────────────────────

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

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
          selectTerm(displayItems[highlightedIndex]);
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

  const selectTerm = (term: PaymentTerms) => {
    setOpen(false);
    setHighlightedIndex(-1);
    setQuery('');
    onChange({
      termsId: term.termsId,
      description: term.description,
      netDays: term.netDays,
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
    if (isLoading) {
      return (
        <DropdownState role="status" aria-live="polite">
          <Spinner aria-hidden="true" />
          Loading payment terms…
        </DropdownState>
      );
    }

    if (allTerms.length === 0) {
      return (
        <DropdownState>
          No payment terms configured. Add terms in Purchasing → Payment Terms.
        </DropdownState>
      );
    }

    if (displayItems.length === 0) {
      return <DropdownState>No terms match "{query}".</DropdownState>;
    }

    return displayItems.map((term, index) => (
      <DropdownItem
        key={term.termsId}
        id={`${listboxId}-option-${index}`}
        role="option"
        aria-selected={term.termsId === valueTermsId}
        $highlighted={index === highlightedIndex}
        onMouseDown={(e) => {
          e.preventDefault();
          selectTerm(term);
        }}
        onMouseEnter={() => setHighlightedIndex(index)}
      >
        <TermDescription>{term.description}</TermDescription>
        <TermNetDays>Net {term.netDays}</TermNetDays>
      </DropdownItem>
    ));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasSelection = Boolean(valueTermsId);

  return (
    <Wrapper ref={wrapperRef}>
      {hasSelection ? (
        <SelectedChip
          $hasError={hasError}
          $disabled={disabled}
          aria-label="Selected payment terms"
        >
          <ChipLabel title={chipLabel}>{chipLabel}</ChipLabel>
          {chipNetDays !== undefined && (
            <NetDaysBadge>Net {chipNetDays}</NetDaysBadge>
          )}
          {!disabled && (
            <ClearButton
              type="button"
              onClick={handleClear}
              aria-label={`Clear selected payment terms: ${chipLabel}`}
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
            aria-label="Search payment terms"
            aria-describedby={describedBy}
            autoComplete="off"
            placeholder="Search payment terms…"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            disabled={disabled}
            $hasError={hasError}
          />

          {open && (
            <Dropdown
              id={listboxId}
              role="listbox"
              aria-label="Payment terms options"
            >
              {renderDropdownContent()}
            </Dropdown>
          )}
        </>
      )}
    </Wrapper>
  );
}
