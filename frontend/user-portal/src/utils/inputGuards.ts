/**
 * Input Guards
 *
 * Reusable sets of props to attach to <input> elements that need stricter
 * validation than what the browser's built-in `type="number"` provides.
 *
 * `type="number"` accepts 'e'/'E' (scientific notation) and '+'/'-' (sign)
 * by default. Spread these prop bundles onto an input to block the keys and
 * paste patterns that shouldn't be allowed for the field's value type.
 *
 * Usage:
 *   <input
 *     {...positiveNumberInputProps}
 *     step="0.01"
 *     min="0.01"
 *     value={value}
 *     onChange={(e) => setValue(e.target.value)}
 *   />
 */

import type React from 'react';

const POSITIVE_DECIMAL_PATTERN = /^\d*\.?\d*$/;
const POSITIVE_INTEGER_PATTERN = /^\d*$/;

function blockKeys(keys: ReadonlySet<string>) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (keys.has(e.key)) {
      e.preventDefault();
    }
  };
}

function blockPasteUnless(pattern: RegExp) {
  return (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pattern.test(pasted)) {
      e.preventDefault();
    }
  };
}

/**
 * Positive decimals only: digits and optional single '.'.
 * Rejects 'e', 'E', '+', '-' (scientific notation and sign characters).
 * Use for quantities, weights, prices — anything that can't be negative.
 */
export const positiveNumberInputProps = {
  type: 'number' as const,
  inputMode: 'decimal' as const,
  onKeyDown: blockKeys(new Set(['e', 'E', '+', '-'])),
  onPaste: blockPasteUnless(POSITIVE_DECIMAL_PATTERN),
};

/**
 * Positive integers only: digits, no decimals, no sign, no scientific notation.
 * Use for counts — plant counts, harvest counts, quantities of discrete items.
 */
export const positiveIntegerInputProps = {
  type: 'number' as const,
  inputMode: 'numeric' as const,
  onKeyDown: blockKeys(new Set(['e', 'E', '+', '-', '.'])),
  onPaste: blockPasteUnless(POSITIVE_INTEGER_PATTERN),
};
