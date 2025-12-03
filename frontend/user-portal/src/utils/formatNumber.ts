/**
 * Number Formatting Utility
 *
 * Provides consistent number formatting with comma thousand separators
 * across the entire application.
 *
 * @module utils/formatNumber
 */

/**
 * Format Options
 */
export interface FormatNumberOptions {
  /** Number of decimal places (default: auto-detect or 0 for integers) */
  decimals?: number;
  /** Locale to use for formatting (default: 'en-US') */
  locale?: string;
  /** Minimum decimal places to show (default: 0) */
  minimumFractionDigits?: number;
  /** Maximum decimal places to show (default: 2) */
  maximumFractionDigits?: number;
  /** Prefix string (e.g., '$' for currency) */
  prefix?: string;
  /** Suffix string (e.g., '%', 'kg', 'ha') */
  suffix?: string;
}

/**
 * Format a number with comma thousand separators
 *
 * @param value - The number to format (can be number, string, null, or undefined)
 * @param options - Formatting options
 * @returns Formatted string with commas, or fallback value for null/undefined
 *
 * @example
 * formatNumber(10000)                    // "10,000"
 * formatNumber(1234.56)                  // "1,234.56"
 * formatNumber(1234.567, { decimals: 1 })// "1,234.6"
 * formatNumber(5000, { prefix: '$' })    // "$5,000"
 * formatNumber(25.5, { suffix: ' ha' })  // "25.5 ha"
 * formatNumber(null)                     // "0"
 * formatNumber(undefined)                // "0"
 */
export function formatNumber(
  value: number | string | null | undefined,
  options: FormatNumberOptions = {}
): string {
  // Handle null/undefined - return "0" instead of empty string for consistency
  if (value === null || value === undefined || value === '') {
    return '0';
  }

  // Convert string to number
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  // Handle NaN (invalid numbers)
  if (isNaN(numValue)) {
    return '0';
  }

  // Extract options with defaults
  const {
    decimals,
    locale = 'en-US',
    minimumFractionDigits,
    maximumFractionDigits,
    prefix = '',
    suffix = '',
  } = options;

  // Determine decimal places
  let minDecimals = minimumFractionDigits ?? 0;
  let maxDecimals = maximumFractionDigits ?? 2;

  if (decimals !== undefined) {
    // If decimals is explicitly set, use it for both min and max
    minDecimals = decimals;
    maxDecimals = decimals;
  } else {
    // Auto-detect: if number has decimals, show up to 2; if integer, show 0
    const hasDecimals = numValue % 1 !== 0;
    if (!hasDecimals) {
      maxDecimals = 0;
    }
  }

  // Format using Intl.NumberFormat (locale-aware, performant)
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(numValue);

  // Apply prefix and suffix
  return `${prefix}${formatted}${suffix}`;
}

/**
 * Format a currency value
 *
 * @param value - The number to format
 * @param currency - Currency code (default: 'USD')
 * @param locale - Locale to use (default: 'en-US')
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency(1234.56)           // "$1,234.56"
 * formatCurrency(1000, 'EUR', 'de-DE') // "1.000,00 €"
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  // Handle null/undefined
  if (value === null || value === undefined || value === '') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(0);
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(0);
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(numValue);
}

/**
 * Format a percentage value
 *
 * @param value - The number to format (0-100 scale)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 *
 * @example
 * formatPercentage(75)        // "75.0%"
 * formatPercentage(33.333, 2) // "33.33%"
 */
export function formatPercentage(
  value: number | string | null | undefined,
  decimals: number = 1
): string {
  return formatNumber(value, {
    decimals,
    suffix: '%',
  });
}

/**
 * Format a large number with compact notation (K, M, B)
 *
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted compact string
 *
 * @example
 * formatCompact(1234)      // "1.2K"
 * formatCompact(1234567)   // "1.2M"
 * formatCompact(1234567890)// "1.2B"
 */
export function formatCompact(
  value: number | string | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined || value === '') {
    return '0';
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
}

/**
 * Format a file size in bytes to human-readable format
 *
 * @param bytes - The number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted file size string
 *
 * @example
 * formatFileSize(1024)        // "1.00 KB"
 * formatFileSize(1048576)     // "1.00 MB"
 * formatFileSize(1073741824)  // "1.00 GB"
 */
export function formatFileSize(
  bytes: number | string | null | undefined,
  decimals: number = 2
): string {
  if (bytes === null || bytes === undefined || bytes === '') {
    return '0 Bytes';
  }

  const numBytes = typeof bytes === 'string' ? parseFloat(bytes) : bytes;

  if (isNaN(numBytes) || numBytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));

  return `${formatNumber(numBytes / Math.pow(k, i), { decimals })} ${sizes[i]}`;
}

/**
 * Format a duration in seconds to human-readable format
 *
 * @param seconds - The number of seconds
 * @returns Formatted duration string
 *
 * @example
 * formatDuration(65)    // "1m 5s"
 * formatDuration(3665)  // "1h 1m 5s"
 */
export function formatDuration(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === '') {
    return '0s';
  }

  const numSeconds = typeof seconds === 'string' ? parseFloat(seconds) : seconds;

  if (isNaN(numSeconds) || numSeconds < 0) {
    return '0s';
  }

  const hours = Math.floor(numSeconds / 3600);
  const minutes = Math.floor((numSeconds % 3600) / 60);
  const secs = Math.floor(numSeconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}
