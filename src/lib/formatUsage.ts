/**
 * Formatting helpers for token / cost usage shown across the Nolë chat
 * (message footer, thread stats badge, …).
 */

/** Compact token count, e.g. 1500 -> "1.5k", 2_300_000 -> "2.3M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** USD cost with adaptive precision, e.g. 0 -> "$0", 0.0021 -> "$0.0021". */
export function formatCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

/**
 * Same idea as `formatCost` but for aggregates, where three decimals on a
 * dollar-scale total reads as noise (`$12.400`). Kept separate rather than
 * folded into `formatCost`, whose current precision the thread badge and the
 * message footer depend on.
 */
export function formatCostCompact(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
