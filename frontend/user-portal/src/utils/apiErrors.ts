/**
 * Shared API error parsing utilities.
 *
 * Extracted from VendorsPage so all forms can reuse the same
 * FastAPI 422 → per-field error mapping logic.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of a single item in a FastAPI 422 detail array. */
export interface ApiErrorItem {
  type: string;
  loc: (string | number)[];
  msg: string;
  ctx?: Record<string, unknown>;
  input?: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a FastAPI 422 detail array into a per-field error map.
 *
 * Strategy:
 * - `loc` is typically `["body", "field_name"]` or `["body", "nested", "field_name"]`.
 * - Take the last element of `loc` as the raw field key.
 * - Map via the caller-supplied `fieldMap` (snake_case backend key → camelCase form key).
 * - Errors that cannot be mapped accumulate in the special `__banner__` key
 *   for display in a top-level error banner.
 *
 * @param detail     The raw detail array from a 422 response.
 * @param fieldMap   Map of `{ backendFieldName: formFieldKey }`.
 * @returns          Record of `{ formFieldKey: errorMessage }` plus optional `__banner__`.
 */
export function parseApiErrors(
  detail: ApiErrorItem[],
  fieldMap: Record<string, string>
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const item of detail) {
    const rawField = String(item.loc[item.loc.length - 1]);
    const fieldKey = fieldMap[rawField];

    // Produce a human-readable message from the pydantic msg.
    const message =
      item.msg
        .replace(/^Value error,\s*/i, '')
        .replace(/^String should match pattern\s*.*$/i, 'Invalid format.')
        .replace(/^Field required$/i, 'This field is required.')
        .trim() || 'Invalid value.';

    if (fieldKey) {
      errors[fieldKey] = message;
    } else {
      // Unmapped field — accumulate into banner text.
      const prev = errors['__banner__'];
      errors['__banner__'] = prev
        ? `${prev} | ${rawField}: ${message}`
        : `${rawField}: ${message}`;
    }
  }

  return errors;
}
