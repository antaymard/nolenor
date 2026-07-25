// Canonical value format for the `date` inline content (the date pill).
//
// Stored as an ISO calendar date, `YYYY-MM-DD` — sortable, unambiguous, and
// directly usable by the agent. Documents written before this change stored
// `Date.prototype.toDateString()` output ("Fri Jul 24 2026"), so every read
// path goes through `parseDatePillValue`, which accepts both. Nothing needs to
// be migrated: a legacy pill keeps rendering, and is rewritten in ISO the next
// time its date is edited.
//
// Everything here is calendar-date arithmetic in LOCAL time on purpose. A pill
// means "this day", not "this instant": `new Date("2026-07-24")` parses as UTC
// midnight, which is the previous day in every negative-offset timezone, so the
// ISO branch is parsed field by field instead.

/** `YYYY-MM-DD`, the canonical stored form. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Format a Date as `YYYY-MM-DD` using its LOCAL calendar fields. */
export function toIsoDateString(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a stored pill value into a local-midnight Date.
 * Accepts the canonical `YYYY-MM-DD` and any legacy value `Date` understands
 * (notably the old `toDateString()` output). Returns null when unparseable.
 */
export function parseDatePillValue(value: string | undefined | null): Date | null {
  if (!value) return null;

  const iso = ISO_DATE_RE.exec(value);
  if (iso) {
    const [, year, month, day] = iso;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    // Rejects impossible dates like 2026-02-31, which JS would roll over.
    return Number.isNaN(date.getTime()) || date.getMonth() !== Number(month) - 1
      ? null
      : date;
  }

  const legacy = new Date(value);
  return Number.isNaN(legacy.getTime()) ? null : legacy;
}

/**
 * Canonical `YYYY-MM-DD` form of a stored value, or "" when unparseable.
 * Used on every serialization boundary so legacy values reach the agent — and
 * the search index — already normalized.
 */
export function normalizeDatePillValue(value: string | undefined | null): string {
  const date = parseDatePillValue(value);
  return date ? toIsoDateString(date) : "";
}
