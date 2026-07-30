/**
 * AccountCombobox
 *
 * A searchable combobox for GL account selection. Designed for use inside
 * PostingSetupPage and ItemMappingPage (and any future finance forms) where
 * the full account list is already loaded by the page — filtering is done
 * entirely in-memory, so there is no network call per keystroke and no
 * debounce is needed.
 *
 * UX behaviours:
 *  - Single input mode: always renders a typeable <input>. No two-mode flip.
 *  - Unfocused + selection: the input displays the selected account label as
 *    its value so the user can see what is selected.
 *  - On focus: input text is selected-all so typing immediately replaces it.
 *    The dropdown opens showing the filtered list (or all accounts if empty).
 *  - Unfocused + no selection: placeholder text is shown (normal input UX).
 *  - Clear button: ✕ icon at the right edge of the input; clears selection
 *    and returns focus to the input.
 *  - Control badge: shown next to the input when a control account is
 *    selected; also shown in dropdown options.
 *  - Case-insensitive substring match against accountNumber OR accountName.
 *  - Empty query shows first 100 accounts with a "Type to search…" footer
 *    when the list is truncated.
 *  - "No accounts match" shown when query yields zero results.
 *  - takenIds: accounts already assigned elsewhere render muted + disabled.
 *  - Keyboard navigation: ↓/↑ moves highlight, Enter selects, Esc closes.
 *  - Click-outside closes without selecting.
 *  - ARIA: role="combobox" on input, role="listbox" on dropdown.
 *
 * Portal behaviour (Issue 2 fix):
 *  - The dropdown is rendered via ReactDOM.createPortal into document.body so
 *    it escapes any ancestor overflow:hidden constraint (e.g. table cells).
 *  - Position is calculated with getBoundingClientRect + fixed positioning.
 *  - Position is recalculated on open, window resize, and window scroll.
 */

import {
  useState,
  useEffect,
  useRef,
  useId,
  useMemo,
  useLayoutEffect,
  useCallback,
} from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import type { GLAccount } from '../../services/financeAccountsService';
import { DRAWER_LABELS, ACCOUNT_TYPE_LABELS } from '../../services/financeAccountsService';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of options visible when the query is empty. */
const MAX_UNFILTERED = 100;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AccountComboboxProps {
  /** Currently selected accountId (null if nothing selected). */
  valueAccountId: string | null;
  /** Full list of selectable accounts (already filtered to active+postable). */
  accounts: GLAccount[];
  /** AccountIds already taken by sibling fields — muted + disabled in list. */
  takenIds?: Set<string>;
  /** Called when the user picks an account or clears the selection. */
  onChange: (accountId: string | null) => void;
  /** Placeholder text when no selection is active. */
  placeholder?: string;
  /** Field id — used for htmlFor / aria-controls association. */
  id: string;
  /** aria-describedby reference (for inline errors or hints). */
  describedBy?: string;
  /** Visual error state — renders red border on the input. */
  hasError?: boolean;
  /** Disables the whole control (role-gated read-only view). */
  disabled?: boolean;
}

// ─── Dropdown portal position ─────────────────────────────────────────────────

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

// ─── Styled components — all transient props use $ prefix per project rules ───

const Wrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

/** Input-plus-icons row — gives us a flex container for the input and icons. */
const InputRow = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const ComboInput = styled.input<{ $hasError?: boolean; $disabled?: boolean; $hasSelection?: boolean }>`
  width: 100%;
  box-sizing: border-box;
  /* Right padding: 12px chevron gap (10px icon + 8px margin) + 26px clear btn + 4px gap = ~58px when selection exists, 38px otherwise */
  padding: 9px ${({ $hasSelection }) => ($hasSelection ? '64px' : '38px')} 9px 13px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.neutral[300])};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ $disabled, theme }) =>
    $disabled ? theme.colors.neutral[50] : theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'text')};
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};
  /* Clip overflow — the selected label can be very long */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) =>
      $hasError ? theme.colors.error : theme.colors.primary[500]};
    box-shadow: 0 0 0 3px
      ${({ $hasError, theme }) =>
        $hasError
          ? `${theme.colors.error}1a`
          : `${theme.colors.primary[500]}1a`};
  }
`;

/** Chevron arrow — absolute inside the InputRow, right side. */
const ChevronIcon = styled.span<{ $open: boolean; $disabled?: boolean; $hasSelection?: boolean }>`
  position: absolute;
  /* When there is a clear button, chevron sits to the right of it */
  right: ${({ $hasSelection }) => ($hasSelection ? '38px' : '12px')};
  top: 50%;
  transform: translateY(-50%) ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0deg)')};
  transition: transform 150ms ease-in-out;
  pointer-events: none;
  color: ${({ $disabled, theme }) =>
    $disabled ? theme.colors.textDisabled : theme.colors.textSecondary};
  font-size: 10px;
  line-height: 1;
  user-select: none;
`;

/** Small ✕ clear button inside the input, visible only when a selection exists. */
const ClearButton = styled.button`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
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
  font-size: 15px;
  cursor: pointer;
  transition: background 150ms ease-in-out, color 150ms ease-in-out;
  line-height: 1;
  padding: 0;

  &:hover {
    background: ${({ theme }) => `${theme.colors.error}1a`};
    color: ${({ theme }) => theme.colors.error};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.error};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/** Tiny "Control" pill shown next to the input when a control account is selected. */
const InputControlBadge = styled.span`
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.info};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;
  margin-left: 6px;
`;

/**
 * Dropdown rendered via portal into document.body.
 * Uses position:fixed so it escapes any ancestor overflow:hidden.
 * Position (top/left/width) is supplied as inline styles from JS.
 */
const Dropdown = styled.ul`
  position: fixed;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(59, 44, 24, 0.14);
  max-height: 280px;
  overflow-y: auto;
  z-index: 9999;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  /* Min-width ensures dropdown is never narrower than ~320px regardless of cell width */
  min-width: 320px;
`;

const DropdownItem = styled.li<{ $highlighted?: boolean; $taken?: boolean }>`
  padding: 9px 14px;
  cursor: ${({ $taken }) => ($taken ? 'not-allowed' : 'pointer')};
  background: ${({ $highlighted, theme }) =>
    $highlighted ? theme.colors.surface : 'transparent'};
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 80ms ease-in-out;
  opacity: ${({ $taken }) => ($taken ? 0.45 : 1)};

  &:hover {
    background: ${({ $taken, theme }) => ($taken ? 'transparent' : theme.colors.surface)};
  }
`;

const OptionText = styled.span<{ $taken?: boolean }>`
  font-size: 13px;
  color: ${({ $taken, theme }) => ($taken ? theme.colors.textDisabled : theme.colors.textPrimary)};
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** Tiny "Control" pill shown next to control accounts in the dropdown. */
const ControlBadge = styled.span`
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.info};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;
`;

const DropdownState = styled.li`
  padding: 12px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`;

const TruncationFooter = styled.li`
  padding: 8px 14px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-align: center;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  margin-top: 2px;
`;

/**
 * Drawer + account-type hint pill shown in the dropdown.
 * Format: "Assets · asset" — helps users quickly confirm they are picking
 * the correct type of account (e.g. AR control must be ASSETS/asset).
 */
const DrawerTypeBadge = styled.span`
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
  letter-spacing: 0.2px;
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountCombobox({
  valueAccountId,
  accounts,
  takenIds,
  onChange,
  placeholder = '— Not set —',
  id,
  describedBy,
  hasError = false,
  disabled = false,
}: AccountComboboxProps) {
  const listboxId = useId();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition>({ top: 0, left: 0, width: 0 });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Derive selected account ────────────────────────────────────────────────

  const selectedAccount = useMemo(
    () => (valueAccountId ? accounts.find((a) => a.accountId === valueAccountId) ?? null : null),
    [valueAccountId, accounts],
  );

  const selectedLabel = selectedAccount
    ? `${selectedAccount.accountNumber} — ${selectedAccount.accountName}`
    : null;

  const hasSelection = Boolean(valueAccountId && selectedLabel);

  // ── Input display value ────────────────────────────────────────────────────
  // While open (user is typing), show the live query.
  // While closed and a selection exists, show the selected label.
  // While closed and no selection, query is '' so placeholder shows naturally.
  const inputDisplayValue = open ? query : (selectedLabel ?? query);

  // ── Filter accounts by query ───────────────────────────────────────────────

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.accountNumber.toLowerCase().includes(q) ||
        a.accountName.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const isTruncated = !query.trim() && accounts.length > MAX_UNFILTERED;
  const visibleAccounts = isTruncated
    ? filteredAccounts.slice(0, MAX_UNFILTERED)
    : filteredAccounts;

  // ── Portal dropdown positioning ────────────────────────────────────────────

  const updateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  // Calculate position immediately when dropdown opens (useLayoutEffect avoids flicker).
  useLayoutEffect(() => {
    if (open) {
      updateDropdownPosition();
    }
  }, [open, updateDropdownPosition]);

  // Re-calculate on resize or scroll while open.
  useEffect(() => {
    if (!open) return;

    const handleResize = () => updateDropdownPosition();
    const handleScroll = () => updateDropdownPosition();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { capture: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [open, updateDropdownPosition]);

  // ── Click-outside closes dropdown ─────────────────────────────────────────

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

  // ── Reset highlight when visible list changes ──────────────────────────────

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleFocus = () => {
    if (!disabled) {
      setOpen(true);
      // Reason: previously the input went blank on focus because we showed
      // `query` (empty) instead of the selected label. Now we seed query
      // with the selected label so the user sees what's currently picked,
      // then select() highlights it so typing replaces.
      if (selectedLabel && query === '') {
        setQuery(selectedLabel);
      }
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
    }
  };

  const handleBlur = () => {
    // When focus leaves the input (not to the dropdown — mousedown on dropdown
    // items calls e.preventDefault() to avoid blur), close and reset query.
    // Small timeout lets the mousedown on a list item fire first.
    setTimeout(() => {
      // Check that focus is not inside the wrapper (keyboard tab away).
      if (!wrapperRef.current?.contains(document.activeElement)) {
        setOpen(false);
        setHighlightedIndex(-1);
        setQuery('');
      }
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < visibleAccounts.length - 1 ? prev + 1 : prev,
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;

      case 'Enter': {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visibleAccounts.length) {
          const account = visibleAccounts[highlightedIndex];
          const isTaken =
            takenIds?.has(account.accountId) && account.accountId !== valueAccountId;
          if (!isTaken) {
            selectAccount(account);
          }
        }
        break;
      }

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

  const selectAccount = (account: GLAccount) => {
    onChange(account.accountId);
    setOpen(false);
    setHighlightedIndex(-1);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(null);
    setQuery('');
    setOpen(false);
    setHighlightedIndex(-1);
    // Return focus to the input so the field remains reachable by keyboard.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // ── Dropdown content ───────────────────────────────────────────────────────

  const renderDropdownContent = () => {
    if (visibleAccounts.length === 0) {
      return <DropdownState>No accounts match.</DropdownState>;
    }

    return (
      <>
        {visibleAccounts.map((account, index) => {
          const isTaken =
            takenIds?.has(account.accountId) && account.accountId !== valueAccountId;
          const isHighlighted = index === highlightedIndex;
          const label = `${account.accountNumber} — ${account.accountName}`;
          // Drawer + type hint: "Assets · asset" — helps confirm correct account kind.
          const drawerLabel = DRAWER_LABELS[account.drawer] ?? account.drawer;
          const typeLabel = ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType;
          const drawerTypeHint = `${drawerLabel} · ${typeLabel}`;

          return (
            <DropdownItem
              key={account.accountId}
              role="option"
              aria-selected={account.accountId === valueAccountId}
              aria-disabled={isTaken}
              id={`${listboxId}-option-${index}`}
              $highlighted={isHighlighted}
              $taken={isTaken}
              onMouseDown={(e) => {
                // mousedown fires before blur — prevent focus loss on the input.
                e.preventDefault();
                if (!isTaken) {
                  selectAccount(account);
                }
              }}
              onMouseEnter={() => {
                if (!isTaken) setHighlightedIndex(index);
              }}
              title={isTaken ? 'Already assigned to another field' : `${label} (${drawerTypeHint})`}
            >
              <OptionText $taken={isTaken}>{label}</OptionText>
              {/* Drawer + account type hint — critical UX for posting setup so users
                  can quickly confirm they are picking the right category of account. */}
              <DrawerTypeBadge aria-label={`Account type: ${drawerTypeHint}`}>
                {drawerTypeHint}
              </DrawerTypeBadge>
              {account.isControlAccount && (
                <ControlBadge aria-label="Control account">Control</ControlBadge>
              )}
              {isTaken && (
                <OptionText $taken style={{ fontSize: '11px', flex: 'none' }}>
                  taken
                </OptionText>
              )}
            </DropdownItem>
          );
        })}
        {isTruncated && (
          <TruncationFooter>
            Type to search through all {accounts.length} accounts
          </TruncationFooter>
        )}
      </>
    );
  };

  // ── Portal dropdown ────────────────────────────────────────────────────────

  const dropdownPortal = open
    ? ReactDOM.createPortal(
        <Dropdown
          id={listboxId}
          role="listbox"
          aria-label="Account options"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            // Use max() equivalent: respect the natural input width but never
            // go below 320px so long labels have room.
            width: Math.max(dropdownPos.width, 320),
          }}
        >
          {renderDropdownContent()}
        </Dropdown>,
        document.body,
      )
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Wrapper ref={wrapperRef}>
      {/* Always-visible control badge — shown beside the input when a control account is selected */}
      {hasSelection && selectedAccount?.isControlAccount && !open && (
        <InputControlBadge aria-label="Control account">Control</InputControlBadge>
      )}

      <InputRow>
        <ComboInput
          ref={inputRef}
          id={id}
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
          aria-describedby={describedBy}
          aria-invalid={hasError}
          autoComplete="off"
          placeholder={placeholder}
          value={inputDisplayValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          $hasError={hasError}
          $disabled={disabled}
          $hasSelection={hasSelection}
          title={hasSelection && !open ? (selectedLabel ?? undefined) : undefined}
        />

        <ChevronIcon
          aria-hidden="true"
          $open={open}
          $disabled={disabled}
          $hasSelection={hasSelection}
        >
          ▾
        </ChevronIcon>

        {hasSelection && !disabled && (
          <ClearButton
            type="button"
            onMouseDown={handleClear}
            aria-label={`Clear selected account ${selectedLabel}`}
            title="Clear selection"
            tabIndex={-1}
          >
            ×
          </ClearButton>
        )}
      </InputRow>

      {dropdownPortal}
    </Wrapper>
  );
}
