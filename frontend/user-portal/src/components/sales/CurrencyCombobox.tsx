/**
 * CurrencyCombobox — T-201.3
 *
 * A constrained dropdown for selecting an ISO 4217 currency code.
 * No backend master; uses a hardcoded list of GCC + common currencies.
 *
 * The tenant's base currency (from useFinanceCompanies → first row's defaultCurrency)
 * appears at the top with a "Base" badge. Remaining currencies follow in alphabetical order.
 *
 * Props follow the same convention as CustomerCombobox / SalesItemCombobox:
 *  - Public props use readable names (no $ prefix)
 *  - Styled-component transient props use the $ prefix (UI-Standards.md)
 *
 * Behaviour:
 *  - Click the trigger to open; click a row or press Enter to select.
 *  - Esc or click-outside closes without changing the value.
 *  - Keyboard: ↓/↑ to navigate, Enter to select, Esc to close.
 *  - ARIA: role="combobox" + role="listbox" for screen-reader support.
 */

import {
  useState,
  useRef,
  useEffect,
  useId,
} from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'lucide-react';
import { useTenantBaseCurrency } from '../../hooks/queries/useTenantBaseCurrency';

// ─── Currency data ──────────────────────────────────────────────────────────────

/** Full set of supported currencies (GCC + common internationals). */
const SUPPORTED_CURRENCIES = [
  'AED', 'BHD', 'EUR', 'GBP', 'INR', 'KWD', 'OMR', 'PKR', 'QAR', 'SAR', 'USD',
] as const;

type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  AED: 'UAE Dirham',
  BHD: 'Bahraini Dinar',
  EUR: 'Euro',
  GBP: 'British Pound',
  INR: 'Indian Rupee',
  KWD: 'Kuwaiti Dinar',
  OMR: 'Omani Rial',
  PKR: 'Pakistani Rupee',
  QAR: 'Qatari Riyal',
  SAR: 'Saudi Riyal',
  USD: 'US Dollar',
};

// ─── Props ──────────────────────────────────────────────────────────────────────

export interface CurrencyComboboxProps {
  /** Currently selected ISO 4217 code, e.g. "AED". */
  value: string;
  /** Called when the user picks a currency. Passes the 3-letter code. */
  onChange: (code: string) => void;
  /** Disables the control (e.g. when the form is submitting or locked). */
  disabled?: boolean;
  /** Error state — renders a red border. */
  hasError?: boolean;
  /** aria-describedby forwarded to the trigger button. */
  describedBy?: string;
}

// ─── Styled components ────────────────────────────────────────────────────────
// All transient props use the $ prefix per project rules (UI-Standards.md).

const Wrapper = styled.div`
  position: relative;
`;

const TriggerButton = styled.button<{ $hasError?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid ${({ $hasError, theme }) =>
    $hasError ? theme.colors.error : theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ $disabled, theme }) =>
    $disabled ? theme.colors.surface : theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  text-align: left;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.7 : 1)};
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.primary[500])};
    box-shadow: 0 0 0 2px
      ${({ $hasError, theme }) =>
        $hasError ? `${theme.colors.error}1A` : `${theme.colors.primary[500]}1A`};
  }
`;

const TriggerContent = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
`;

const CodeBadge = styled.span`
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.3px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CurrencyLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChevronIcon = styled(ChevronDown)<{ $open: boolean }>`
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: transform 150ms ease-in-out;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0deg)')};
`;

const Dropdown = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  max-height: 280px;
  overflow-y: auto;
  z-index: 1200;
  list-style: none;
  margin: 0;
  padding: 4px 0;
`;

const SectionDivider = styled.li`
  padding: 4px 12px 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSecondary};
  opacity: 0.7;
  user-select: none;

  & + & {
    margin-top: 4px;
    border-top: 1px solid ${({ theme }) => theme.colors.neutral[100]};
    padding-top: 8px;
  }
`;

const CurrencyItem = styled.li<{ $highlighted?: boolean; $isBase?: boolean }>`
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

const ItemCode = styled.span`
  font-weight: 700;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 36px;
`;

const ItemName = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  flex: 1;
`;

const BaseBadge = styled.span`
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 1px 6px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.primary[100]};
  color: ${({ theme }) => theme.colors.primary[700]};
  flex-shrink: 0;
`;

// ─── Component ─────────────────────────────────────────────────────────────────

export function CurrencyCombobox({
  value,
  onChange,
  disabled = false,
  hasError = false,
  describedBy,
}: CurrencyComboboxProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const baseCurrency = useTenantBaseCurrency();

  // Build ordered list: base currency first, then remaining currencies alphabetically.
  const otherCurrencies = SUPPORTED_CURRENCIES.filter((c) => c !== baseCurrency).sort();
  const orderedCurrencies = [baseCurrency as SupportedCurrency, ...otherCurrencies];

  // If the currently-selected value is not in our list, add it for display.
  const displayValue = value || baseCurrency;
  const displayLabel =
    CURRENCY_LABELS[displayValue as SupportedCurrency] ?? displayValue;

  // ── Click-outside handler ──────────────────────────────────────────────────
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTriggerClick = () => {
    if (disabled) return;
    const newOpen = !open;
    setOpen(newOpen);
    if (newOpen) {
      // Pre-select the currently active item.
      const idx = orderedCurrencies.indexOf(displayValue as SupportedCurrency);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          const idx = orderedCurrencies.indexOf(displayValue as SupportedCurrency);
          setHighlightedIndex(idx >= 0 ? idx : 0);
        } else if (highlightedIndex >= 0) {
          selectCurrency(orderedCurrencies[highlightedIndex]);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlightedIndex(0);
        } else {
          setHighlightedIndex((prev) =>
            prev < orderedCurrencies.length - 1 ? prev + 1 : prev,
          );
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (open) {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        }
        break;

      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
        break;

      default:
        break;
    }
  };

  const selectCurrency = (code: SupportedCurrency) => {
    onChange(code);
    setOpen(false);
    setHighlightedIndex(-1);
    triggerRef.current?.focus();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Wrapper ref={wrapperRef}>
      <TriggerButton
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && highlightedIndex >= 0
            ? `${listboxId}-option-${highlightedIndex}`
            : undefined
        }
        aria-haspopup="listbox"
        aria-label={`Currency: ${displayValue}`}
        aria-describedby={describedBy}
        $hasError={hasError}
        $disabled={disabled}
        disabled={disabled}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
      >
        <TriggerContent>
          <CodeBadge>{displayValue}</CodeBadge>
          <CurrencyLabel>{displayLabel}</CurrencyLabel>
        </TriggerContent>
        <ChevronIcon size={16} $open={open} aria-hidden="true" />
      </TriggerButton>

      {open && (
        <Dropdown id={listboxId} role="listbox" aria-label="Select currency">
          {/* Base currency section */}
          <SectionDivider aria-hidden="true">Base — recommended</SectionDivider>
          <CurrencyItem
            key={baseCurrency}
            id={`${listboxId}-option-0`}
            role="option"
            aria-selected={displayValue === baseCurrency}
            $highlighted={highlightedIndex === 0}
            $isBase
            onMouseDown={(e) => {
              e.preventDefault();
              selectCurrency(baseCurrency as SupportedCurrency);
            }}
            onMouseEnter={() => setHighlightedIndex(0)}
          >
            <ItemCode>{baseCurrency}</ItemCode>
            <ItemName>{CURRENCY_LABELS[baseCurrency as SupportedCurrency] ?? baseCurrency}</ItemName>
            <BaseBadge>Base</BaseBadge>
          </CurrencyItem>

          {/* Other currencies */}
          {otherCurrencies.length > 0 && (
            <SectionDivider aria-hidden="true">Other currencies</SectionDivider>
          )}
          {otherCurrencies.map((code, i) => {
            const globalIndex = i + 1; // +1 because base is index 0
            return (
              <CurrencyItem
                key={code}
                id={`${listboxId}-option-${globalIndex}`}
                role="option"
                aria-selected={displayValue === code}
                $highlighted={highlightedIndex === globalIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCurrency(code as SupportedCurrency);
                }}
                onMouseEnter={() => setHighlightedIndex(globalIndex)}
              >
                <ItemCode>{code}</ItemCode>
                <ItemName>{CURRENCY_LABELS[code as SupportedCurrency] ?? code}</ItemName>
              </CurrencyItem>
            );
          })}
        </Dropdown>
      )}
    </Wrapper>
  );
}
