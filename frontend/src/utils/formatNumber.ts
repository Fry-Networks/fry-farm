/**
 * Format a USD value with abbreviated suffixes for large numbers.
 * < $1,000      → "$543.21"
 * $1K–$999K     → "$543.2K"
 * $1M–$999M     → "$22.4M"
 * $1B+          → "$1.2B"
 */
export function formatUsdAbbreviated(value: number | null | undefined): string {
  if (value == null || isNaN(value) || value === 0) return '$0.00';
  if (value < 0) return '-' + formatUsdAbbreviated(-value);
  if (value < 1_000) return `$${value.toFixed(2)}`;
  if (value < 1_000_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value < 1_000_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}
